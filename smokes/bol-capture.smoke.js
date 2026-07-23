import assert from 'node:assert/strict';
import {
  applyBolCaptureKey,
  beginBolCapture,
  moveBolCursor,
  setBolAtCursor,
} from '../src/engine/bol-capture.js';
import { parseAnchorDocument } from '../src/engine/anchors.js';

const source = 'tal: tintal\n\nS- SS SS SS\n';
const lineStart = source.indexOf('S-');

export const smokes = [
  {
    name: 'bol capture: begins on the caret music line and follows note attacks, not held slots',
    fn() {
      const result = beginBolCapture(source, lineStart);
      assert.equal(result.ok, true);
      assert.deepEqual(result.cursor, { sourceLine: 3, ordinal: 0 });
      const done = moveBolCursor(source, result.cursor, 7);
      assert.deepEqual(done.cursor, { sourceLine: 3, ordinal: 7 });
      assert.match(done.message, /7\/7/);
    },
  },
  {
    name: 'bol capture: arrow gestures place point bols and left/right remain navigation',
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
      assert.equal(result.text, undefined);
      assert.deepEqual(result.cursor, { sourceLine: 3, ordinal: 1 });
      const marks = parseAnchorDocument(text).marks;
      assert.deepEqual(marks.map((mark) => [mark.kind, mark.resolvedStart.ordinal]), [
        ['da', 0],
        ['ra', 1],
      ]);
    },
  },
  {
    name: 'bol capture: diri spans exactly two consecutive attacks and advances by two',
    fn() {
      const result = setBolAtCursor(source, { sourceLine: 3, ordinal: 4 }, 'diri');
      assert.equal(result.ok, true);
      assert.deepEqual(result.cursor, { sourceLine: 3, ordinal: 6 });
      const [mark] = parseAnchorDocument(result.text).marks;
      assert.equal(mark.kind, 'diri');
      assert.equal(mark.resolvedStart.ordinal, 4);
      assert.equal(mark.resolvedEnd.ordinal, 5);
    },
  },
  {
    name: 'bol capture: entering a correction replaces an overlapping diri',
    fn() {
      const diri = setBolAtCursor(source, { sourceLine: 3, ordinal: 2 }, 'diri');
      const corrected = setBolAtCursor(diri.text, { sourceLine: 3, ordinal: 3 }, 'da');
      assert.equal(corrected.ok, true);
      const marks = parseAnchorDocument(corrected.text).marks;
      assert.deepEqual(marks.map((mark) => mark.kind), ['da']);
      assert.equal(marks[0].resolvedStart.ordinal, 3);
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
      assert.match(result.message, /note line already owns/);
    },
  },
  {
    name: 'bol capture: EditorPane exposes mode, keyboard gestures, and preview cursor seams',
    async fn() {
      const fs = await import('node:fs/promises');
      const editor = await fs.readFile(new URL('../src/shell/EditorPane.jsx', import.meta.url), 'utf8');
      const app = await fs.readFile(new URL('../src/shell/App.jsx', import.meta.url), 'utf8');
      const preview = await fs.readFile(new URL('../src/shell/PreviewPane.jsx', import.meta.url), 'utf8');
      assert.match(editor, /Bol Capture on/);
      assert.match(editor, /↓ da · ↑ ra · v diri/);
      assert.match(app, /applyBolCaptureKey/);
      assert.match(preview, /bolCapture/);
    },
  },
];
