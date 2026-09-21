import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { EditorState } from '@codemirror/state';
import { editorSelectionSync } from '../src/shell/editor-selection-sync.js';

function fixture(run) {
  const dom = new JSDOM('<main><div id="editor"></div><aside></aside></main>');
  const win = dom.window;
  const frames = new Map();
  let serial = 0;
  win.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; };
  win.cancelAnimationFrame = id => frames.delete(id);
  const view = { dom: win.document.getElementById('editor'), state: EditorState.create({doc:'G m R S\n.N .D .N S'}) };
  const published = [];
  const sync = editorSelectionSync(view, state => published.push([state.selection.main.from, state.selection.main.to, state.doc.lineAt(state.selection.main.head).number]));
  function select(anchor, head = anchor) {
    view.state = view.state.update({selection:{anchor,head}}).state;
    sync.update();
  }
  function pointer(type, target = view.dom, id = 1, button = 0) {
    const event = new win.Event(type, {bubbles:true});
    Object.assign(event, {pointerId:id, button, isPrimary:true});
    target.dispatchEvent(event);
  }
  function paint() {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(fn => fn());
  }
  try { run({win, view, published, sync, select, pointer, paint, outside:win.document.querySelector('aside'), frames}); }
  finally { sync.destroy(); dom.window.close(); }
}

export const smokes = [
  {name:'editor selection: dragging stays live and publishes once after release outside editor', fn() {
    fixture(({view,published,select,pointer,paint,outside}) => {
      select(0);
      pointer('pointerdown');
      select(0,3);
      select(0,10);
      assert.equal(view.state.selection.main.to,10,'CodeMirror selection is never frozen');
      assert.deepEqual(published,[[0,0,1]],'controls and score are not updated mid-drag');
      pointer('pointerup',outside,2);
      paint();
      assert.equal(published.length,1,'another pointer cannot end this gesture');
      pointer('pointerup',outside);
      select(0,13); // final mouseup transaction after pointerup
      assert.equal(published.length,1);
      paint();
      assert.deepEqual(published,[[0,0,1],[0,13,2]],'only the final range and source line are published');
      select(8,10);
      assert.deepEqual(published.at(-1),[8,10,2],'keyboard/programmatic selections remain immediate');
    });
  }},
  {name:'editor selection: cancellation, window blur and keyboard handoff release deferred updates', fn() {
    fixture(({win,view,published,select,pointer,paint,outside}) => {
      pointer('pointerdown'); select(0,3); pointer('pointercancel',outside); paint();
      assert.deepEqual(published.at(-1),[0,3,1]);
      pointer('pointerdown'); select(3,5); win.dispatchEvent(new win.Event('blur'));
      assert.deepEqual(published.at(-1),[3,5,1]);
      pointer('pointerdown'); select(5,7);
      view.dom.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true}));
      select(5,8);
      assert.deepEqual(published.at(-1),[5,8,2]);
      pointer('pointerdown',view.dom,1,2); select(1);
      assert.deepEqual(published.at(-1),[1,1,1],'right click does not suspend updates');
    });
  }},
  {name:'editor selection: rapid consecutive drags keep controls stable until latest release', fn() {
    fixture(({published,select,pointer,paint,outside}) => {
      pointer('pointerdown'); select(0,3); pointer('pointerup',outside);
      pointer('pointerdown'); select(0,7); paint();
      assert.deepEqual(published,[]);
      pointer('pointerup',outside); paint();
      assert.deepEqual(published,[[0,7,1]]);
    });
  }},
  {name:'editor selection: unmount cancels pending work and removes gesture listeners', fn() {
    fixture(({win,view,published,sync,select,pointer,paint,outside,frames}) => {
      pointer('pointerdown'); select(0,3); pointer('pointerup',outside);
      assert.equal(frames.size,1);
      sync.destroy();
      assert.equal(frames.size,0);
      paint(); pointer('pointerdown'); pointer('pointerup',outside);
      win.dispatchEvent(new win.Event('blur'));
      view.dom.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowRight'}));
      sync.update();
      assert.equal(frames.size,0);
      assert.deepEqual(published,[]);
    });
  }},
];
