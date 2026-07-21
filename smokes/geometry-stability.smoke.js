// smokes/geometry-stability.smoke.js — playback must not rebuild the score,
// Diri must stay with its two slots, and repeats must remain outside the grid.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { renderDocument } from '../src/engine/render.js';
import { mountAnchorOverlays } from '../src/shell/anchor-overlay.js';
import { applyPlaybackCursor } from '../src/shell/playback-cursor.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.CSS = globalThis.CSS || { escape: (value) => String(value).replace(/["\\]/g, '\\$&') };

function parsed(source) {
  const result = parseDocument(source);
  assert.equal(result.problems.length, 0, result.problems.map((problem) => problem.msg).join('; '));
  return result.doc;
}

export const smokes = [
  {
    name: 'geometry stability: playback changes only the active class',
    fn() {
      const root = renderDocument(parsed('---\ntal: jhaptal\n---\n\nGat\nS R G m'));
      const group = root.querySelector('.sr-line-group');
      const first = group.querySelector('.sr-cell[data-matra="0"]');
      const second = group.querySelector('.sr-cell[data-matra="1"]');
      const row = group.querySelector('.sr-row');
      assert.equal(applyPlaybackCursor(root, { sourceLine: 6, matraIndex: 0 }), first);
      assert.equal(applyPlaybackCursor(root, { sourceLine: 6, matraIndex: 1 }), second);
      assert.ok(!first.classList.contains('sr-active'));
      assert.ok(second.classList.contains('sr-active'));
      assert.equal(group.querySelector('.sr-row'), row, 'cursor updates preserve node identity');

      const preview = readFileSync(new URL('../src/shell/PreviewPane.jsx', import.meta.url), 'utf8');
      assert.match(preview, /renderDocument\(doc, \{ activeLine, noteNames, maxSystemEm \}\)/);
      assert.doesNotMatch(preview, /\[doc, sourceText, activeLine, activeCursor,/);
    },
  },
  {
    name: 'geometry stability: same-matra Diri is attached to the slot grid',
    fn() {
      const root = renderDocument(parsed('---\ntal: jhaptal\n---\n\nGat\n.D--.n -S gm D - ~(D m) P-D- m-gg R-S-'));
      const a = root.querySelector('[data-anchor-kind="attack"][data-anchor-ordinal="11"]');
      const b = root.querySelector('[data-anchor-kind="attack"][data-anchor-ordinal="12"]');
      const grid = a.closest('.sr-timed-slots');
      assert.equal(b.closest('.sr-timed-slots'), grid);
      grid.getBoundingClientRect = () => ({ left: 100, right: 300, width: 200, top: 0, bottom: 40, height: 40 });
      a.querySelector('.sr-ch').getBoundingClientRect = () => ({ left: 125, right: 135, width: 10, top: 0, bottom: 20, height: 20 });
      b.querySelector('.sr-ch').getBoundingClientRect = () => ({ left: 165, right: 175, width: 10, top: 0, bottom: 20, height: 20 });
      mountAnchorOverlays(root, [{
        id: 'a1', kind: 'diri', status: 'resolved',
        resolvedStart: { kind: 'attack', sourceLine: 6, ordinal: 11, time: '17/2' },
        resolvedEnd: { kind: 'attack', sourceLine: 6, ordinal: 12, time: '35/4' },
      }]);
      const mark = grid.querySelector(':scope > .sr-diri-inline');
      assert.ok(mark);
      assert.equal(mark.dataset.diriPlacement, 'slot-grid');
      assert.equal(mark.style.left, '15%');
      assert.equal(mark.style.width, '20%');
    },
  },
  {
    name: 'geometry stability: repeats share note height outside an unchanged grid',
    fn() {
      const root = renderDocument(parsed('---\ntal: jhaptal\n---\n\nGat\n@1 ||: S R G m :||\n@1 S R G m'));
      const groups = [...root.querySelectorAll('.sr-line-group')];
      const repeatedRow = groups[0].querySelector('.sr-row');
      const plainRow = groups[1].querySelector('.sr-row');
      const cells = [...groups[0].querySelectorAll('.sr-cell')];
      const open = groups[0].querySelector('.sr-repeat-open');
      const close = groups[0].querySelector('.sr-repeat-close');
      assert.equal(open.parentElement, cells[0].querySelector(':scope > .sr-glyphs'));
      assert.equal(close.parentElement, cells.at(-1).querySelector(':scope > .sr-glyphs'));
      assert.ok(open.classList.contains('sr-ev') && close.classList.contains('sr-ev'));
      assert.equal(repeatedRow.style.gridTemplateColumns, plainRow.style.gridTemplateColumns);
    },
  },
];
