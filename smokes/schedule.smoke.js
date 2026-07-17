// schedule.smoke.js — M3 Wave A: the pure scheduling engine (spec §6).
// scheduleDocument flattens the model into ONE timed event list: melody
// notes (exact seconds from exact matra fractions), ticks (accents from
// tala.js), cursor events, and a line-start map for play-from-cursor.
// No audio here — sound is the shell's job; correctness lives in node.
import assert from 'node:assert/strict';
import { scheduleDocument, parseSa, degreeFreq, timeFor } from '../src/engine/schedule.js';
import { parseDocument } from '../src/engine/parse.js';

const close = (a, b, msg) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} !== ${b}${msg ? ` — ${msg}` : ''}`);

const sched = (src, opts) => scheduleDocument(parseDocument(src).doc, opts);
const notes = (s) => s.events.filter((e) => e.kind === 'note');
const ticks = (s) => s.events.filter((e) => e.kind === 'tick');
const cursors = (s) => s.events.filter((e) => e.kind === 'cursor');

export const smokes = [
  // ---------- sa / pitch ----------
  {
    name: 'pitch: parseSa — bare letters (sarod C, sitar D, vocal A) at octave 3',
    fn() {
      close(parseSa('C').freq, 130.8127826502993);
      close(parseSa('D').freq, 146.8323839587038);
      close(parseSa('A').freq, 220);
    },
  },
  {
    name: 'pitch: parseSa — explicit octaves and accidentals (A3=220, C#3, Bb2)',
    fn() {
      close(parseSa('A3').freq, 220);
      close(parseSa('A4').freq, 440);
      close(parseSa('C#3').freq, 138.59131548843604);
      close(parseSa('Bb2').freq, 116.54094037952248);
    },
  },
  {
    name: "pitch: the default sa is C — the sarod's key (M's ruling, 2026-07-16)",
    fn() {
      // SUPERSEDED: the default was C# (spec's original), kept "pending M's
      // ruling". M ruled by expectation on the live site: "I have the key
      // as C". Sarod C is the app's home key.
      close(parseSa(undefined).freq, parseSa('C').freq);
      close(parseSa(undefined).freq, 130.8127826502993);
    },
  },
  {
    name: 'pitch: unparseable sa narrates via fallback to the default (C)',
    fn() {
      const bad = parseSa('purple');
      close(bad.freq, parseSa('C').freq);
      assert.equal(bad.problem !== undefined, true);
    },
  },
  {
    name: 'pitch: degreeFreq — the confirmed chromatic table over sa',
    fn() {
      const sa = parseSa('A3'); // 220
      close(degreeFreq(sa, 0, 0), 220); // S
      close(degreeFreq(sa, 7, 0), 220 * 2 ** (7 / 12)); // P
      close(degreeFreq(sa, 0, 1), 440); // taar S
      close(degreeFreq(sa, 0, -1), 110); // mandra S
      close(degreeFreq(sa, 10, 0), 220 * 2 ** (10 / 12)); // komal n
    },
  },

  // ---------- timing ----------
  {
    name: 'timing: tempo 60 → one matra = one second; whole notes land on the grid',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\nS R g m\n');
      const ns = notes(s);
      assert.equal(ns.length, 4);
      close(ns[0].t, 0);
      close(ns[1].t, 1);
      close(ns[3].t, 3);
      close(ns[0].dur, 1);
      close(s.duration, 4);
    },
  },
  {
    name: 'timing: tempo 120 halves everything',
    fn() {
      const s = sched('tal: tintal\ntempo: 120\n\nS R g m\n');
      close(notes(s)[1].t, 0.5);
      close(s.duration, 2);
    },
  },
  {
    name: 'timing: a cluster splits its matra exactly (SRg = thirds)',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\nSRg m R g\n');
      const ns = notes(s);
      close(ns[0].t, 0);
      close(ns[1].t, 1 / 3);
      close(ns[2].t, 2 / 3);
      close(ns[0].dur, 1 / 3);
      close(ns[3].t, 1); // m starts the next matra on the grid
    },
  },
  {
    name: 'timing: whole-matra sustains extend the previous note across matras',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\nS - - m\n');
      const ns = notes(s);
      assert.equal(ns.length, 2);
      close(ns[0].dur, 3, 'S rings through both sustains');
      close(ns[1].t, 3);
    },
  },
  {
    name: 'timing: a rest is silence — time advances, no note event',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\nS . g m\n');
      const ns = notes(s);
      assert.equal(ns.length, 3);
      close(ns[0].dur, 1, 'rest does not extend S');
      close(ns[1].t, 2, 'g lands after the silent beat');
    },
  },

  // ---------- repeats ----------
  {
    name: 'repeats: ||: :|| plays the line through twice',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\n||: S R g m :||\n');
      assert.equal(notes(s).length, 8);
      close(s.duration, 8);
      close(notes(s)[4].t, 4, 'second pass starts where the first ended');
    },
  },
  {
    name: 'repeats: (SR gm P)x3 unrolls to nine matras of music',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\n(SR gm P)x3\n');
      assert.equal(notes(s).length, 15, '5 notes × 3');
      close(s.duration, 9);
      close(notes(s)[5].t, 3, 'second repetition starts at matra 4');
    },
  },

  // ---------- ticks ----------
  {
    name: 'ticks: one per matra, sam accented, khali hollow (tintal from sam)',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\nS R g m P d n N S R g m P d n N\n');
      const ts = ticks(s);
      assert.equal(ts.length, 16);
      assert.equal(ts[0].accent, 'sam');
      assert.equal(ts[8].accent, 'khali', 'tintal khali at cycle matra 9');
      assert.equal(ts[4].accent, 'vibhag', 'vibhag 2 start');
      assert.equal(ts[1].accent, 'plain');
      close(ts[8].t, 8);
    },
  },
  {
    name: 'ticks: @7 start offset places the cycle correctly',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\n@7 S R S R\n');
      const ts = ticks(s);
      // matras 7,8,9,10 of the cycle: plain, plain, khali, plain
      assert.equal(ts[2].accent, 'khali');
    },
  },
  {
    name: 'ticks: rupak — sam is khali-marked, accent follows the tal data',
    fn() {
      const s = sched('tal: rupak\ntempo: 60\n\nS R g m P d n\n');
      assert.equal(ticks(s)[0].accent, 'sam');
    },
  },
  {
    name: 'ticks: free sections have none; melody still schedules',
    fn() {
      const s = sched('tal: free\ntempo: 60\n\nS R g m\n');
      assert.equal(ticks(s).length, 0);
      assert.equal(notes(s).length, 4);
    },
  },

  // ---------- kan + meend ----------
  {
    name: 'kan: graces steal a sliver off the destination front, total time exact',
    fn() {
      const s = sched("tal: tintal\ntempo: 60\n\n{'S}n R g m\n");
      const ns = notes(s);
      assert.equal(ns.length, 5);
      const [grace, dest] = ns;
      assert.equal(grace.grace, true);
      close(grace.t, 0, 'grace starts on the beat');
      assert.ok(grace.dur > 0 && grace.dur <= 1 / 8, 'a sliver, not a beat');
      close(dest.t, grace.dur, 'destination enters after the grace');
      close(grace.dur + dest.dur, 1, 'together they fill the matra exactly');
      close(ns[2].t, 1, 'next matra unmoved — graces never shift the grid');
    },
  },
  {
    name: 'kan: a long grace run is capped at half the destination beat',
    fn() {
      const s = sched("tal: free\ntempo: 60\n\n{P'SN'R'SN'S}N\n");
      const ns = notes(s);
      const graces = ns.filter((e) => e.grace);
      assert.equal(graces.length, 7);
      const graceTotal = graces.reduce((a, g) => a + g.dur, 0);
      assert.ok(graceTotal <= 0.5 + 1e-9, 'grace run ≤ half the beat');
      const dest = ns[ns.length - 1];
      close(graceTotal + dest.dur, 1);
    },
  },
  {
    name: 'kan: grace pitches use the full pitch machinery (octaves count)',
    fn() {
      const s = sched("sa: A3\ntal: free\n\n{'S}n\n");
      const [grace, dest] = notes(s);
      close(grace.freq, 440, 'taar S over A3');
      close(dest.freq, 220 * 2 ** (10 / 12), 'komal n');
    },
  },
  {
    name: 'meend: the destination of a slide carries glideFrom at the source pitch',
    fn() {
      const s = sched('sa: A3\ntal: tintal\ntempo: 60\n\nm~ g R g\n');
      const ns = notes(s);
      const g = ns[1];
      assert.ok(g.glideFrom, 'glide marked');
      close(g.glideFrom, ns[0].freq, 'glides from m');
    },
  },

  // ---------- cursor + line starts ----------
  {
    name: 'cursor: one event per played matra, carrying the source line',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\nS R g m\n');
      const cs = cursors(s);
      assert.equal(cs.length, 4);
      assert.equal(cs[0].matraIndex, 0);
      assert.equal(cs[3].matraIndex, 3);
      assert.equal(cs[0].sourceLine, 4);
      close(cs[2].t, 2);
    },
  },
  {
    name: 'cursor: repeats revisit the same matras at later times',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\n||: S R :||\n');
      const cs = cursors(s);
      assert.equal(cs.length, 4);
      assert.equal(cs[2].matraIndex, 0, 'second pass points back at matra 0');
      close(cs[2].t, 2);
    },
  },
  {
    name: 'lineStarts: every line maps its source line to its start time',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\nS R g m\nP d n N\n\nAlap\nS R\n');
      assert.equal(s.lineStarts.length, 3);
      assert.equal(s.lineStarts[0].sourceLine, 4);
      close(s.lineStarts[0].t, 0);
      assert.equal(s.lineStarts[1].sourceLine, 5);
      close(s.lineStarts[1].t, 4);
      close(s.lineStarts[2].t, 8);
    },
  },
  {
    name: 'events: the merged list is sorted by time',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\n||: SRg m | P - :||\n(SR)x2\n');
      for (let i = 1; i < s.events.length; i++) {
        assert.ok(s.events[i].t >= s.events[i - 1].t - 1e-9, `event ${i} out of order`);
      }
    },
  },
  {
    name: 'schedule: empty document → empty schedule, zero duration, no throw',
    fn() {
      const s = sched('');
      assert.deepEqual(s.events, []);
      close(s.duration, 0);
    },
  },
{
    name: 'kan xbeat: {dP} m — graces sound BEFORE the beat, trimming the ringing note',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\nS {dP} m R\n');
      const ns = notes(s);
      // S, d(grace), P(grace), m, R
      assert.equal(ns.length, 5);
      const [S, d, P, m] = ns;
      const sliver = 1 / 12;
      close(S.dur, 1 - 2 * sliver, 'S is trimmed to make room');
      close(d.t, 1 - 2 * sliver, 'graces start before the beat');
      close(P.t, 1 - sliver);
      assert.equal(d.preBeat, true);
      close(m.t, 1, 'destination lands ON its beat');
      close(m.dur, 1, 'destination keeps its whole beat — nothing stolen');
    },
  },
  {
    name: 'kan xbeat: pre-beat graces at line start clamp at zero, no negative time',
    fn() {
      const s = sched('tal: free\ntempo: 60\n\n{dP} m\n');
      const ns = notes(s);
      assert.ok(ns[0].t >= 0);
      for (const e of ns) assert.ok(e.t >= 0);
    },
  },
{
    name: 'timeFor: maps (sourceLine, matraIndex) to the matra onset time',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\nS R g m\nP d n N\n');
      close(timeFor(s, 4, 2), 2, 'line 4 matra 2');
      close(timeFor(s, 5, 0), 4, 'second line starts at 4s');
      close(timeFor(s, 5, 3), 7);
    },
  },
  {
    name: 'timeFor: unknown targets fall back to the line start, then 0',
    fn() {
      const s = sched('tal: tintal\ntempo: 60\n\nS R g m\n');
      close(timeFor(s, 4, 99), 0, 'bad matra → line start');
      close(timeFor(s, 42, 0), 0, 'unknown line → 0');
    },
  },
];
