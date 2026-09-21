import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
function component(name) {
  const compiled = buildSync({ entryPoints:[new URL(`../src/shell/${name}.jsx`,import.meta.url).pathname],bundle:true,
    platform:'node',format:'cjs',packages:'external',write:false }).outputFiles[0].text;
  const module = {exports:{}};
  new Function('module','exports','require',compiled)(module,module.exports,require);
  return module.exports.default;
}
const Menu=component('WorkspaceMenu'), View=component('NotationViewControls'), Transport=component('Transport');
const Toolbar=component('Toolbar'), Practice=component('PracticeBar'), Panel=component('NoteToolsPanel');
const h=React.createElement;
function fixture(run) {
  const previous={document:globalThis.document,window:globalThis.window,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
  const dom=new JSDOM('<body><textarea>Gm R S</textarea><div id="app"></div><button id="outside">Outside</button></body>',{url:'https://sargam.test',pretendToBeVisual:true});
  globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const root=createRoot(document.getElementById('app'));
  const render=element=>act(()=>root.render(element));
  const buttons=()=>[...document.querySelectorAll('button')];
  const button=label=>buttons().find(node=>node.textContent.trim()===label || node.getAttribute('aria-label')===label);
  const click=label=>act(()=>{const node=button(label);assert.ok(node,`missing button ${label}`);node.click();});
  try {run({render,click,button,dom});}
  finally {act(()=>root.unmount());dom.window.close();globalThis.document=previous.document;globalThis.window=previous.window;globalThis.IS_REACT_ACT_ENVIRONMENT=previous.act;}
}
export const smokes=[
 {name:'compact layout: popovers preserve source selection, escape to trigger and dismiss outside',fn(){fixture(({render,click,button})=>{
  const text=document.querySelector('textarea');text.setSelectionRange(0,2);
  let count=0;
  render(h(Menu,{label:'Insert'},h('button',{onClick:()=>count++},'Apply')));
  click('Insert ▾');assert.equal(document.querySelectorAll('.workspace-tool-popover').length,1);
  assert.equal(document.activeElement,button('Apply'));
  click('Apply');assert.equal(count,1);assert.equal(text.selectionStart,0);assert.equal(text.selectionEnd,2);
  act(()=>button('Apply').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('.workspace-tool-popover'),null);assert.equal(document.activeElement,button('Insert ▾'));
  click('Insert ▾');act(()=>document.getElementById('outside').dispatchEvent(new window.Event('pointerdown',{bubbles:true})));
  assert.equal(document.querySelector('.workspace-tool-popover'),null);
  click('Insert ▾');
  act(()=>document.querySelector('textarea').dispatchEvent(new window.Event('scroll')));
  assert.ok(document.querySelector('.workspace-tool-popover'),'independent source/score scrolling must not dismiss tools');
  act(()=>window.dispatchEvent(new window.Event('resize')));
  assert.equal(document.querySelector('.workspace-tool-popover'),null);
 });}},
 {name:'compact layout: View controls route grid, follow, metadata and layout changes',fn(){fixture(({render,click})=>{
  const called=[];const record=name=>value=>called.push([name,value]);
  render(h(View,{rhythmGrid:true,rhythmGridStyle:'cells',followEditing:true,followPlayback:true,showStructure:false,layout:'stacked',noteNames:'sargam',
    onRhythmGrid:record('grid'),onRhythmGridStyle:record('style'),onFollowEditing:record('editing'),onFollowPlayback:record('playback'),onShowStructure:record('metadata'),onToggleLayout:()=>called.push(['layout']),onToggleNoteNames:()=>called.push(['names']),onLegend:()=>called.push(['guide'])}));
  click('View ▾');click('Graph Paper');
  const checks=[...document.querySelectorAll('.workspace-tool-popover input')];
  act(()=>checks.forEach(input=>input.click()));
  click('Editor beside score');click('Use Western note names');click('Notation guide');
  assert.deepEqual(called,[['style','paper'],['grid',false],['editing',false],['playback',false],['metadata',true],['layout'],['names'],['guide']]);
 });}},
 {name:'compact layout: Sounds and Repeat retain playback, mute, drone and tala callbacks',fn(){fixture(({render,click})=>{
  const events=[];
  render(h(Transport,{playing:false,position:0,duration:8.5,bpm:60,loopMode:'off',tracks:{melody:false,tick:false},volumes:{melody:.7,tick:.5,drone:.3},melodyVoice:'neutral',droneMode:'off',talaSound:'click',
    onPlayPause:()=>events.push('play'),onStop:()=>events.push('stop'),onBpm:()=>{},onLoopMode:v=>events.push(v),onTrackMute:(...v)=>events.push(v),onTrackGain:()=>{},onMelodyVoice:()=>{},onToneChange:()=>{},onChikariChange:()=>{},onDroneMode:v=>events.push(v),onTalaSound:()=>{}}));
  assert.equal(document.querySelector('.tp-quick-group'),null,'sounds are not permanently displayed');
  click('Play notation');click('Stop notation');click('Repeat ▾');click('Current line');click('Close repeat');
  click('Sounds ▾');click('Melody');click('Tanpura');click('Tala');
  assert.ok(document.querySelector('.tp-settings-menu').textContent.includes('Chikari sound'));
  assert.ok(document.querySelector('.tp-settings-menu').textContent.includes('GeneralUser GS')===false);
  assert.deepEqual(events,['play','stop','line',['melody',true],'sa-pa',['tick',true]]);
 });}},
 {name:'compact layout: header keeps split view, file actions, linked phrases and Queue reachable',fn(){fixture(({render,click})=>{
  const events=[];
  render(h(Toolbar,{recents:[],view:'notation',libraryItems:[],linkedPhraseItems:[{id:'phrase',label:'Opening',detail:'0:12–0:28'}],queueSession:{upcoming:[],history:[],repeatMode:'off'},onView:v=>events.push(v),onLinkedPhrase:v=>events.push(v),onOpenRecording:()=>events.push('recording'),onSave:()=>events.push('save')}));
  click('Split view');click('Music');click('Notation');
  assert.equal(document.querySelector('.workspace-linked-drawer'),null);
  click('More ▾');click('Linked phrases');click('01Opening0:12–0:28');
  click('More ▾');click('Queue');assert.ok(document.querySelector('.workspace-queue-drawer'));click('Close Queue');
  click('File ▾');click('Save');click('Open recording');
  assert.deepEqual(events,['split','vilambit','notation','phrase','save','recording']);
 });}},
 {name:'compact layout: empty recording controls stay subscribed and recover on source readiness',fn(){fixture(({render,click})=>{
  const sent=[],received=[];const source={postMessage:message=>sent.push(message)};
  render(h(Practice,{frameRef:{current:{contentWindow:source}},onState:state=>received.push(state)}));
  assert.equal(document.querySelector('.app-practice-bar'),null);
  assert.equal(sent[0].type,'request-state');
  const event=payload=>act(()=>window.dispatchEvent(new window.MessageEvent('message',{origin:window.location.origin,source,data:{channel:'sargam.vilambit',version:1,direction:'event',type:'state',payload}})));
  event({ready:true,loaded:true,source:{name:'Local take.m4a',kind:'audio'},duration:30,position:5,loop:{a:null,b:null,on:false}});
  assert.ok(document.querySelector('.app-practice-bar'));assert.equal(received.length,1);
  click('Play');assert.equal(sent.at(-1).type,'play');click('A');assert.deepEqual(sent.at(-1).payload,{a:5,b:null,on:false});
  event({ready:true,loaded:false,source:null,duration:0,error:null});assert.equal(document.querySelector('.app-practice-bar'),null);
  event({ready:true,loaded:false,source:null,duration:0,error:'Could not read recording'});assert.ok(document.querySelector('.app-practice-error'));
 });}},
 {name:'compact layout: selection changes cannot open tools and closed controls do no render work',fn(){fixture(({render})=>{
  let count=0;
  function Child({selection}){count++;return h('span',null,selection);}
  const show=(open,selection)=>render(h(Panel,{open},h(Child,{selection})));
  show(false,'G');show(false,'Gm R S');assert.equal(count,0);
  const panel=document.querySelector('#notation-note-tools');assert.equal(panel.hidden,true);
  show(true,'Gm');assert.equal(panel.hidden,false);assert.equal(count,1);
  show(true,'Gm R S');assert.equal(document.querySelector('#notation-note-tools'),panel);assert.equal(panel.hidden,false);
  show(false,'Gm R S');assert.equal(panel.hidden,true);assert.equal(panel.textContent,'');
 });}},
];
