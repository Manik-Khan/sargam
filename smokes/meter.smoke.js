// smokes/meter.smoke.js — exact local-meter math, selection authoring,
// generated companion syntax, validation, and shell integration seams.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyMeterToSelection,
  clearMeterFromSelection,
  formatRational,
  parseMeterDocument,
  parseMeterValue,
  structuralMeterSpans,
  scanMusicLine,
  selectionToMeterRange,
  validateMeterRange,
} from '../src/engine/meter.js';
import { parseDocument } from '../src/engine/parse.js';
import { scheduleDocument } from '../src/engine/schedule.js';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');
const line = '@8 .D--.n -S gm | D - ~(D m) [[g---RS R-]] S-';

export const smokes = [
  {
    name: 'meter: ratios produce exact local units',
    async fn() {
      assert.equal(formatRational(parseMeterValue('4/3').unit), '3/4');
      assert.equal(formatRational(parseMeterValue('6').unit), '1/6');
      assert.equal(parseMeterValue('three').ok, false);
    },
  },
  {
    name: 'meter: canonical Jhaptal pickup attacks are exact',
    async fn() {
      const scan = scanMusicLine(line);
      assert.equal(scan.error, null);
      assert.deepEqual(
        scan.attacks.slice(0, 6).map((a) => `${a.ch}@${formatRational(a.time)}`),
        ['D@0', 'n@3/4', 'S@3/2', 'g@2', 'm@5/2', 'D@3'],
      );
    },
  },
  {
    name: 'meter: selection uses first and last attacks as arch boundaries',
    async fn() {
      const text = `${line}\n`;
      const start = text.indexOf('.D');
      const end = text.indexOf('S', text.indexOf('-S')) + 1;
      const selection = selectionToMeterRange(text, start, end);
      assert.equal(selection.ok, true);
      assert.equal(formatRational(selection.start), '0');
      assert.equal(formatRational(selection.end), '3/2');
      assert.equal(validateMeterRange(selection, parseMeterValue('4/3')).ok, true);
    },
  },
  {
    name: 'meter: Apply writes and reparses a generated companion lane',
    async fn() {
      const text = `${line}\n`;
      const start = text.indexOf('.D');
      const end = text.indexOf('S', text.indexOf('-S')) + 1;
      const applied = applyMeterToSelection(text, start, end, '4/3');
      assert.equal(applied.ok, true);
      assert.match(applied.text, />> 4\/3 @0\.\.3\/2/);
      const parsed = parseMeterDocument(applied.text);
      assert.equal(parsed.spans.length, 1);
      assert.deepEqual(parsed.problems, []);
    },
  },
  {
    name: 'meter: six-grid krintan lands on khali and seven slots are rejected',
    async fn() {
      const text = `${line}\n`;
      const start = text.indexOf('g---RS');
      const end = text.indexOf('R-', start) + 1;
      assert.equal(applyMeterToSelection(text, start, end, '6').ok, true);
      const seven = text.replace('g---RS', 'g----RS');
      const sevenStart = seven.indexOf('g----RS');
      const sevenEnd = seven.indexOf('R-', sevenStart) + 1;
      assert.equal(applyMeterToSelection(seven, sevenStart, sevenEnd, '6').ok, false);
    },
  },
  {
    name: 'meter: sequential selections generate one sorted companion lane',
    async fn() {
      let text = `${line}\n`;
      let start = text.indexOf('.D');
      let end = text.indexOf('S', text.indexOf('-S')) + 1;
      let result = applyMeterToSelection(text, start, end, '4/3');
      assert.equal(result.ok, true);
      text = result.text;

      start = text.indexOf('S', text.indexOf('-S'));
      end = text.indexOf('D', start) + 1;
      result = applyMeterToSelection(text, start, end, '2');
      assert.equal(result.ok, true);
      text = result.text;

      start = text.indexOf('g---RS');
      end = text.indexOf('R-', start) + 1;
      result = applyMeterToSelection(text, start, end, '6');
      assert.equal(result.ok, true);
      assert.match(result.text, />> 4\/3 @0\.\.3\/2; 2 @3\/2\.\.3; 6 @7\.\.8/);
      assert.deepEqual(parseMeterDocument(result.text).problems, []);
    },
  },
  {
    name: 'meter: generated lane sits between music and an existing bol line',
    async fn() {
      const text = `${line}\n> Dha - - -\n`;
      const start = text.indexOf('.D');
      const end = text.indexOf('S', text.indexOf('-S')) + 1;
      const applied = applyMeterToSelection(text, start, end, '4/3');
      assert.equal(applied.ok, true);
      assert.match(applied.text, new RegExp(`${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\n>> 4\/3 @0\.\.3\/2\n> Dha`));
    },
  },
  {
    name: 'meter: Clear removes an empty generated lane',
    async fn() {
      const text = `${line}\n`;
      const start = text.indexOf('.D');
      const end = text.indexOf('S', text.indexOf('-S')) + 1;
      const applied = applyMeterToSelection(text, start, end, '4/3');
      const cleared = clearMeterFromSelection(applied.text, start, end);
      assert.equal(cleared.ok, true);
      assert.doesNotMatch(cleared.text, /^>>/m);
    },
  },
  {
    name: 'meter: parser reserves >> before the existing bol branch',
    async fn() {
      const parse = await read('../src/engine/parse.js');
      assert.match(parse, /SARGAM_METER_LANE_SKIP/);
      assert.ok(parse.indexOf("trimmed.startsWith('>>')") < parse.indexOf("trimmed.startsWith('>')"));
    },
  },
  {
    name: 'meter: local grid schedules exact subdivision clicks on every phrase-repeat pass',
    fn() {
      const text = 'tal: tintal\n\n(SRgm)x2\n>> 4 @0..3/4\n';
      const parsed = parseDocument(text);
      const meters = structuralMeterSpans(parseMeterDocument(text).spans, []);
      const schedule = scheduleDocument(parsed.doc, { meterSpans: meters });
      const ticks = schedule.events.filter((event) => event.subdivision);
      assert.deepEqual(ticks.map((event) => event.t), [0.25, 0.5, 0.75, 1.25, 1.5, 1.75]);
      assert.ok(ticks.every((event) => event.localMeter === '4'));
    },
  },
  {
    name: 'meter: score anchors and legacy lanes normalize into one structural model',
    fn() {
      const spans = structuralMeterSpans([], [{
        id: 'a1',
        kind: 'meter',
        value: '6',
        status: 'resolved',
        resolvedStart: { sourceLine: 3, time: '0' },
        resolvedEnd: { sourceLine: 3, time: '5/6' },
      }]);
      assert.equal(spans.length, 1);
      assert.equal(spans[0].label, '6');
      assert.equal(formatRational(spans[0].unit), '1/6');
    },
  },
  {
    name: 'meter: shell connects authoring, playback timing, and the Rhythm Grid view',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      const command = await read('../src/shell/CommandBar.jsx');
      const preview = await read('../src/shell/PreviewPane.jsx');
      assert.match(app, /applyMeterToSelection/);
      assert.match(app, /scheduleDocument\(doc, \{ meterSpans: structuralMeters \}\)/);
      assert.match(app, /meterSpans=\{structuralMeters\}/);
      assert.match(command, /placeholder="3, 6, 5\/7, 4\/3"/);
      assert.match(command, />Apply Meter</);
      assert.match(command, /onApplyMeter\?\.\(customMeter\)/);
      assert.match(command, />Rhythm Grid</);
      assert.match(preview, /mountMeterOverlays/);
      assert.match(preview, /app-rhythm-grid/);
      assert.doesNotMatch(await read('../src/engine/meter.js'), /scheduleDocument|createPlayer|AudioContext/);
    },
  },
];
