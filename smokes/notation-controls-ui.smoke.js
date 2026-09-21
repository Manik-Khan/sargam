import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';

// Compile the real JSX component with the project's existing Vite compiler.
const require = createRequire(import.meta.url);
const compiled = buildSync({ entryPoints:[new URL('../src/shell/NotationControls.jsx', import.meta.url).pathname], bundle:true,
  platform:'node', format:'cjs', packages:'external', write:false }).outputFiles[0].text;
const compiledModule = { exports:{} };
new Function('module','exports','require',compiled)(compiledModule,compiledModule.exports,require);
const Controls = compiledModule.exports.default;

export const smokes = [{ name: 'writing UI: real buttons, typed wrappers and destination bol picks stay connected', fn() {
  const previous = { document:globalThis.document, window:globalThis.window, act:globalThis.IS_REACT_ACT_ENVIRONMENT };
  const dom = new JSDOM('<body><div id="app"></div></body>');
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('app'));
  let text = '---\ntal: jhampak\n---\nGm R S';
  let selection = { start:text.indexOf('Gm'), end:text.indexOf('Gm')+2 };
  let picked = null;
  function render() {
    root.render(React.createElement(Controls, { text, doc:parseDocument(text).doc, selection,
      onEdit(result) { assert.equal(result.ok,true); text=result.text; selection={start:result.selectionStart,end:result.selectionEnd}; render(); },
      onBol(target) { picked=target; }, message:'' }));
  }
  const button = name => [...document.querySelectorAll('.notation-ornaments button')].find(node => node.textContent.startsWith(name));
  try {
    act(render);
    act(() => button('Slide').click());
    assert.ok(text.endsWith('~(Gm) R S'));
    assert.equal(button('Slide').getAttribute('aria-pressed'),'true');
    act(() => button('Kan').click());
    assert.ok(text.endsWith('{G}m R S'));
    const picks = document.querySelectorAll('.notation-bol-controls select');
    assert.equal(picks.length,1,'only the destination is a bol target');
    act(() => { picks[0].value='da'; picks[0].dispatchEvent(new window.Event('change',{bubbles:true})); });
    assert.deepEqual(picked,{sourceLine:4,ordinal:0,pass:1,kind:'da',diriMode:'single'});
    text='---\ntal: jhampak\n---\n[[Gm]] R S';
    selection={start:text.indexOf('[['),end:text.indexOf(']]')+2};
    act(render);
    assert.equal(button('Krintan').getAttribute('aria-pressed'),'true','directly typed shorthand is reflected in controls');
    act(() => button('Remove ornament').click());
    assert.ok(text.endsWith('Gm R S'));
    selection={start:0,end:3};
    act(render);
    assert.ok([...document.querySelectorAll('.notation-ornaments button')].every(node=>node.disabled));
  } finally {
    act(()=>root.unmount());
    dom.window.close();
    globalThis.document=previous.document;
    globalThis.window=previous.window;
    globalThis.IS_REACT_ACT_ENVIRONMENT=previous.act;
  }
} }];
