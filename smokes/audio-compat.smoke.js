import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { player } from './player-playback-lifecycle.smoke.js';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const clientSource = await read('public/vilambit/audio-compat.js');
function api() {
  const context = vm.createContext({ Blob, URL, DOMException, setTimeout, clearTimeout });
  vm.runInContext(clientSource, context);
  return context.SargamAudioCompatibility;
}
const probe = (duration = 2) => ({ streams: [{codec_type:'audio', codec_name:'alac', duration, sample_rate:44100, channels:2}] });
export const smokes = [
  { name:'audio compatibility: limits reject unsafe metadata and truncated output', fn() {
    const a = api();
    assert.equal(a.inspect(probe()).codec, 'alac');
    assert.throws(() => a.inspect(probe(7201)), /two-hour/);
    assert.throws(() => a.inspect(probe('N/A')), /duration/);
    assert.throws(() => a.inspect({streams:[]}), /No readable audio/);
    assert.throws(() => a.inspect({...probe(), streams:[...probe().streams, {codec_type:'video'}]}), /includes video/);
    assert.equal(a.inspect({streams:[...probe().streams, {codec_type:'video', disposition:{attached_pic:1}}]}).channels, 2);
    assert.throws(() => a.validateOutput(a.inspect(probe()), probe(1), 100), /partial copy/);
    assert.throws(() => a.validateOutput(a.inspect(probe()), probe(), a.LIMITS.outputBytes), /memory limit/);
    assert.equal(a.validateOutput(a.inspect(probe()), probe(), 100).duration, 2);
  } },
  { name:'audio compatibility: worker owns only a local file and is terminated after success', async fn() {
    const a=api(); let worker; const file=new Blob(['local bytes']);
    const pending=a.prepare(file, {workerFactory:() => worker={postMessage(payload){assert.equal(payload.file,file);}, terminate(){this.stopped=true;}}});
    worker.onmessage({data:{type:'ready', bytes:new Uint8Array([1,2]), info:{duration:2}}});
    const result=await pending;
    assert.equal(result.blob.type,'audio/flac'); assert.equal(result.blob.size,2); assert.equal(worker.stopped,true);
  } },
  { name:'audio compatibility: cancellation, timeout, and worker failures release resources', async fn() {
    const a=api();
    for (const mode of ['cancel','timeout','error','messageerror']) {
      let worker; const controller=new AbortController();
      const pending=a.prepare(new Blob(['x']), {signal:controller.signal, timeoutMs:mode==='timeout'?5:1000,
        workerFactory:()=>worker={postMessage(){},terminate(){this.stopped=true;}}});
      if(mode==='cancel') controller.abort();
      if(mode==='error') worker.onerror();
      if(mode==='messageerror') worker.onmessageerror();
      await assert.rejects(pending);
      assert.equal(worker.stopped,true,mode);
    }
    let called=false;
    await assert.rejects(a.prepare({size:a.LIMITS.inputBytes+1}, {workerFactory:()=>{called=true;}}), /256 MB/);
    assert.equal(called,false);
  } },
  { name:'audio compatibility: only bundled decoder assets load; no upload APIs or remote conversion', async fn() {
    const worker=await read('public/vilambit/audio-compat-worker.js');
    assert.doesNotMatch(clientSource+worker, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|https?:\/\//);
    assert.match(worker,/FS\.mount\(core\.FS\.filesystems\.WORKERFS/);
    assert.match(worker,/'-protocol_whitelist', 'file'/);
    assert.ok(api().convertArgs('/local/recording','/playback.flac').includes('-xerror'));
    assert.ok(api().convertArgs('/local/recording','/playback.flac').includes('-fs'));
    const html=await read('public/sargam-player/index.html');
    assert.match(html,/audio-compat\.js/);
    assert.doesNotMatch(html,/ffmpeg-core/);
  } },
  { name:'audio compatibility: real bundled WASM decodes ALAC and AAC without native browser codecs', async fn() {
    const [workerSource, coreSource, wasm] = await Promise.all([
      read('public/vilambit/audio-compat-worker.js'), read('public/vilambit/vendor/ffmpeg-0.12.10/ffmpeg-core.js'),
      readFile(new URL('public/vilambit/vendor/ffmpeg-0.12.10/ffmpeg-core.wasm',root)),
    ]);
    for(const name of ['alac','aac','broken']) {
      const bytes=name==='broken'?Buffer.from([0,1,2,3]):await readFile(new URL(`smokes/fixtures/codec-${name}.m4a`,root));
      class LocalBlob {
        constructor(bytes){this.bytes=bytes;this.size=bytes.length;}
        slice(start,end){return new LocalBlob(this.bytes.subarray(start,end));}
      }
      const messages=[];
      const ctx=vm.createContext({console, URL, TextDecoder, TextEncoder, performance, WebAssembly,
        btoa,atob, setTimeout,clearTimeout,
        FileReaderSync:class {readAsArrayBuffer(blob){return blob.bytes.buffer.slice(blob.bytes.byteOffset,blob.bytes.byteOffset+blob.bytes.length);}},
      });
      ctx.self=ctx; ctx.location={href:'http://local.test/vilambit/audio-compat-worker.js'};
      ctx.postMessage=data=>messages.push(data);
      ctx.importScripts=path=>{
        if(path==='audio-compat.js') vm.runInContext(clientSource,ctx);
        else {
          assert.equal(path,'vendor/ffmpeg-0.12.10/ffmpeg-core.js');
          vm.runInContext(coreSource,ctx);
          const create=ctx.createFFmpegCore;
          ctx.createFFmpegCore=opts=>create({...opts,wasmBinary:wasm});
        }
      };
      vm.runInContext(workerSource,ctx);
      await ctx.onmessage({data:{file:new LocalBlob(bytes),limits:api().LIMITS}});
      const result=messages.at(-1);
      if(name==='broken') {assert.equal(result.type,'error');continue;}
      assert.equal(result.type,'ready',result.message);
      assert.equal(result.info.codec,name);
      assert.ok(Math.abs(result.info.duration-2)<0.1);
      assert.equal(Buffer.from(result.bytes).subarray(0,4).toString(),'fLaC');
      if(name==='alac') assert.equal(Buffer.from(result.bytes).subarray(26,42).toString('hex'), '60d54244523167ac82014d660adce3aa');
    }
  } },
  { name:'audio compatibility: player installs a copy without changing source identity or loop markers', async fn() {
    const t=await player();
    try {
      let url=0, finish;
      t.w.URL.createObjectURL=()=>`blob:http://localhost/${++url}`;
      t.w.URL.revokeObjectURL=()=>{};
      const file={name:'lesson.m4a',type:'audio/mp4',size:4,lastModified:123,arrayBuffer:async()=>new ArrayBuffer(4)};
      t.w.SargamAudioCompatibility={LIMITS:api().LIMITS,prepare:()=>new Promise(resolve=>{finish=resolve;})};
      t.p.loadFile(file);
      await new Promise(resolve=>setTimeout(resolve,0));
      const original=t.p.state.fileURL;
      t.p.state.sourceId='source-lesson';
      t.p.state.loopA=1; t.p.state.loopB=2; t.p.state.markers=[{id:'marker',time:1}];
      Object.defineProperty(t.p.media,'error',{configurable:true,value:{code:4}});
      t.p.media.dispatchEvent(new t.w.Event('error'));
      assert.equal(t.w.document.querySelector('#audioPreparationCancel').hidden,false);
      assert.equal(t.w.document.querySelector('#playBtn').disabled,true);
      assert.equal(await t.p.togglePlay(),false);
      t.p.media.load=()=>{
        Object.defineProperty(t.p.media,'error',{configurable:true,value:null});
        Object.defineProperty(t.p.media,'duration',{configurable:true,value:31});
        t.p.media.dispatchEvent(new t.w.Event('loadedmetadata'));
      };
      finish({blob:new Blob(['FLAC']),info:{duration:31,decodedBytes:api().LIMITS.decodedBytes+1}});
      await new Promise(resolve=>setTimeout(resolve,0));
      assert.equal(t.p.state.fileURL,original);
      assert.notEqual(t.p.media.src,original);
      assert.equal(t.p.state.fileName,'lesson.m4a');
      assert.equal(t.p.state.fileSize,4); assert.equal(t.p.state.fileLastModified,123);
      assert.equal(t.p.state.sourceId,'source-lesson');
      assert.equal(t.p.state.loopA,1); assert.equal(t.p.state.loopB,2);
      assert.equal(t.p.state.markers[0].id,'marker');
      assert.equal(t.w.document.querySelector('#playBtn').disabled,false);
      assert.match(t.w.document.querySelector('#sourceNotice').textContent,/Ready to play/);
      assert.equal(await t.p.togglePlay(),true);
    } finally {t.close();}
  } },
  { name:'audio compatibility: switching sources aborts work and ignores a late compatible copy', async fn() {
    const t=await player();
    try {
      let finish, signal, urls=0;
      t.w.URL.createObjectURL=()=>`blob:http://localhost/${++urls}`;
      t.w.URL.revokeObjectURL=()=>{};
      t.w.SargamAudioCompatibility={LIMITS:api().LIMITS,prepare:(_,options)=>{
        signal=options.signal; return new Promise(resolve=>{finish=resolve;});
      }};
      t.p.loadFile({name:'old.m4a',type:'audio/mp4',size:4,arrayBuffer:async()=>new ArrayBuffer(4)});
      await new Promise(resolve=>setTimeout(resolve,0));
      Object.defineProperty(t.p.media,'error',{configurable:true,value:{code:4}});
      t.p.media.dispatchEvent(new t.w.Event('error'));
      t.load('new.mp4');
      assert.equal(signal.aborted,true);
      finish({blob:new Blob(['FLAC']),info:{duration:31}});
      await new Promise(resolve=>setTimeout(resolve,0));
      assert.equal(t.p.state.fileName,'new.mp4');
      assert.equal(urls,1);
      assert.equal(t.w.document.querySelector('#audioPreparationCancel').hidden,true);
      assert.equal(t.w.document.querySelector('#playBtn').disabled,false);
    } finally {t.close();}
  } },

  { name:'audio compatibility: playable files do not launch preparation', async fn() {
    const t=await player();
    try {
      let calls=0;
      t.w.URL.createObjectURL=()=> 'blob:http://localhost/audio';
      t.w.URL.revokeObjectURL=()=>{};
      t.w.SargamAudioCompatibility={prepare:()=>{calls++;}};
      t.p.loadFile({name:'normal.m4a',type:'audio/mp4',size:4,arrayBuffer:async()=>new ArrayBuffer(4)});
      await new Promise(resolve=>setTimeout(resolve,0));
      // Full waveform decoding may fail independently of native media playback.
      Object.defineProperty(t.p.media,'duration',{value:31,configurable:true});
      t.p.media.dispatchEvent(new t.w.Event('loadedmetadata'));
      assert.equal(await t.p.togglePlay(),true);
      assert.equal(calls,0);
      assert.equal(t.w.document.querySelector('#audioPreparationCancel').hidden,true);
    } finally {t.close();}
  } },
  { name:'audio compatibility: Cancel stops preparation and the next source remains usable', async fn() {
    const t=await player();
    try {
      let signal;
      t.w.URL.createObjectURL=()=> 'blob:http://localhost/audio';
      t.w.URL.revokeObjectURL=()=>{};
      t.w.SargamAudioCompatibility={prepare:(_,options)=>{
        signal=options.signal;
        return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new t.w.DOMException('Cancelled','AbortError'))));
      }};
      t.p.loadFile({name:'old.m4a',type:'audio/mp4',size:4,arrayBuffer:async()=>new ArrayBuffer(4)});
      await new Promise(resolve=>setTimeout(resolve,0));
      Object.defineProperty(t.p.media,'error',{value:{code:4},configurable:true});
      t.p.media.dispatchEvent(new t.w.Event('error'));
      t.w.document.querySelector('#audioPreparationCancel').click();
      await new Promise(resolve=>setTimeout(resolve,0));
      assert.equal(signal.aborted,true);
      assert.equal(t.w.document.querySelector('#audioPreparationCancel').hidden,true);
      assert.match(t.w.document.querySelector('#sourceNotice').textContent,/cancelled/);
      t.load('next.mp4');
      assert.equal(await t.p.togglePlay(),true);
    } finally {t.close();}
  } },

];
