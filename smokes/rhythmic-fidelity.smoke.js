// Rhythmic fidelity + terminal Gat return cues (M, 2026-07-18).
// Explicit internal dashes are visible metric slots without extra attacks;
// terminal `gat` is a zero-time instruction that replays the preceding Gat.

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { serializeDocument } from '../src/engine/serialize.js';
import { renderDocument, renderExport } from '../src/engine/render.js';
import { scheduleDocument } from '../src/engine/schedule.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;

const firstLine = (token) => parseDocument(`tal: rupak\n\n${token}\n`).doc.sections[0].lines[0];
const noteEvents = (schedule) => schedule.events.filter((e) => e.kind === 'note');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

const CUE_DOC = `tal: rupak
tempo: 60

Gat
S R

6.
g m gat

7.
P
`;

export const smokes = [
  {
    name: 'micro holds: DnS- preserves the final written sustain slot',
    fn() {
      const line = firstLine('DnS-');
      assert.equal(line.matras.length, 1);
      assert.deepEqual(line.matras[0].events.map((e) => e.dur), [
        { num: 1, den: 4 },
        { num: 1, den: 4 },
        { num: 1, den: 2 },
      ]);
      assert.equal(line.matras[0].events[2].writtenSlots, 2);
    },
  },
  {
    name: 'micro holds: g--- remains four written slots after round-trip',
    fn() {
      const parsed = parseDocument('tal: rupak\n\ng---\n');
      assert.equal(parsed.problems.length, 0);
      assert.equal(parsed.doc.sections[0].lines[0].matras[0].events[0].writtenSlots, 4);
      const canonical = serializeDocument(parsed.doc);
      assert.match(canonical, /g---/);
      const reparsed = parseDocument(canonical);
      assert.equal(reparsed.doc.sections[0].lines[0].matras[0].events[0].writtenSlots, 4);
    },
  },
  {
    name: 'micro holds: bracket hierarchy does not invent a printed dash',
    fn() {
      const parsed = parseDocument('tal: rupak\n\n[SR g]\n');
      const canonical = serializeDocument(parsed.doc);
      assert.match(canonical, /\[SR g\]/);
      assert.doesNotMatch(canonical, /SRg-/);
    },
  },
  {
    name: 'micro holds render as equal visible slots under one rhythmic arc',
    fn() {
      const { doc } = parseDocument('tal: rupak\n\nDnS- g---\n');
      const root = renderDocument(doc);
      const cells = [...root.querySelectorAll('.sr-cell')];
      assert.equal(cells[0].querySelector('.sr-timed-slots').dataset.writtenSlots, '4');
      assert.deepEqual(
        [...cells[0].querySelectorAll('.sr-slot')].map((slot) => slot.dataset.slotKind),
        ['attack', 'attack', 'attack', 'hold']
      );
      assert.equal(cells[0].querySelectorAll('.sr-micro-hold').length, 1);
      assert.ok(cells[0].querySelector('.sr-underarc'));
      assert.equal(cells[1].querySelector('.sr-timed-slots').dataset.writtenSlots, '4');
      assert.deepEqual(
        [...cells[1].querySelectorAll('.sr-slot')].map((slot) => slot.dataset.slotKind),
        ['attack', 'hold', 'hold', 'hold']
      );
      assert.equal(cells[1].querySelectorAll('.sr-micro-hold').length, 3);
      assert.ok(cells[1].querySelector('.sr-underarc'));
      assert.equal(cells[1].textContent.includes('g———'), true);
      assert.equal(
        cells[1].querySelector('.sr-timed-slots').style.gridTemplateColumns,
        'repeat(4, minmax(0.84em, max-content))'
      );
    },
  },
  {
    name: 'adjacent whole-matra sustains remain separate rendered hold cells',
    fn() {
      const { doc } = parseDocument('tal: rupak\n\n-- .nS\n');
      const root = renderDocument(doc);
      const cells = [...root.querySelectorAll('.sr-cell')];
      assert.equal(cells.length, 3);
      assert.equal(cells[0].querySelectorAll('.sr-sustain:not(.sr-micro-hold)').length, 1);
      assert.equal(cells[1].querySelectorAll('.sr-sustain:not(.sr-micro-hold)').length, 1);
      assert.equal(cells[0].querySelector('.sr-glyphs').textContent, '—');
      assert.equal(cells[1].querySelector('.sr-glyphs').textContent, '—');
      assert.notEqual(cells[0], cells[1], 'each written dash owns a distinct matra cell');
    },
  },
  {
    name: 'micro holds change notation only — MIDI timing and attacks stay exact',
    fn() {
      const schedule = scheduleDocument(parseDocument('tal: rupak\ntempo: 60\n\nDnS- g---\n').doc);
      const notes = noteEvents(schedule);
      assert.equal(notes.length, 4, 'three attacks in DnS-, one in g---');
      close(notes[0].t, 0);
      close(notes[0].dur, 0.25);
      close(notes[1].t, 0.25);
      close(notes[2].t, 0.5);
      close(notes[2].dur, 0.5);
      close(notes[3].t, 1);
      close(notes[3].dur, 1);
      close(schedule.duration, 2);
    },
  },
  {
    name: 'terminal gat parses as a bound zero-time return cue and serializes',
    fn() {
      const parsed = parseDocument(CUE_DOC);
      assert.deepEqual(parsed.problems, []);
      const cue = parsed.doc.sections[1].lines[0].returnCue;
      assert.deepEqual(cue, { target: 'gat', mode: 'align', targetSectionIndex: 0 });
      assert.match(serializeDocument(parsed.doc), /g m gat/);
    },
  },
  {
    name: 'terminal gat renders cleanly in preview and export, not as passthrough',
    fn() {
      const { doc } = parseDocument(CUE_DOC);
      for (const root of [renderDocument(doc), renderExport(doc)]) {
        const cue = root.querySelector('[data-return-cue="gat"]');
        assert.ok(cue);
        assert.equal(cue.textContent, 'gat');
        assert.equal(root.querySelectorAll('.sr-passthrough').length, 0);
      }
    },
  },
  {
    name: 'terminal gat replays the preceding Gat once, then resumes',
    fn() {
      const schedule = scheduleDocument(parseDocument(CUE_DOC).doc);
      assert.equal(noteEvents(schedule).map((e) => e.ch).join(''), 'SRgmSRP');
      close(schedule.duration, 7);
      assert.equal(schedule.lineStarts.length, 3, 'replayed Gat is not a duplicate written line start');
      close(schedule.lineStarts[0].t, 0);
      close(schedule.lineStarts[1].t, 2);
      close(schedule.lineStarts[2].t, 6);
    },
  },

  {
    name: 'gat return forms parse and serialize distinctly',
    fn() {
      const src = `tal: rupak

Gat
@4 S .n .D .n S R g

A
S R g m P d n gat@1
S R g m P d n gat@4
S R g m P d n gat!
`;
      const parsed = parseDocument(src);
      assert.deepEqual(parsed.problems, []);
      const lines = parsed.doc.sections[1].lines;
      assert.deepEqual(lines[0].returnCue, { target: 'gat', mode: 'matra', matra: 1, targetSectionIndex: 0 });
      assert.deepEqual(lines[1].returnCue, { target: 'gat', mode: 'matra', matra: 4, targetSectionIndex: 0 });
      assert.deepEqual(lines[2].returnCue, { target: 'gat', mode: 'full', targetSectionIndex: 0 });
      const canonical = serializeDocument(parsed.doc);
      assert.match(canonical, /gat@1/);
      assert.match(canonical, /gat@4/);
      assert.match(canonical, /gat!/);
    },
  },
  {
    name: 'plain gat aligns to the source landing; explicit/full forms override it',
    fn() {
      const make = (cue) => `tal: rupak
tempo: 60

Gat
@4 S .n .D .n S R g

Variation
S R g m P d n ${cue}

Next
P
`;
      const firstReplayCursor = (cue) => {
        const schedule = scheduleDocument(parseDocument(make(cue)).doc);
        const cursors = schedule.events.filter((e) => e.kind === 'cursor');
        let lastVariation = -1;
        for (let i = 0; i < cursors.length; i++) if (cursors[i].sourceLine === 8) lastVariation = i;
        return cursors[lastVariation + 1];
      };
      assert.equal(firstReplayCursor('gat').matraIndex, 4, 'seven-matra line lands on sam, so skip @4 mukra');
      assert.equal(firstReplayCursor('gat@1').matraIndex, 4, 'explicit sam selects the same Gat entry');
      assert.equal(firstReplayCursor('gat@4').matraIndex, 0, 'explicit matra 4 includes the mukra');
      assert.equal(firstReplayCursor('gat!').matraIndex, 0, 'full Gat starts exactly as written');
    },
  },
  {
    name: 'gat@N outside the active tal cycle is a precise diagnostic',
    fn() {
      const parsed = parseDocument('tal: rupak\n\nGat\nS R\n\nA\nS R gat@8\n');
      assert.equal(parsed.problems.length, 1);
      assert.match(parsed.problems[0].msg, /outside rupak.*1–7/);
      assert.equal(parsed.problems[0].col, 5);
    },
  },
  {
    name: 'gat in the middle remains a precise clickable diagnostic',
    fn() {
      const parsed = parseDocument('tal: rupak\n\nS gat R\n');
      assert.equal(parsed.problems.length, 1);
      assert.equal(parsed.problems[0].col, 3);
      assert.match(parsed.problems[0].msg, /must be the final token/);
      assert.equal(parsed.doc.sections[0].lines[0].passthrough[0].text, 'gat');
    },
  },
  {
    name: 'terminal gat with no preceding Gat section narrates instead of guessing',
    fn() {
      const parsed = parseDocument('tal: rupak\n\nVariation\nS R gat\n');
      assert.equal(parsed.problems.length, 1);
      assert.match(parsed.problems[0].msg, /no preceding gat section/);
      const schedule = scheduleDocument(parsed.doc);
      assert.equal(noteEvents(schedule).map((e) => e.ch).join(''), 'SR');
    },
  },
];
