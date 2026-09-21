import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { createSerialWrites } from '../src/shell/save-coordinator.js';
import { createWorkspacePersistence } from '../src/shell/workspace-persistence.js';
import { createQueueLoader, rebaseQueueTransition } from '../src/shell/queue-loader.js';
import { createQueueSession, advanceQueue, addQueueItem } from '../src/engine/session-queue.js';
import { createEmptySourceWorkspace, upsertSourceWorkspaceEntry, serializeSourceWorkspace } from '../src/engine/source-workspace.js';
import { ensureIdentity } from '../src/engine/files.js';
import { parseDocument } from '../src/engine/parse.js';
import { scheduleDocument } from '../src/engine/schedule.js';
import { documentToMusicXML } from '../src/engine/western.js';
import { getTal } from '../src/engine/tala.js';
import { player } from './player-playback-lifecycle.smoke.js';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function timers() {
  let now=0, id=0; const tasks=new Map();
  return { setTimer(fn, delay) { tasks.set(++id,{fn,at:now+delay}); return id; }, clearTimer(i) { tasks.delete(i); },
    tick(ms) { now+=ms; for (const [i,t] of tasks) if(t.at<=now) { tasks.delete(i); t.fn(); } } };
}
const storage = () => { const data = new Map(); return { getItem:k=>data.get(k)||null, setItem:(k,v)=>data.set(k,v), removeItem:k=>data.delete(k) }; };
const project = { manifest:{id:'audit-project'} };
const workspace = position => upsertSourceWorkspaceEntry(createEmptySourceWorkspace(),'source-recording-a',{lastPosition:position,markers:[{t:1,label:'Keep me'}]});
async function saveHarness() {
  const app=await read('src/shell/App.jsx');
  const body=app.split('  const doSave = ')[1].split('\n\n  const doNewProject')[0].trim().replace(/;$/,'');
  const c={ project:null, textRef:{current:'tal: tintal\n\nS\n'}, documentSessionRef:{current:0}, handleRef:{current:{}},
    ensureIdentity, clock:{now:()=> '2026-09-20',uuid:()=> 'audit-id'}, suggestName:()=> 'audit.md', writes:createSerialWrites(),saveActions:createSerialWrites(),
    setText(value){c.textRef.current=value;}, setLastSaved(value){c.lastSaved=value;},setHandle(){},setFileName(){},recordSavedDocument(){},setNotice(){},
    io:{save:async()=>null}, };
  return { c, save:new Function('ctx',`with(ctx) { return (${body}); }`)(c) };
}
const xml = source => {
  const parsed=parseDocument(source); assert.deepEqual(parsed.problems,[]);
  return new JSDOM(documentToMusicXML(parsed.doc),{contentType:'text/xml'}).window.document;
};
const beats = doc => [...doc.querySelectorAll('duration')].reduce((sum,e)=>sum+Number(e.textContent),0)/Number(doc.querySelector('divisions').textContent);
export const smokes = [
  {name:'audit project save: delayed saves retain newer notation and live recording settings',async fn(){
    const {c}=await saveHarness();
    const app=await read('src/shell/App.jsx');
    const body=app.split('  const doSaveProject = ')[1].split('\n\n  const doSave = ')[0].trim().replace(/;$/,'');
    Object.assign(c,{project:{...project,name:'Audit'}, projectMediaRef:{current:{}}, projectWorkspaceRef:{current:workspace(1)},
      mediaWithCurrentSources:value=>value,parseAudioLinkDocument:()=>({links:[]}),
      workspacePersistence:{flush:async()=>{},saved(){}},setProject(){},setProjectMedia(){},});
    const gates=[deferred(),deferred()],snapshots=[];
    c.projectIO={save:async(_,value)=>{snapshots.push(value);await gates[snapshots.length-1].promise;return {manifest:project.manifest,workspace:value.workspace};}};
    const save=new Function('ctx',`with(ctx) { return (${body}); }`)(c);
    const first=save();await turn();
    c.setText(c.textRef.current.replace('\nS\n','\nS R\n'));c.projectWorkspaceRef.current=workspace(9);
    const second=save();assert.equal(snapshots.length,1);
    gates[0].resolve();await first;await turn();assert.equal(snapshots.length,2);
    assert.match(c.textRef.current,/S R/);assert.notEqual(c.lastSaved,c.textRef.current);
    gates[1].resolve();await second;assert.equal(c.lastSaved,c.textRef.current);
    assert.equal(c.projectWorkspaceRef.current.sources['source-recording-a'].lastPosition,9);
    assert.equal(snapshots[1].workspace.sources['source-recording-a'].lastPosition,9);
  }},
  {name:'audit workspace: an older failed write cannot be retried over a newer successful save',async fn(){
    const serial=createSerialWrites(),gates=[deferred(),deferred()],values=[];
    const service=createWorkspacePersistence({storage:storage(),...timers(),onError(){},write:(_,value)=>serial.run(()=>{values.push(value);return gates[values.length-1].promise;})});
    service.schedule(project,workspace(1));const first=service.flush();await turn();
    service.schedule(project,workspace(2));const second=service.flush();
    gates[0].reject(new Error('temporary disk failure'));await first;await turn();
    gates[1].resolve();await second;await service.flush();
    assert.deepEqual(values.map(v=>JSON.parse(v).sources['source-recording-a'].lastPosition),[1,2]);
  }},
  {name:'audit audio: oversized decoded layout skips a whole-file read and keeps streaming available',async fn(){
    const t=await player();try{
      t.w.URL.createObjectURL=()=> 'blob:http://localhost/large';t.w.URL.revokeObjectURL=()=>{};
      let reads=0;
      t.w.SargamAudioMetadata={inspect:async()=>({duration:7200,sampleRate:48000,channels:2}),fits:()=>false};
      t.p.loadFile({name:'long.m4a',type:'audio/mp4',size:100,arrayBuffer:async()=>{reads++;return new ArrayBuffer(100);}});
      await turn();assert.equal(reads,0);assert.equal(t.p.record().native,'unavailable');assert.equal(t.p.state.decoded,null);
      Object.defineProperty(t.p.media,'duration',{value:7200,configurable:true});t.p.media.dispatchEvent(new t.w.Event('loadedmetadata'));
      assert.equal(await t.p.togglePlay(),true);
    }finally{t.close();}
  }},

  {name:'audit save: typing during a delayed save survives and remains dirty',async fn(){
    const {c,save}=await saveHarness(), write=deferred(); c.io.save=()=>write.promise;
    const done=save(); c.setText(c.textRef.current.replace('\nS\n','\nS R\n'));
    write.resolve({handle:{},name:'audit.md',method:'fsa'}); await done;
    assert.match(c.textRef.current,/S R/); assert.notEqual(c.textRef.current,c.lastSaved);
  }},
  {name:'audit save: two saves write in request order and retain one identity',async fn(){
    const {c,save}=await saveHarness(), first=deferred(), written=[];
    c.io.save=async value=>{written.push(value); if(written.length===1) await first.promise; return {handle:{},name:'audit.md',method:'fsa'};};
    const a=save(); c.setText(c.textRef.current.replace('\nS\n','\nS R\n')); const b=save();
    assert.equal(written.length,1); first.resolve(); await Promise.all([a,b]);
    assert.equal(written.length,2); assert.match(written[1],/S R/); assert.equal(c.lastSaved,c.textRef.current);
    assert.deepEqual(written.map(s=>s.match(/^id: (.+)$/m)[1]),['audit-id','audit-id']);
  }},
  {name:'audit save: completion after changing documents cannot mark the new document saved',async fn(){
    const {c,save}=await saveHarness(), write=deferred(); c.io.save=()=>write.promise;
    const done=save(); c.documentSessionRef.current++; c.setText('new document');
    write.resolve({handle:{},name:'old.md',method:'fsa'}); await done;
    assert.equal(c.textRef.current,'new document'); assert.equal(c.lastSaved,undefined);
  }},
  {name:'audit writes: rejection releases the queue without skipping subsequent writes',async fn(){
    const q=createSerialWrites(); const a=q.run(()=>Promise.reject(new Error('disk'))); const b=q.run(()=>42);
    await assert.rejects(a,/disk/); assert.equal(await b,42);
  }},
  {name:'audit workspace: continuous playback still checkpoints within 1200 ms',async fn(){
    const clock=timers(), written=[], service=createWorkspacePersistence({storage:storage(),write:async(_,json)=>written.push(json),...clock});
    for(let i=0;i<40;i++){service.schedule(project,workspace(i/4));clock.tick(250);await turn();}
    assert.ok(written.length>=7); assert.match(written.at(-1),/Keep me/); await service.flush();
    assert.equal(JSON.parse(written.at(-1)).sources['source-recording-a'].lastPosition,9.75);
  }},
  {name:'audit workspace: pending edits recover only over the matching project-folder base',async fn(){
    const disk=createEmptySourceWorkspace(), store=storage(), clock=timers();
    const service=createWorkspacePersistence({storage:store,write:async()=>{},...clock});
    service.recover(project,disk); service.schedule(project,workspace(5));
    const reopen=()=>createWorkspacePersistence({storage:store,write:async()=>{},...timers()});
    assert.equal(reopen().recover(project,disk).sources['source-recording-a'].lastPosition,5);
    assert.equal(reopen().recover(project,workspace(12)).sources['source-recording-a'].lastPosition,12);
  }},
  {name:'audit workspace: recovery survives an older write while a newer write is pending',async fn(){
    const store=storage(), serial=createSerialWrites(), gates=[deferred(),deferred()], values=[];
    const service=createWorkspacePersistence({storage:store,...timers(),write:(_,value)=>serial.run(()=>{values.push(value);return gates[values.length-1].promise;})});
    service.schedule(project,workspace(1)); const a=service.flush();
    service.schedule(project,workspace(2)); const b=service.flush();
    gates[0].resolve(); await a; await turn();
    const recovered=createWorkspacePersistence({storage:store,write:async()=>{},...timers()}).recover(project,workspace(1));
    assert.equal(recovered.sources['source-recording-a'].lastPosition,2);
    gates[1].resolve();await b;
    assert.deepEqual(values.map(v=>JSON.parse(v).sources['source-recording-a'].lastPosition),[1,2]);
  }},
  {name:'audit queue: load failure and timeout preserve the prior session',fn(){
    const before=createQueueSession({current:{libraryId:'a'},upcoming:[{libraryId:'b',sourceUrl:'/b'}]});
    for(const failure of ['send','timeout','error']){
      const clock=timers(),errors=[];let commits=0;
      const loader=createQueueLoader({send:()=>failure!=='send',commit:()=>commits++,workspace:()=>null,onError:e=>errors.push(e),...clock,timeoutMs:10});
      loader.start(before,advanceQueue(before),'request');
      if(failure==='timeout')clock.tick(10);
      if(failure==='error')loader.observe({loadRequestId:'request',error:'404'});
      assert.equal(commits,0);assert.equal(loader.pending,false);assert.equal(errors.length,1);
      assert.equal(loader.blocksSync({loadRequestId:'request'}),true);
      assert.equal(loader.blocksSync({loadRequestId:'new-local-source'}),false);
    }
  }},
  {name:'audit queue: matching readiness and workspace acknowledgement precede commit and Play',fn(){
    const before=createQueueSession({current:{libraryId:'a'},upcoming:[{libraryId:'b',sourceUrl:'/b'}]});
    const calls=[];let committed=null;
    const loader=createQueueLoader({send:(type,payload)=>{calls.push(type);return true;},commit:(_,after)=>{committed=after;calls.push('commit');},workspace:()=>({lastPosition:12}),onError:assert.fail,...timers()});
    loader.start(before,advanceQueue(before),'request');
    const state={loadRequestId:'request',source:{id:'b'},duration:60,readyForPlayback:true};
    loader.observe({...state,loadRequestId:'stale'});assert.deepEqual(calls,['load-library-source']);
    loader.observe(state);assert.equal(committed,null);assert.equal(calls.at(-1),'apply-workspace');
    loader.observe({...state,workspaceRequestId:'request'});
    assert.equal(committed.current.libraryId,'b');assert.deepEqual(calls,['load-library-source','apply-workspace','commit','play']);
  }},
  {name:'audit queue: editing upcoming recordings during load is preserved on commit',fn(){
    const before=createQueueSession({current:{libraryId:'a'},upcoming:[{libraryId:'b',sourceUrl:'/b'}]});
    const result=advanceQueue(before),current=addQueueItem(before,{libraryId:'c',sourceUrl:'/c'});
    const after=rebaseQueueTransition(before,result.session,current);
    assert.equal(after.current.libraryId,'b');assert.deepEqual(after.upcoming.map(i=>i.libraryId),['c']);
  }},
  {name:'audit export: emits meter changes, including 17/8 and free time',fn(){
    const source='tal: tintal\n\nSthayi\nS R\n\ntal: rupak\nAntara\nG m\n\ntal: jhampak\nThird\nP D\n\ntal: free\nAlap\nN S';
    const out=xml(source);assert.deepEqual([...out.querySelectorAll('time')].map(e=>e.textContent),['164','74','178','44']);
    assert.equal(beats(out),8);
    assert.equal(beats(xml('tal: tintal\n\nS R G m P D N S R G\n\ntal: free\nAlap\nS R')),12);
  }},
  {name:'audit export: all Gat forms follow playback duration',fn(){
    for(const cue of ['gat','gat!','gat@8','gat@8..@1']){
      const source=`tal: jhaptal\ntempo: 60\n\nGat\n@8 S R G m P\n\nTaan\nD N ${cue}\nS`;
      assert.equal(beats(xml(source)),scheduleDocument(parseDocument(source).doc).duration,cue);
    }
  }},
  {name:'audit export: Jhampak pickup ends before the closing sam S',fn(){
    const out=xml('tal: jhampak\n\n@3 ||: G - Gm | R- S | .N.D .N|S - :||');
    const measures=[...out.querySelectorAll('measure')];
    assert.equal(measures[0].getAttribute('implicit'),'yes');
    assert.equal([...measures[0].querySelectorAll('duration')].reduce((n,e)=>n+Number(e.textContent),0),13);
    assert.equal(measures[1].querySelector('note pitch step').textContent,'C');
    assert.equal(beats(out),17);
  }},
  {name:'audit tala: Ashta Jhaptaal aliases preserve Jhampak timing and document spelling',fn(){
    for(const name of ['Ashta Jhaptal','Ashta Jhaptaal','ashta-jhaptaal']){
      assert.equal(getTal(name),getTal('jhampak'));
      const parsed=parseDocument(`tal: ${name}\n\n@8 S R\nG`);assert.deepEqual(parsed.problems,[]);
      assert.equal(parsed.doc.directives.tal,name);assert.equal(scheduleDocument(parsed.doc).duration,2.5);
    }
  }},
  {name:'audit audio: native layout probe reads real M4A headers and rejects oversized decoded audio',async fn(){
    const ctx=vm.createContext({DataView,Uint8Array});vm.runInContext(await read('public/vilambit/audio-metadata.js'),ctx);
    for(const codec of ['aac','alac']){
      const bytes=await readFile(new URL(`fixtures/codec-${codec}.m4a`,import.meta.url));
      const info=await ctx.SargamAudioMetadata.inspect(new Blob([bytes]));
      assert.ok(info,codec);assert.ok(info.duration>1&&info.duration<3);assert.ok(ctx.SargamAudioMetadata.fits(info));
      assert.equal(ctx.SargamAudioMetadata.fits({...info,duration:7200}),false);
    }
    assert.equal(await ctx.SargamAudioMetadata.inspect(new Blob(['broken'])),null);
  }},
  {name:'audit audio: media failure starts fallback even while the native header read is stalled',async fn(){
    const t=await player();try{
      t.w.URL.createObjectURL=()=> 'blob:http://localhost/test';t.w.URL.revokeObjectURL=()=>{};
      t.w.SargamAudioMetadata={inspect:()=>new Promise(()=>{}),fits:()=>true};
      let called=0;t.w.SargamAudioCompatibility={prepare:()=>{called++;return Promise.reject(new Error('test fallback'));}};
      t.p.loadFile({name:'stalled.m4a',type:'audio/mp4',size:100});
      Object.defineProperty(t.p.media,'error',{value:{code:4},configurable:true});t.p.media.dispatchEvent(new t.w.Event('error'));
      await turn();assert.equal(called,1);assert.equal(t.p.record().nativeController.signal.aborted,true);
    }finally{t.close();}
  }},
];
