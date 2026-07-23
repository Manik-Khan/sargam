import assert from 'node:assert/strict';
import {
  applyBolCaptureKey,
  beginBolCapture,
  bolCursorSelection,
  moveBolCursor,
  setBolAtCursor,
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
      assert.match(result.text, /S- SS SS SS\n> \n/);
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
      assert.match(result.text, /S- SS SS SS\n> \n/);
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
      assert.match(text, /S- SS SS SS\n> da ra\n/);
      const parsed = parseDocument(text);
      assert.deepEqual(parsed.problems, []);
      assert.deepEqual(parsed.doc.sections[0].lines[0].bols.map((bol) => bol.mark), ['da', 'ra']);
      assert.deepEqual(parseAnchorDocument(text).marks, []);
    },
  },
  {
    name: 'bol capture: diri writes an explicit two-attack span and advances by two',
    fn() {
      const result = setBolAtCursor(source, { sourceLine: 3, ordinal: 4 }, 'diri');
      assert.equal(result.ok, true);
      assert.deepEqual(result.cursor, { sourceLine: 3, ordinal: 6 });
      assert.match(result.text, /> \. \. \. \. diri \./);
      const parsed = parseDocument(result.text);
      assert.deepEqual(parsed.doc.sections[0].lines[0].bols.map((bol) => bol.mark), ['diri']);
      assert.deepEqual(parseAnchorDocument(result.text).marks, []);
    },
  },
  {
    name: 'bol capture: entering a correction replaces an overlapping diri',
    fn() {
      const diri = setBolAtCursor(source, { sourceLine: 3, ordinal: 2 }, 'diri');
      const corrected = setBolAtCursor(diri.text, { sourceLine: 3, ordinal: 3 }, 'da');
      assert.equal(corrected.ok, true);
      assert.match(corrected.text, /> \. \. \. da/);
      assert.doesNotMatch(corrected.text, /diri/);
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
      assert.match(result.text, /S- SS SS SS\n> da\n/);
      assert.deepEqual(parseAnchorDocument(result.text).marks, []);
      assert.match(result.message, /Moved 1 existing bol mark/);
    },
  },
  {
    name: 'bol capture: source selection follows the editable token lane',
    fn() {
      const result = setBolAtCursor(source, { sourceLine: 3, ordinal: 0 }, 'da');
      const range = bolCursorSelection(result.text, { sourceLine: 3, ordinal: 0 });
      assert.equal(result.text.slice(range.from, range.to), 'da');
      const next = bolCursorSelection(result.text, result.cursor);
      assert.equal(next.from, result.text.indexOf('> da') + 4);
      assert.equal(next.to, next.from);
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
      assert.match(result.message, /music line already owns/);
    },
  },
  {
    name: 'bol capture: EditorPane exposes mode, keyboard gestures, and preview cursor seams',
    async fn() {
      const fs = await import('node:fs/promises');
      const editor = await fs.readFile(new URL('../src/shell/EditorPane.jsx', import.meta.url), 'utf8');
      const app = await fs.readFile(new URL('../src/shell/App.jsx', import.meta.url), 'utf8');
      const preview = await fs.readFile(new URL('../src/shell/PreviewPane.jsx', import.meta.url), 'utf8');
      assert.match(editor, /Bol Capture: ON/);
      assert.match(editor, /WRITING > BOL LINE/);
      assert.match(editor, /bolCursorSelection/);
      assert.match(editor, /bolCaptureKeymap/);
      assert.match(editor, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
      assert.match(app, /applyBolCaptureKey/);
      assert.match(app, /textRef\.current/);
      assert.match(preview, /bolCapture/);
    },
  },
];
