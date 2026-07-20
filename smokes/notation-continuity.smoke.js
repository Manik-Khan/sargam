// smokes/notation-continuity.smoke.js — export parity, local approach slides,
// repeat gutters, stable marker geometry, and bounded Gat returns.

import assert from 'node:assert/strict';
import { parseDocument } from '../src/engine/parse.js';
import { serializeDocument } from '../src/engine/serialize.js';
import { scheduleDocument } from '../src/engine/schedule.js';
import { scanRepeatedSlideAt } from '../src/engine/repeated-slide.js';
import { scanMusicLine } from '../src/engine/meter.js';
import { parseReturnCueToken, serializeReturnCue } from '../src/engine/return-cue.js';

export const smokes = [];
const test = (name, fn) => smokes.push({ name, fn });

test('continuity: repeated approach slides preserve D--D timing', () => {
  const scanned = scanRepeatedSlideAt('{n~}D--{n~}D', 0);
  assert.ok(scanned);
  assert.equal(scanned.next, '{n~}D--{n~}D'.length);
  assert.deepEqual(scanned.events.map((e) => [e.ch, e.dur.num, e.dur.den, e.writtenSlots]), [
    ['D', 3, 4, 3],
    ['D', 1, 4, undefined],
  ]);
  assert.deepEqual(scanned.events.map((e) => e.approachSlide.ch), ['n', 'n']);
  assert.deepEqual(scanned.groups.map((group) => group.destinationIndex), [4, 11]);
});

test('continuity: score anchors see both destinations in one matra', () => {
  const scanned = scanMusicLine('@8 {n~}D--{n~}D');
  assert.equal(scanned.error, null);
  assert.deepEqual(scanned.attacks.map((attack) => [attack.ch, attack.time.n, attack.time.d]), [
    ['D', 0, 1],
    ['D', 3, 4],
  ]);
  assert.deepEqual([scanned.duration.n, scanned.duration.d], [1, 1]);
});

test('continuity: repeated approach slide parses, schedules, and round-trips', () => {
  const source = '---\ntal: jhaptal\nsa: C\ntempo: 60\n---\n\n@n~\n';
  const text = source.replace('@n~', '@8 {n~}D--{n~}D');
  const { doc, problems } = parseDocument(text);
  assert.equal(problems.length, 0, problems.map((p) => p.msg).join('; '));
  const line = doc.sections[0].lines[0];
  assert.equal(line.matras.length, 1);
  assert.deepEqual(line.matras[0].events.map((e) => [e.ch, e.dur.num, e.dur.den]), [['D', 3, 4], ['D', 1, 4]]);
  const notes = scheduleDocument(doc).events.filter((e) => e.kind === 'note');
  assert.equal(notes.length, 2);
  assert.deepEqual(notes.map((e) => e.t), [0, 0.75]);
  assert.ok(notes.every((e) => Number.isFinite(e.glideFrom)));
  assert.match(serializeDocument(doc), /\{n~\}D--\{n~\}D/);
});

test('continuity: bounded Gat cue grammar is exclusive at the stop matra', () => {
  const parsed = parseReturnCueToken('gat@8..@1', { name: 'Jhaptal', matras: 10 });
  assert.deepEqual(parsed, { ok: true, cue: { target: 'gat', mode: 'range', matra: 8, stopMatra: 1 } });
  assert.equal(serializeReturnCue(parsed.cue), 'gat@8..@1');
});

test('continuity: gat@8..@1 plays only the three-matra mukra before the next line', () => {
  const source = `---\ntal: jhaptal\nsa: C\ntempo: 60\n---\n\nGat\n@8 ||: .D--.n -S gm D :||\n\nTaan\nD-n- D-mP -D-m -gm- g-R- Sg-R -S-.n gat@8..@1\nD R G m\n`;
  const { doc, problems } = parseDocument(source);
  assert.equal(problems.length, 0, problems.map((p) => p.msg).join('; '));
  const cueLine = doc.sections[1].lines[0];
  assert.deepEqual(cueLine.returnCue, { target: 'gat', mode: 'range', matra: 8, stopMatra: 1, targetSectionIndex: 0 });
  const schedule = scheduleDocument(doc);
  const starts = schedule.lineStarts;
  const firstTaan = starts.find((s) => s.sourceLine === 11);
  const nextTaan = starts.find((s) => s.sourceLine === 12);
  assert.ok(firstTaan && nextTaan);
  // Seven written taan matras + exactly three returned Gat matras.
  assert.equal(nextTaan.t - firstTaan.t, 10);
});

test('continuity: source contracts include export anchor parity and stable marker CSS', async () => {
  const fs = await import('node:fs/promises');
  const exportView = await fs.readFile(new URL('../src/shell/ExportView.jsx', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../src/shell/App.jsx', import.meta.url), 'utf8');
  const css = await fs.readFile(new URL('../src/shell/sargam.css', import.meta.url), 'utf8');
  const render = await fs.readFile(new URL('../src/engine/render.js', import.meta.url), 'utf8');
  assert.match(exportView, /stampAnchorTargets\(mountEl,\s*sourceText\)/);
  assert.match(exportView, /mountAnchorOverlays\(mountEl,\s*anchorMarks/);
  assert.match(app, /sourceText=\{text\}[\s\S]*anchorMarks=\{anchorModel\.marks\}/);
  assert.match(css, /\.sr-marker\s*\{[^}]*transition:\s*none/s);
  assert.match(css, /\.sr-repeat-open[\s\S]*position:\s*absolute/);
  assert.doesNotMatch(render, /if\s*\(showRepeatOpen\)\s*cols\.push/);
  assert.doesNotMatch(render, /if\s*\(showRepeatClose\)[\s\S]{0,100}cols\.push/);
});
