// schedule.js — M3 "hear your music", Wave A (spec §6).
// Flattens the parsed model into ONE timed event list: melody notes with
// exact onsets/durations (seconds derived from exact matra fractions),
// ticks with accents from tala.js, cursor events for the highlight, and a
// line-start map for play-from-cursor. Repeats unroll; sustains merge into
// their notes; kan graces steal a sliver off their destination's front;
// meend destinations carry glideFrom so the shell can shape a real glide.
//
// Engine rules: plain JS, no React, no DOM, no WebAudio — sound is the
// shell's job (the lookahead scheduler drives from this list against the
// AudioContext clock). Correctness lives here, in node, under smokes.

import { getTal, wrapMatra, vibhagOfMatra, markerAtMatra } from './tala.js';

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------

// The chromatic table over Sa (confirmed by M, 2026-07-16):
// capitals shuddha, lowercase komal, capital M tivra (spec §3.3).
export const SEMITONES = Object.freeze({
  S: 0, r: 1, R: 2, g: 3, G: 4, m: 5, M: 6, P: 7, d: 8, D: 9, n: 10, N: 11,
});

const LETTER_SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEFAULT_SA = 'C#'; // spec §3.1 default

/**
 * Parse a `sa:` value: a letter with optional accidental and octave —
 * `C`, `C#`, `Bb`, `A3`, `C#4`. A bare letter sits at octave 3, which
 * lands the common anchors where the instruments live (M, 2026-07-16):
 * sarod `C` → C3 ≈ 131 Hz, sitar `D` → D3, vocal `A` → A3 = 220 Hz.
 * Unparseable input falls back to the default C# and says so.
 *
 * @returns {{freq: number, midi: number, problem?: string}}
 */
export function parseSa(value) {
  const m = /^\s*([A-Ga-g])([#b]?)(\d)?\s*$/.exec(String(value ?? DEFAULT_SA));
  if (!m) {
    const fallback = parseSa(DEFAULT_SA);
    return { ...fallback, problem: `sa: '${value}' is not a pitch — using ${DEFAULT_SA}` };
  }
  const semi =
    LETTER_SEMIS[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const octave = m[3] !== undefined ? Number(m[3]) : 3;
  const midi = 12 * (octave + 1) + semi;
  return { freq: 440 * 2 ** ((midi - 69) / 12), midi };
}

/** Frequency of a sargam degree relative to Sa (equal temperament, v1). */
export function degreeFreq(sa, semitone, octaveOffset) {
  return sa.freq * 2 ** ((semitone + 12 * octaveOffset) / 12);
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

// Each kan grace nominally takes 1/12 of a matra, stolen from the front of
// the destination's time; a long run is capped at half the destination beat
// so the destination always keeps its identity. Feel is ear-pass work.
const GRACE_FRACTION = 1 / 12;
const GRACE_CAP = 1 / 2;

/**
 * @param {Document} doc  parsed model (parse.js)
 * @param {{tempo?: number}} [opts]  tempo overrides the tempo: directive
 * @returns {{events: object[], duration: number, lineStarts: object[]}}
 *   events (sorted by t):
 *     {kind:'note',  t, dur, ch, semitone, octave, freq, grace?, glideFrom?}
 *     {kind:'tick',  t, accent: 'sam'|'khali'|'vibhag'|'plain', cycleMatra}
 *     {kind:'cursor',t, sectionIndex, lineIndex, matraIndex, sourceLine}
 *   lineStarts: [{sectionIndex, lineIndex, sourceLine, t}]
 */
export function scheduleDocument(doc, opts = {}) {
  const tempo = Number(opts.tempo ?? doc?.directives?.tempo) || 60;
  const spm = 60 / tempo; // seconds per matra
  const sa = parseSa(doc?.directives?.sa ?? DEFAULT_SA);

  const events = [];
  const lineStarts = [];
  let t = 0;

  (doc?.sections || []).forEach((section, sectionIndex) => {
    const isFree = section.tal === 'free';
    const tal = isFree ? null : getTal(section.tal);

    (section.lines || []).forEach((line, lineIndex) => {
      if (!line.matras || line.matras.length === 0) return;
      lineStarts.push({ sectionIndex, lineIndex, sourceLine: line.sourceLine, t });

      // Unroll phrase repeats into the played order of matra indices.
      const order = [];
      for (let i = 0; i < line.matras.length; ) {
        const pr = (line.phraseRepeats || []).find((r) => r.fromMatra === i);
        if (pr) {
          for (let rep = 0; rep < pr.times; rep++) {
            for (let k = pr.fromMatra; k <= pr.toMatra; k++) order.push(k);
          }
          i = pr.toMatra + 1;
        } else {
          order.push(i);
          i++;
        }
      }
      const passes = line.lineRepeat ? 2 : 1;

      for (let pass = 0; pass < passes; pass++) {
        // (matraIndex:eventIndex) → scheduled note, for span resolution.
        const placed = new Map();
        let ringing = null; // last note event, for whole-matra sustains

        order.forEach((matraIndex, playedOrdinal) => {
          const matraStart = t;
          events.push({
            kind: 'cursor',
            t: matraStart,
            sectionIndex,
            lineIndex,
            matraIndex,
            sourceLine: line.sourceLine,
          });

          if (tal) {
            const cycleMatra = wrapMatra(
              tal,
              (line.startMatra || 1) + playedOrdinal + pass * order.length
            );
            let accent = 'plain';
            if (markerAtMatra(tal, cycleMatra) !== null) {
              const v = vibhagOfMatra(tal, cycleMatra);
              accent =
                v === tal.samVibhag
                  ? 'sam'
                  : (tal.khaliVibhags || []).includes(v)
                    ? 'khali'
                    : 'vibhag';
            }
            events.push({ kind: 'tick', t: matraStart, accent, cycleMatra });
          }

          const evs = line.matras[matraIndex].events;

          // Whole-matra sustain: extend whatever is ringing.
          if (evs.length === 1 && evs[0].type === 'sustain') {
            if (ringing) ringing.dur += spm * (evs[0].dur.num / evs[0].dur.den);
            t = matraStart + spm;
            return;
          }

          // Kan slivers. Same-beat graces ({dP}m) steal from the FRONT of
          // the destination; pre-beat graces ({dP} m) sound BEFORE the beat,
          // trimming whatever rings — the destination keeps its whole beat.
          // Either way, the grid never moves.
          const preGraces = evs.filter((e) => e.grace && e.preBeat);
          const sameGraces = evs.filter((e) => e.grace && !e.preBeat);
          const sliverOf = (n) => (n > 0 ? Math.min(GRACE_FRACTION, GRACE_CAP / n) * spm : 0);
          const preSliver = sliverOf(preGraces.length);
          const sliver = sliverOf(sameGraces.length);

          if (preGraces.length > 0) {
            const total = preGraces.length * preSliver;
            let start = Math.max(0, matraStart - total);
            if (ringing && ringing.t + ringing.dur > start) {
              ringing.dur = Math.max(0, start - ringing.t);
            }
            const actualSliver = (matraStart - start) / preGraces.length || 0;
            preGraces.forEach((e, gi) => {
              const eventIndex = evs.indexOf(e);
              const ev = {
                kind: 'note',
                t: start + gi * actualSliver,
                dur: actualSliver,
                ch: e.ch,
                semitone: SEMITONES[e.ch],
                octave: e.octave || 0,
                freq: degreeFreq(sa, SEMITONES[e.ch], e.octave || 0),
                grace: true,
                preBeat: true,
              };
              events.push(ev);
              placed.set(`${matraIndex}:${eventIndex}`, ev);
            });
          }

          let cursor = matraStart;
          let graceTotal = sameGraces.length * sliver;
          evs.forEach((e, eventIndex) => {
            if (e.grace && e.preBeat) return; // already placed above
            const frac = e.dur.num / e.dur.den;
            if (e.type === 'note' && e.grace) {
              const ev = {
                kind: 'note',
                t: cursor,
                dur: sliver,
                ch: e.ch,
                semitone: SEMITONES[e.ch],
                octave: e.octave || 0,
                freq: degreeFreq(sa, SEMITONES[e.ch], e.octave || 0),
                grace: true,
              };
              events.push(ev);
              placed.set(`${matraIndex}:${eventIndex}`, ev);
              cursor += sliver;
              return;
            }
            let dur = spm * frac;
            if (graceTotal > 0 && e.type === 'note') {
              dur -= graceTotal; // the destination pays for its graces
              graceTotal = 0;
            }
            if (e.type === 'note') {
              const ev = {
                kind: 'note',
                t: cursor,
                dur,
                ch: e.ch,
                semitone: SEMITONES[e.ch],
                octave: e.octave || 0,
                freq: degreeFreq(sa, SEMITONES[e.ch], e.octave || 0),
              };
              events.push(ev);
              placed.set(`${matraIndex}:${eventIndex}`, ev);
              ringing = ev;
              cursor += dur;
            } else if (e.type === 'rest') {
              ringing = null;
              cursor += dur;
            } else {
              // partial sustain inside a subdivided matra: parser already
              // merged in-matra dashes into their notes; a standalone one
              // extends whatever rings.
              if (ringing) ringing.dur += dur;
              cursor += dur;
            }
          });
          t = matraStart + spm;
        });

        // Resolve meend spans for this pass: the destination glides from
        // the source's pitch. Kan spans need nothing — graces already sound.
        for (const span of line.spans || []) {
          if (span.type !== 'meend') continue;
          const from = placed.get(`${span.from.matraIndex}:${span.from.eventIndex}`);
          const to = placed.get(`${span.to.matraIndex}:${span.to.eventIndex}`);
          if (from && to && !to.glideFrom) to.glideFrom = from.freq;
        }
      }
    });
  });

  events.sort((a, b) => a.t - b.t);
  return { events, duration: t, lineStarts };
}
