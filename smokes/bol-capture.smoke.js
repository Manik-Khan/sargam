import assert from 'node:assert/strict';
import {
  applyBolCaptureKey,
  beginBolCapture,
  beginBolCaptureAt,
  bolCursorSelection,
  migrateAllBolAnchors,
  moveBolCursor,
  removeBolAtAttack,
  setBolAtAttack,
  setBolAtCursor,
  switchBolPass,
} from '../src/engine/bol-capture.js';
import { addAnchorMark, parseAnchorDocument } from '../src/engine/anchors.js';
import { parseDocument } from '../src/engine/parse.js';
import { createBolCaptureBindings } from '../src/shell/bol-capture-keymap.js';

const source = 'tal: tintal\n\nS- SS SS SS\n';
const lineStart = source.indexOf('S-');

export const smokes = [
  {
    name: 'bol capture: activation creates the editable lane and begins at phrase head',
    fn() {
      const result = beginBolCapture(source, source.indexOf('\n', lineStart));
      assert.equal(result.ok, true);
      assert.deepEqual(result.cursor, { sourceLine: 3, ordinal: 0 });
      assert.match(result.text, /S- SS SS SS\n> \.- \. \. \. \. \. \.\n/);
      const done = moveBolCursor(result.text, result.cursor, 7);
      assert.deepEqual(done.cursor, { sourceLine: 3, ordinal: 7 });
      assert.match(done.message, /7\/7/);
    },
  },
  {
    name: 'bol capture: a blank line immediately after music needs no highlighted selection',
    fn() {
      const withBlank = `${source}\n`;
      const result = beginBolCapture(withBlank, withBlank.length);
      assert.equal(result.ok, true);
      assert.deepEqual(result.cursor, { sourceLine: 3, ordinal: 0 });
      assert.match(result.text, /S- SS SS SS\n> \.- \. \. \. \. \. \.\n/);
    },
  },
  {
    name: 'bol capture: Grid Write can begin on an exact attack without a text caret',
    fn() {
      const result = beginBolCaptureAt(source, 3, 4);
      assert.equal(result.ok, true);
      assert.deepEqual(result.cursor, { sourceLine: 3, ordinal: 4 });
      assert.match(result.text, /S- SS SS SS\n> \.- \. \. \. \. \. \.\n/);
      assert.match(result.message, /Attack 5 of 7/);
    },
  },
  {
    name: 'bol menu: Grid Write applies and removes a bol at the clicked attack without capture state',
    fn() {
      const added = setBolAtAttack(source, 3, 4, 'chikari');
      assert.equal(added.ok, true);
      assert.match(added.message, /attached to note 5/);
      let line = parseDocument(added.text).doc.sections[0].lines[0];
      assert.equal(line._bolPasses[0].bols[0].mark, 'chikari');
      assert.deepEqual(line._bolPasses[0].bols[0].ref, { matraIndex: 2, eventIndex: 1 });
      const removed = removeBolAtAttack(added.text, 3, 4);
      assert.equal(removed.ok, true);
      assert.match(removed.message, /removed from note 5/);
      line = parseDocument(removed.text).doc.sections[0].lines[0];
      assert.equal(line._bolPasses[0].bols.length, 0);
    },
  },
  {
    name: 'bol capture: high-priority CodeMirror bindings claim arrows while active',
    fn() {
      const received = [];
      const bindings = createBolCaptureBindings((key) => {
        received.push(key);
        return true;
      });
      assert.equal(bindings.find((binding) => binding.key === 'ArrowDown').run(), true);
      assert.equal(bindings.find((binding) => binding.key === 'ArrowUp').run(), true);
      assert.deepEqual(received, ['ArrowDown', 'ArrowUp']);
    },
  },
  {
    name: 'bol capture: arrow gestures write the visible bol line and left/right navigate',
    fn() {
      let text = source;
      let cursor = { sourceLine: 3, ordinal: 0 };
      let result = applyBolCaptureKey(text, cursor, 'ArrowDown');
      text = result.text;
      cursor = result.cursor;
      assert.deepEqual(cursor, { sourceLine: 3, ordinal: 1 });
      result = applyBolCaptureKey(text, cursor, 'ArrowUp');
      text = result.text;
      cursor = result.cursor;
      assert.deepEqual(cursor, { sourceLine: 3, ordinal: 2 });
      result = applyBolCaptureKey(text, cursor, 'ArrowLeft');
      assert.equal(result.text, text);
      assert.deepEqual(result.cursor, { sourceLine: 3, ordinal: 1 });
      assert.match(text, /S- SS SS SS\n> da- ra \. \. \. \. \.\n/);
      const parsed = parseDocument(text);
      assert.deepEqual(parsed.problems, []);
      assert.deepEqual(parsed.doc.sections[0].lines[0].bols.map((bol) => bol.mark), ['da', 'ra']);
      assert.deepEqual(parseAnchorDocument(text).marks, []);
    },
  },
  {
    name: 'bol capture: diri doubles one note and advances by one attack',
    fn() {
      const result = setBolAtCursor(source, { sourceLine: 3, ordinal: 4 }, 'diri');
      assert.equal(result.ok, true);
      assert.deepEqual(result.cursor, { sourceLine: 3, ordinal: 5 });
      assert.match(result.text, /> \.- \. \. \. diri \. \./);
      const parsed = parseDocument(result.text);
      assert.deepEqual(parsed.doc.sections[0].lines[0].bols.map((bol) => bol.mark), ['diri']);
      assert.equal(parsed.doc.sections[0].lines[0].bols[0].rate, 2);
      assert.deepEqual(parseAnchorDocument(result.text).marks, []);
    },
  },
  {
    name: 'bol capture: a neighboring bol does not erase a per-note diri',
    fn() {
      const diri = setBolAtCursor(source, { sourceLine: 3, ordinal: 2 }, 'diri');
      const corrected = setBolAtCursor(diri.text, { sourceLine: 3, ordinal: 3 }, 'da');
      assert.equal(corrected.ok, true);
      assert.match(corrected.text, /> \.- \. diri da \. \. \./);
    },
  },
  {
    name: 'bol capture: activation migrates old hidden bol anchors into the editable lane',
    fn() {
      const start = {
        anchorKind: 'attack',
        sourceLine: 3,
        time: '0',
        ordinal: 0,
        note: 'S',
      };
      const anchored = addAnchorMark(source, { kind: 'da', start });
      assert.equal(anchored.ok, true);
      const result = beginBolCapture(anchored.text, lineStart);
      assert.equal(result.ok, true);
      assert.match(result.text, /S- SS SS SS\n> da- \. \. \. \. \. \.\n/);
      assert.deepEqual(parseAnchorDocument(result.text).marks, []);
      assert.match(result.message, /Moved 1 existing bol mark/);
    },
  },
  {
    name: 'bol migration: Grid Write upgrades all old anchors to editable per-note lanes',
    fn() {
      const oldSource = 'tal: tintal\n\nS R g m\n';
      const withDa = addAnchorMark(oldSource, {
        kind: 'da',
        start: { anchorKind: 'attack', sourceLine: 3, ordinal: 0, time: '0', note: 'S' },
      });
      const withDiri = addAnchorMark(withDa.text, {
        kind: 'diri',
        start: { anchorKind: 'attack', sourceLine: 3, ordinal: 1, time: '1', note: 'R' },
        end: { anchorKind: 'attack', sourceLine: 3, ordinal: 2, time: '2', note: 'g' },
      });
      assert.equal(withDiri.ok, true);
      const migrated = migrateAllBolAnchors(withDiri.text);
      assert.equal(migrated.ok, true);
      assert.equal(migrated.count, 2);
      assert.match(migrated.text, /S R g m\n> da diri \. \.\n/);
      assert.deepEqual(parseAnchorDocument(migrated.text).marks, []);
      assert.deepEqual(
        parseDocument(migrated.text).doc.sections[0].lines[0].bols.map((bol) => ({ mark: bol.mark, rate: bol.rate })),
        [{ mark: 'da', rate: undefined }, { mark: 'diri', rate: 2 }]
      );
    },
  },
  {
    name: 'bol capture: source selection follows the editable token lane',
    fn() {
      const result = setBolAtCursor(source, { sourceLine: 3, ordinal: 0 }, 'da');
      const range = bolCursorSelection(result.text, { sourceLine: 3, ordinal: 0 });
      assert.equal(result.text.slice(range.from, range.to), 'da');
      const next = bolCursorSelection(result.text, result.cursor);
      assert.equal(result.text.slice(next.from, next.to), '.');
    },
  },
  {
    name: 'bol capture: hyphen does not duplicate or alter note-line meter',
    fn() {
      const cursor = { sourceLine: 3, ordinal: 1 };
      const result = applyBolCaptureKey(source, cursor, '-');
      assert.equal(result.handled, true);
      assert.equal(result.text, source);
      assert.deepEqual(result.cursor, cursor);
      assert.match(result.message, /hold markers are already mirrored/);
    },
  },
  {
    name: 'bol capture: holds and phrase repeats mirror the exact notation structure',
    fn() {
      const music = 'tal: tintal\n\n@10 gR (S--S SSSS)x2 S-SS\n';
      let result = beginBolCapture(music, music.indexOf('@10'));
      assert.equal(result.ok, true);
      assert.match(result.text, /> \. \. \(\.--\. \. \. \. \.\)x2 \.-\. \.\n/);
      for (const kind of ['da', 'da', 'da', 'da', 'ra', 'da', 'diri', 'diri']) {
        result = setBolAtCursor(result.text, result.cursor, kind);
        assert.equal(result.ok, true);
      }
      assert.match(
        result.text,
        /> da da \(da--da ra da diri diri\)x2 \.-\. \.\n/
      );
      const parsed = parseDocument(result.text);
      assert.deepEqual(parsed.problems, []);
      assert.deepEqual(
        parsed.doc.sections[0].lines[0].bols.map((bol) => bol.mark),
        ['da', 'da', 'da', 'da', 'ra', 'da', 'diri', 'diri']
      );
      assert.equal(parsed.doc.sections[0].lines[0].bols.at(-1).rate, 2);
    },
  },
  {
    name: 'bol capture: four per-note diris make eight strikes in one four-note matra',
    fn() {
      const music = 'tal: tintal\n\n(S--S SSSS)x2\n';
      const started = beginBolCapture(music, music.indexOf('('));
      let result = switchBolPass(started.text, started.cursor, 2);
      assert.equal(result.ok, true);
      assert.match(result.text, />1 \(\.--\. \. \. \. \.\)x2/);
      assert.match(result.text, />2 \(\.--\. \. \. \. \.\)x2/);
      for (let ordinal = 2; ordinal < 6; ordinal++) {
        result = setBolAtCursor(result.text, { sourceLine: 3, ordinal, pass: 2 }, 'diri');
        assert.equal(result.ok, true);
      }
      assert.match(result.text, />2 \(\.--\. diri diri diri diri\)x2/);
      const line = parseDocument(result.text).doc.sections[0].lines[0];
      assert.deepEqual(line._bolPasses[1].bols.map((bol) => bol.rate), [2, 2, 2, 2]);
    },
  },
  {
    name: 'bol capture: Text Write keeps keyboard capture while Grid Write exposes direct plus menus',
    async fn() {
      const fs = await import('node:fs/promises');
      const editor = await fs.readFile(new URL('../src/shell/EditorPane.jsx', import.meta.url), 'utf8');
      const app = await fs.readFile(new URL('../src/shell/App.jsx', import.meta.url), 'utf8');
      const preview = await fs.readFile(new URL('../src/shell/PreviewPane.jsx', import.meta.url), 'utf8');
      const gridEditor = await fs.readFile(new URL('../src/shell/GridEditor.jsx', import.meta.url), 'utf8');
      assert.match(editor, /Bol Capture: ON/);
      assert.match(editor, /BOL PASS/);
      assert.match(editor, /1–9 switch pass/);
      assert.match(editor, /bolCursorSelection/);
      assert.match(editor, /bolCaptureKeymap/);
      assert.match(editor, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
      assert.match(app, /applyBolCaptureKey/);
      assert.match(app, /textRef\.current/);
      assert.match(app, /setBolAtAttack/);
      assert.match(app, /removeBolAtAttack/);
      assert.match(preview, /bolCapture/);
      assert.match(gridEditor, /app-grid-write-bols/);
      assert.match(gridEditor, /app-grid-bol-menu/);
      assert.match(gridEditor, /onBolApply/);
      assert.match(gridEditor, /beneath a note adds its bol/);
      assert.doesNotMatch(gridEditor, /Grid Bol Capture/);
    },
  },
];
