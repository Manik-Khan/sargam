// smokes/rhythm-grid-ui.smoke.js — graph-paper cells remain musical data,
// while the shell adds stable selection and readable beat coordinates.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { renderDocument } from '../src/engine/render.js';
import {
  decorateRhythmGrid,
  rhythmGridIdentity,
  rhythmGridLabel,
} from '../src/shell/rhythm-grid.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;

function gridCorpus() {
  const result = parseDocument('tal: rupak\n\nGat\nS [R G] m');
  assert.equal(result.problems.length, 0);
  return renderDocument(result.doc);
}

export const smokes = [
  {
    name: 'rhythm grid UI: every cell carries tala and subdivision coordinates',
    fn() {
      const cells = [...gridCorpus().querySelectorAll('.sr-cell')];
      assert.deepEqual(cells.map((cell) => cell.dataset.cycleMatra), ['1', '2', '3']);
      assert.deepEqual(cells.map((cell) => cell.dataset.gridSubdivisions), ['1', '2', '1']);
    },
  },
  {
    name: 'rhythm grid UI: one selected matra survives as an accessible grid cell',
    fn() {
      const root = gridCorpus();
      const selected = decorateRhythmGrid(root, { sourceLine: 4, matraIndex: 1 });
      assert.equal(selected?.dataset.cycleMatra, '2');
      assert.equal(selected?.getAttribute('role'), 'gridcell');
      assert.equal(selected?.getAttribute('aria-selected'), 'true');
      assert.equal(root.querySelectorAll('.sr-grid-selected').length, 1);
      assert.match(selected?.getAttribute('aria-label') || '', /tala matra 2, 2 subdivisions/);
    },
  },
  {
    name: 'rhythm grid UI: identity and shell preserve graph selection and preferences',
    async fn() {
      const root = gridCorpus();
      const identity = rhythmGridIdentity(root.querySelectorAll('.sr-cell')[1]);
      assert.deepEqual(identity, { sourceLine: 4, matraIndex: 1, cycleMatra: 2, subdivisions: 2 });
      assert.equal(rhythmGridLabel(identity), 'tala matra 2, 2 subdivisions, source line 4');

      const app = await readFile(new URL('../src/shell/App.jsx', import.meta.url), 'utf8');
      const preview = await readFile(new URL('../src/shell/PreviewPane.jsx', import.meta.url), 'utf8');
      assert.match(app, /getPref\('rhythmGrid', false\)/);
      assert.match(app, /setPref\('rhythmGrid', value\)/);
      assert.match(preview, /setGridSelection\(rhythmGridIdentity\(cell\)\)/);
      assert.match(preview, /aria-label=\{rhythmGrid \? 'Graph-paper matra grid'/);
    },
  },
];
