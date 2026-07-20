import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  addAnchorMark,
  parseAnchorDocument,
  parseAnchorMetadata,
  removeAnchorMark,
  stripAnchorMetadata,
  updateAnchorMark,
} from '../src/engine/anchors.js';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');
const music = `---\ntal: jhaptal\n---\n\nGAT\n@8 ||: .D--.n -S gm D - ~(D m) [[g---RS R-]] S- :||`;
const diriMusic = `---\ntal: jhaptal\n---\n\nGAT\n.D--.n -S gm D - ~(D m) P-D- m-gg R-S- gat`;

export const smokes = [
  {
    name: 'anchors: point metadata round-trips without changing musical text',
    fn() {
      const point = addAnchorMark(music, {
        kind: 'da',
        start: { anchorKind: 'attack', sourceLine: 6, ordinal: 0, time: '0', note: 'D' },
      });
      assert.equal(point.ok, true);
      assert.match(point.text, /sargam-anchors:v1/);
      assert.equal(stripAnchorMetadata(point.text), music);
    },
  },
  {
    name: 'anchors: generated structure preserves source bytes exactly',
    fn() {
      for (const source of [
        music,
        `${music}\n`,
        `${music}\n\n`,
        `${music}  \t`,
        music.replaceAll('\n', '\r\n'),
      ]) {
        const point = addAnchorMark(source, {
          kind: 'chikari',
          start: { anchorKind: 'attack', sourceLine: 6, ordinal: 0, time: '0', note: 'D' },
        });
        assert.equal(point.ok, true);
        assert.equal(stripAnchorMetadata(point.text), source);
      }
    },
  },
  {
    name: 'anchors: Diri connects the two consecutive g attacks in m-gg',
    fn() {
      const good = addAnchorMark(diriMusic, {
        kind: 'diri',
        start: { anchorKind: 'attack', sourceLine: 6, ordinal: 11, time: '17/2', note: 'g' },
        end: { anchorKind: 'attack', sourceLine: 6, ordinal: 12, time: '35/4', note: 'g' },
      });
      assert.equal(good.ok, true);
      const bad = addAnchorMark(music, {
        kind: 'diri',
        start: { anchorKind: 'attack', sourceLine: 6, ordinal: 0, time: '0', note: 'D' },
        end: { anchorKind: 'attack', sourceLine: 6, ordinal: 2, time: '3/2', note: 'S' },
      });
      assert.equal(bad.ok, false);
    },
  },
  {
    name: 'anchors: meter span accepts an open-ended custom ratio',
    fn() {
      const meter = addAnchorMark(music, {
        kind: 'meter', value: '11/8',
        start: { anchorKind: 'attack', sourceLine: 6, ordinal: 8, time: '7', note: 'g' },
        end: { anchorKind: 'attack', sourceLine: 6, ordinal: 11, time: '8', note: 'R' },
      });
      assert.equal(meter.ok, true);
      assert.equal(parseAnchorMetadata(meter.text).marks[0].value, '11/8');
      assert.equal(parseAnchorDocument(meter.text).marks[0].status, 'resolved');
    },
  },
  {
    name: 'anchors: nearby source-line movement reconciles stored musical context',
    fn() {
      const point = addAnchorMark(music, {
        kind: 'da',
        start: { anchorKind: 'attack', sourceLine: 6, ordinal: 0, time: '0', note: 'D' },
      });
      const moved = point.text.replace('\nGAT\n', '\nA NOTE\n\nGAT\n');
      const parsed = parseAnchorDocument(moved);
      assert.ok(['resolved', 'repaired'].includes(parsed.marks[0].status));
    },
  },
  {
    name: 'anchors: duplicate moved passages become ambiguous instead of silently jumping',
    fn() {
      const point = addAnchorMark(music, {
        kind: 'da',
        start: { anchorKind: 'attack', sourceLine: 6, ordinal: 0, time: '0', note: 'D' },
      });
      const line = music.split('\n')[5];
      const moved = point.text.replace(`GAT\n${line}`, `${line}\nA NOTE\n${line}`);
      const parsed = parseAnchorDocument(moved);
      assert.equal(parsed.marks[0].status, 'ambiguous');
    },
  },
  {
    name: 'anchors: handles update and selected marks remove cleanly',
    fn() {
      const meter = addAnchorMark(music, {
        kind: 'meter', value: '6',
        start: { anchorKind: 'attack', sourceLine: 6, ordinal: 8, time: '7', note: 'g' },
        end: { anchorKind: 'attack', sourceLine: 6, ordinal: 11, time: '8', note: 'R' },
      });
      const moved = updateAnchorMark(meter.text, meter.mark.id, 'end', {
        anchorKind: 'boundary', sourceLine: 6, time: '9', boundary: '9',
      });
      assert.equal(moved.ok, true);
      const removed = removeAnchorMark(moved.text, meter.mark.id);
      assert.equal(removed.ok, true);
      assert.equal(parseAnchorMetadata(removed.text).marks.length, 0);
    },
  },
  {
    name: 'anchors: parser, CodeMirror, score surface, and export-marker seams are present',
    async fn() {
      const parse = await read('../src/engine/parse.js');
      const editor = await read('../src/shell/EditorPane.jsx');
      const preview = await read('../src/shell/PreviewPane.jsx');
      const command = await read('../src/shell/CommandBar.jsx');
      const exportView = await read('../src/shell/ExportView.jsx');
      assert.match(parse, /SARGAM_ANCHOR_METADATA_SKIP/);
      assert.match(editor, /CodeMirror|EditorView/);
      assert.match(editor, /Clean/);
      assert.match(editor, /Structure/);
      assert.match(preview, /stampAnchorTargets/);
      assert.match(command, /Diri/);
      assert.match(command, /Chikari/);
      assert.match(exportView, /SARGAM_EXPORT_MARKER_ALIGNMENT/);
    },
  },
];
