import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { serializeDocument } from '../src/engine/serialize.js';
import { scheduleDocument, degreeFreq, parseSa } from '../src/engine/schedule.js';
import { scanMusicLine } from '../src/engine/meter.js';
import { renderDocument } from '../src/engine/render.js';
import { positionFromSource } from '../src/shell/notation-navigation.js';
import { prepareOrnamentEdit } from '../src/shell/notation-authoring.js';
const value = f => f.num / f.den;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function fixture(music, tal = 'free') {
  const text = `---\ntal: ${tal}\ntempo: 60\n---\n${music}`;
  const parsed = parseDocument(text);
  assert.deepEqual(parsed.problems, []);
  return { text, doc: parsed.doc, line: parsed.doc.sections[0].lines[0], notes: scheduleDocument(parsed.doc).events.filter(e => e.kind === 'note') };
}
function model(line) {
  return { cells: line.matras.map(m => ({ events: m.events, duration: m.duration })),
    spans: line.spans, repeats: line.phraseRepeats };
}
export const smokes = [
  { name: 'inline grace: G{P}m retains Gm timing, glyph destination and kan arc', fn() {
    const f = fixture('G{P}m | R-');
    assert.equal(f.line.matras.length, 2);
    assert.deepEqual(f.line.matras[0].events.map(e => [e.ch, value(e.dur), !!e.grace]), [['G', .5, false], ['P', 0, true], ['m', .5, false]]);
    assert.deepEqual(f.line.spans[0], { type: 'kan', from: { matraIndex: 0, eventIndex: 1 }, to: { matraIndex: 0, eventIndex: 2 } });
    globalThis.document = new JSDOM('<body></body>').window.document;
    const score = renderDocument(f.doc);
    const cell = score.querySelector('.sr-cell[data-matra="0"]');
    assert.equal(cell.querySelectorAll('.sr-grace').length, 1);
    assert.ok(cell.querySelector('.sr-arc-kan'));
    assert.match(cell.querySelectorAll('[data-anchor-kind="attack"]')[1].textContent, /Pm/);
  } },
  { name: 'inline grace: playback charges each destination and never an earlier note', fn() {
    const f = fixture('G{PD}m{R}S N');
    near(f.notes[0].dur, 1 / 3);
    near(f.notes[1].t, 1 / 3);
    near(f.notes[3].t + f.notes[3].dur, 2 / 3);
    near(f.notes[4].t, 2 / 3);
    near(f.notes[5].t + f.notes[5].dur, 1);
    near(f.notes[6].t, 1);
    const dense = fixture('G{PDN}mRSrgMPDN');
    assert.ok(dense.notes.every(e => e.dur > 0 && e.t >= 0));
    near(dense.notes.at(-1).t + dense.notes.at(-1).dur, 1);
  } },
  { name: 'scoped slide: curve covers P and m without covering G', fn() {
    globalThis.document = new JSDOM('<body></body>').window.document;
    const score = renderDocument(fixture('G~(Pm) R-').doc);
    const arc = score.querySelector('.sr-scoped-meend');
    assert.equal(arc.style.gridColumn, '2 / 4');
    assert.equal(score.querySelectorAll('.sr-row > .sr-arc-meend').length, 0);
  } },
  { name: 'inline approach: P glides into m without adding a separate attack', fn() {
    const f = fixture('G{P~}m R-');
    assert.deepEqual(f.notes.map(e => e.ch), ['G', 'm', 'R']);
    near(f.notes[1].t, .5);
    near(f.notes[1].dur, .5);
    near(f.notes[1].glideFrom, degreeFreq(parseSa('C'), 7, 0));
    globalThis.document = new JSDOM('<body></body>').window.document;
    const score = renderDocument(f.doc);
    assert.equal(score.querySelectorAll('.sr-local-approach-arc').length, 1);
  } },
  { name: 'slide hold: adjacent dash stays in the destination beat; spaced dash stays separate', fn() {
    for (const [outside, inside] of [['~(Gm | R)-', '~(Gm | R-)'], ['~(G | RS)--', '~(G | RS--)'], ['DD~(DP)-', 'DD~(DP-)']]) {
      assert.deepEqual(model(fixture(outside).line), model(fixture(inside).line));
      const scan = scanMusicLine(outside);
      assert.equal(scan.error, null);
      assert.equal(scan.duration.n / scan.duration.d, fixture(inside).line.matras.length);
      assert.deepEqual(scan.attacks.map(a => outside[a.index]), scan.attacks.map(a => a.ch));
    }
    assert.equal(fixture('~(Gm | R) -').line.matras.length, 3);
    assert.equal(fixture('(Gm R)x3 -').line.phraseRepeats[0].times, 3);
    assert.ok(parseDocument('tal: free\n(Gm | R)-').problems.some(p => /xN/.test(p.msg)));
  } },
  { name: 'inline ornaments: canonical save preserves destinations, fractions, scopes and bols', fn() {
    for (const music of ['G{P}m | R-', 'G{P~}m R-', 'G{P}m{D}S', '[GR {P}m]', '[~G{P}m]', '[G{P}m~ R]', '[G {P D}m]', '[-- {P}m]', '~(G{P}m | R)-', '~(G{P~}m | R)-', 'G{P}m\n> da ra', '{R} G{P}m']) {
      const f = fixture(music);
      const serialized = serializeDocument(f.doc);
      const again = parseDocument(serialized);
      assert.deepEqual(again.problems, [], music);
      assert.deepEqual(model(again.doc.sections[0].lines[0]), model(f.line), music);
      assert.equal(serializeDocument(again.doc), serialized, music);
    }
  } },
  { name: 'Jhampak inline ornament: half beat and sam survive parsing, scheduling and clicking', fn() {
    for (const ornament of ['G{P}m | R-', '~(G{P~}m | R)-']) {
      const f = fixture(`@3 ||: G - ${ornament} S | .N.D .N | S - :||`, 'jhampak');
      assert.equal(f.line.matras.length, 9);
      assert.equal(value(f.line.matras[6].duration), .5);
      const sam = positionFromSource(f.text, f.doc, f.text.lastIndexOf('S -'));
      assert.equal(sam.matraIndex, 7);
      assert.equal(sam.metricTime, 6.5);
      assert.ok(f.notes.some(e => e.ch === 'S' && e.t === 6.5));
      const grace = positionFromSource(f.text, f.doc, f.text.indexOf('{P') + 1);
      assert.equal(grace.metricTime, 2.5);
    }
  } },
  { name: 'inline grace: partial-cluster Kan control writes the same valid shorthand', fn() {
    const f = fixture('GPm R\n> da ra diri chikari');
    const start = f.text.indexOf('Pm');
    const result = prepareOrnamentEdit(f.text, { start, end: start + 2 }, 'kan');
    assert.equal(result.ok, true, result.message);
    assert.match(result.text, /G\{P\}m R/);
    const next = parseDocument(result.text).doc.sections[0].lines[0];
    assert.deepEqual(next._bolPasses[0].assignments, ['da', 'diri', 'chikari']);
  } },
];
