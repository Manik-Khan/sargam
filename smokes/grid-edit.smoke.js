// smokes/grid-edit.smoke.js — direct matra writing updates the Markdown
// source without creating a second composition model.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  appendGridCellToken,
  gridLines,
  normalizeGridCellToken,
  replaceGridCellToken,
  setGridFirstEnding,
} from '../src/engine/grid-edit.js';
import { parseDocument } from '../src/engine/parse.js';

const SOURCE = `tal: rupak

Gat
S R G | m P - -
" sa re ga | ma pa
> da ra da | diri
`;

export const smokes = [
  {
    name: 'grid write: spaces inside one box become explicit subdivisions',
    fn() {
      assert.equal(normalizeGridCellToken(' S  R '), '[S R]');
      assert.equal(normalizeGridCellToken('SR'), 'SR');
      assert.equal(normalizeGridCellToken('{n}D'), '{n}D');
    },
  },
  {
    name: 'grid write: replacing one matra reparses immediately and preserves attachment lines',
    fn() {
      const result = replaceGridCellToken(SOURCE, 4, 1, 'g m');
      assert.equal(result.ok, true, result.message);
      assert.match(result.text, /^S \[g m\] G \| m P \| - -$/m);
      assert.match(result.text, /^" sa re ga \| ma pa$/m);
      assert.match(result.text, /^> da ra da \| diri$/m);
      const parsed = parseDocument(result.text);
      assert.equal(parsed.problems.filter((problem) => problem.line === 4).length, 0);
      assert.equal(parsed.doc.sections[0].lines[0].matras[1].events.length, 2);
    },
  },
  {
    name: 'grid write: holds, rests, and octave notes are ordinary cell values',
    fn() {
      const held = replaceGridCellToken(SOURCE, 4, 0, '-');
      assert.equal(held.ok, true, held.message);
      const rested = replaceGridCellToken(held.text, 4, 1, '.');
      assert.equal(rested.ok, true, rested.message);
      const octave = replaceGridCellToken(rested.text, 4, 2, "'S");
      assert.equal(octave.ok, true, octave.message);
      assert.match(octave.text, /^- \. 'S \| m P \| - -$/m);
    },
  },
  {
    name: 'grid write: a cell cannot silently become two matras',
    fn() {
      const result = replaceGridCellToken(SOURCE, 4, 1, 'S/R');
      assert.equal(result.ok, false);
      assert.match(result.message, /one matra/i);
      assert.equal(result.text, undefined);
    },
  },
  {
    name: 'grid write: cross-matra krintan and line repeats survive an unrelated edit',
    fn() {
      const source = 'tal: rupak\n\nGat\n||: [[dP/mg/RS]] - :||\n';
      const result = replaceGridCellToken(source, 4, 3, 'D');
      assert.equal(result.ok, true, result.message);
      assert.match(result.text, /\|\|: \[\[dP\/mg\/RS\]\] \| D :\|\|/);
      assert.equal(parseDocument(result.text).problems.length, 0);
    },
  },
  {
    name: 'grid write: adding a matra extends the same Markdown line',
    fn() {
      const result = appendGridCellToken(SOURCE, 4, 'n D');
      assert.equal(result.ok, true, result.message);
      assert.match(result.text, /S R G \| m P \| - - \| \[n D\]/);
      const rows = gridLines(result.doc);
      assert.equal(rows[0].cells.length, 8);
      assert.equal(rows[0].cells.at(-1).cycleMatra, 1);
      assert.equal(rows[0].cells.at(-1).marker, '0');
    },
  },
  {
    name: 'grid write: a visual first-ending marker adds, moves, and removes |1',
    fn() {
      const source = 'tal: rupak\n\nGat\n||: S R G m P D n :||\nS R G\n';
      const added = setGridFirstEnding(source, 4, 4);
      assert.equal(added.ok, true, added.message);
      assert.match(added.text, /^\|\|: S R G \| m \|1 P \| D n :\|\|$/m);
      assert.equal(parseDocument(added.text).doc.sections[0].lines[0].firstEndingFrom, 4);

      const moved = setGridFirstEnding(added.text, 4, 5);
      assert.equal(moved.ok, true, moved.message);
      assert.match(moved.text, /\|1 D n :\|\|/);

      const removed = setGridFirstEnding(moved.text, 4, null);
      assert.equal(removed.ok, true, removed.message);
      assert.doesNotMatch(removed.text, /\|1/);
      assert.equal(parseDocument(removed.text).doc.sections[0].lines[0].firstEndingFrom, null);
    },
  },
  {
    name: 'grid write: first and second ending rows are exposed to the editor',
    fn() {
      const source = 'tal: rupak\n\nGat\n||: S R G m |1 P D n :||\n@5 S R G\n';
      const rows = gridLines(parseDocument(source).doc);
      assert.equal(rows[0].lineRepeat, true);
      assert.equal(rows[0].firstEndingFrom, 4);
      assert.equal(rows[0].alternateEndingRole, 'first');
      assert.equal(rows[1].alternateEndingRole, 'second');
      assert.equal(rows[1].alternateEndingSourceLine, 4);
    },
  },
  {
    name: 'grid write: each matra exposes its exact note attacks and attached bol pass',
    fn() {
      const rows = gridLines(parseDocument(SOURCE).doc);
      const row = rows[0];
      assert.deepEqual(row.cells.map((cell) => cell.attacks.map((attack) => attack.ordinal)), [
        [0], [1], [2], [3], [4], [], [],
      ]);
      assert.equal(row.bolPasses[0].pass, 1);
      assert.deepEqual(row.bolPasses[0].marks.map((mark) => mark.mark), ['da', 'ra', 'da', 'diri']);
      assert.deepEqual(row.bolPasses[0].marks.at(-1), {
        ordinal: 3,
        toOrdinal: 3,
        mark: 'diri',
        rate: 2,
      });
    },
  },
  {
    name: 'grid write: shell exposes persistent Text Write and Grid Write modes',
    async fn() {
      const app = await readFile(new URL('../src/shell/App.jsx', import.meta.url), 'utf8');
      const editor = await readFile(new URL('../src/shell/GridEditor.jsx', import.meta.url), 'utf8');
      assert.match(app, /getPref\('writeMode', 'text'\)/);
      assert.match(app, />Text Write<\/button>/);
      assert.match(app, />Grid Write<\/button>/);
      assert.match(app, /<GridEditor/);
      assert.match(editor, /replaceGridCellToken/);
      assert.match(editor, /appendGridCellToken/);
      assert.match(editor, /One box = one matra/);
      assert.match(editor, /beneath a note adds its bol/);
      assert.match(editor, /app-grid-bol-menu/);
      assert.match(editor, /createPortal[\s\S]*?app-grid-bol-menu-floating/);
      assert.match(editor, /bolMenuPosition[\s\S]*?position: 'fixed'/);
      assert.match(editor, /copyBolLanes[\s\S]*?navigator\.clipboard\.writeText[\s\S]*?>Copy bols</);
      assert.match(editor, /kind: 'diri', label: 'diri · 2 strokes'/);
      assert.match(editor, /Add 1st ending/);
      assert.match(editor, /Start here/);
      assert.match(editor, /2nd ending/);
      assert.match(editor, /setGridFirstEnding/);
    },
  },
];
