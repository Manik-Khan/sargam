// smokes/rhythm-grid-ui.smoke.js — graph-paper cells remain musical data,
// while the shell adds stable selection and readable beat coordinates.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { renderDocument } from '../src/engine/render.js';
import { alignTalaMarkers } from '../src/shell/anchor-overlay.js';
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
      const root = gridCorpus();
      const cells = [...root.querySelectorAll('.sr-cell')];
      assert.deepEqual(cells.map((cell) => cell.dataset.cycleMatra), ['1', '2', '3']);
      assert.deepEqual(cells.map((cell) => cell.dataset.gridSubdivisions), ['1', '2', '1']);
      assert.equal(root.querySelectorAll('.sr-paper-tail').length, 1);
    },
  },
  {
    name: 'rhythm grid UI: tala markers stay in their coordinate lane instead of colliding with dividers',
    fn() {
      const root = gridCorpus();
      root.classList.add('app-rhythm-grid');
      const marker = root.querySelector('.sr-marker:not(:empty)');
      marker.style.setProperty('--sr-marker-shift', '99px');
      marker.classList.add('sr-marker-on-boundary');
      alignTalaMarkers(root);
      assert.equal(marker.style.getPropertyValue('--sr-marker-shift'), '');
      assert.equal(marker.classList.contains('sr-marker-on-boundary'), false);
    },
  },
  {
    name: 'rhythm grid UI: Graph Paper is made of real one-matra cells rather than a painted overlay',
    fn() {
      const parsed = parseDocument('tal: rupak\n\nGat\nS [R G] m');
      assert.equal(parsed.problems.length, 0);
      const root = renderDocument(parsed.doc, {
        graphPaper: true,
        graphColumns: 7,
        maxSystemEm: 18.2,
      });
      const row = root.querySelector('.sr-graph-row');
      assert.equal(row?.dataset.graphColumns, '7');
      assert.equal(row?.querySelectorAll('.sr-cell').length, 3);
      assert.equal(row?.querySelectorAll('.sr-graph-empty-cell').length, 4);
      assert.equal(row?.querySelectorAll('.sr-paper-tail').length, 0);
      assert.equal(root.querySelectorAll('.sr-graph-structure-cell').length, 7);
      const structureRow = root.querySelector('.sr-graph-structure-row');
      assert.equal(structureRow?.getAttribute('aria-label'), 'Gat');
      assert.equal(structureRow?.querySelector(':scope > .sr-graph-structure-label')?.textContent, 'Gat');
      assert.equal(structureRow?.querySelector('.sr-graph-structure-cell .sr-graph-structure-label'), null);
      assert.deepEqual(
        [...structureRow.querySelectorAll('.sr-graph-structure-cell')].map((cell) => cell.style.gridColumn),
        ['1', '2', '3', '4', '5', '6', '7']
      );
      assert.deepEqual(
        [...row.querySelectorAll('.sr-cell')].map((cell) => cell.style.gridColumn),
        ['1', '2', '3']
      );
    },
  },
  {
    name: 'rhythm grid UI: graph repeats occupy dedicated structural cells outside matras',
    fn() {
      const parsed = parseDocument('tal: rupak\n\nGat\n||: S R G :||');
      assert.equal(parsed.problems.length, 0);
      const root = renderDocument(parsed.doc, {
        graphPaper: true,
        graphColumns: 7,
        maxSystemEm: 18.2,
      });
      const row = root.querySelector('.sr-graph-row');
      const cells = [...row.querySelectorAll('.sr-cell')];
      const open = row.querySelector('.sr-line-repeat-open');
      const close = row.querySelector('.sr-line-repeat-close');
      assert.equal(open?.textContent, '||:');
      assert.equal(close?.textContent, ':||');
      assert.equal(open?.parentElement, row);
      assert.equal(close?.parentElement, row);
      assert.equal(cells.some((cell) => cell.contains(open) || cell.contains(close)), false);
      assert.equal(open?.style.gridColumn, '1');
      assert.equal(close?.style.gridColumn, '5');
      assert.deepEqual(cells.map((cell) => cell.style.gridColumn), ['2', '3', '4']);
      assert.equal(row.querySelectorAll('.sr-graph-empty-cell').length, 2);
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
    name: 'rhythm grid UI: bols occupy a per-matra strip with exact attack targets',
    fn() {
      const parsed = parseDocument('tal: rupak\n\nGat\nS [R G]\n> da diri');
      assert.equal(parsed.problems.length, 0);
      const root = renderDocument(parsed.doc, {
        graphPaper: true,
        graphColumns: 7,
        maxSystemEm: 18.2,
      });
      const cells = [...root.querySelectorAll('.sr-graph-row .sr-cell')];
      assert.equal(cells[0].classList.contains('sr-has-bol-lane'), true);
      assert.equal(cells[1].classList.contains('sr-has-bol-lane'), true);
      assert.deepEqual(
        [...root.querySelectorAll('[data-bol-attack-ordinal]')].map((slot) => slot.dataset.bolAttackOrdinal),
        ['0', '1', '2']
      );
      assert.equal(root.querySelector('[data-bol-attack-ordinal="0"]').textContent, '|');
      assert.equal(root.querySelector('[data-bol-attack-ordinal="1"]').textContent, 'V');
      assert.equal(root.querySelector('[data-bol-attack-ordinal="1"]').dataset.bolRate, '2');
      assert.equal(root.querySelector('[data-bol-attack-ordinal="2"]').textContent, '');
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
      const commandBar = await readFile(new URL('../src/shell/CommandBar.jsx', import.meta.url), 'utf8');
      const gridEditor = await readFile(new URL('../src/shell/GridEditor.jsx', import.meta.url), 'utf8');
      assert.match(app, /getPref\('rhythmGrid', false\)/);
      assert.match(app, /setPref\('rhythmGrid', value\)/);
      assert.match(app, /getPref\('rhythmGridStyle', 'cells'\)/);
      assert.match(app, /setPref\('rhythmGridStyle', next\)/);
      assert.match(preview, /onGridSelection\?\.\(rhythmGridIdentity\(cell\)\)/);
      assert.match(preview, /aria-label=\{rhythmGrid \? 'Graph-paper matra grid'/);
      assert.match(preview, /app-rhythm-grid-paper/);
      assert.match(commandBar, /aria-label="Grid appearance"/);
      assert.match(commandBar, />Cells<\/button>/);
      assert.match(commandBar, />Graph Paper<\/button>/);
      assert.match(gridEditor, /app-grid-writer-paper/);
    },
  },
  {
    name: 'rhythm grid UI: ornaments and dense matras reserve readable grid spans',
    fn() {
      const result = parseDocument('tal: rupak\n\nGat\n{m}g | [S R G m]');
      assert.equal(result.problems.length, 0);
      const root = renderDocument(result.doc);
      assert.deepEqual(
        [...root.querySelectorAll('.sr-cell')].map((cell) => cell.dataset.gridSpan),
        ['2', '2']
      );
    },
  },
  {
    name: 'rhythm grid UI: prose uses a compact strip between full matra rows',
    async fn() {
      const css = await readFile(new URL('../src/shell/sargam.css', import.meta.url), 'utf8');
      assert.match(css, /--sr-graph-label-height:\s*1\.85em/);
      assert.match(css, /--sr-graph-label-height:\s*1\.65em/);
      assert.match(css, /grid-auto-rows:\s*minmax\(var\(--sr-graph-label-height\), auto\)/);
      assert.match(css, /\.sr-graph-structure-label\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*text-transform:\s*none;/s);
    },
  },
];
