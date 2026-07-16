// src/engine/tala.js — Sargam engine: tal definitions + cycle arithmetic.
// Plain JS, no React, no DOM. Tals are DATA, not code (spec §2).
//
// ── DRAFT STATUS ──────────────────────────────────────────────────────────
// All tal definitions below are DRAFTS pending M's verification of clap
// patterns and marker conventions (build plan, Wave 1 checkpoint). Do not
// treat as correct until signed off. The chachar/ada chautal entry is the
// least certain — the names may denote different structures. Corrections
// are data edits only; no arithmetic below depends on any specific tal.
// ──────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Tal
 * @property {string} name
 * @property {number} matras
 * @property {number[]} vibhags      — segment lengths; sums to matras
 * @property {string[]} markers      — one per vibhag ('+','2','0','3',…)
 * @property {number} samVibhag      — 0-based vibhag index of sam
 * @property {number[]} khaliVibhags — 0-based vibhag indices of khali
 * @property {string[]} [aliases]
 */

function tal(def) {
  return Object.freeze({ aliases: [], ...def });
}

/** Tals keyed by canonical name. Aliases resolve via getTal(). */
export const TALS = Object.freeze({
  tintal: tal({
    name: 'tintal',
    matras: 16,
    vibhags: [4, 4, 4, 4],
    markers: ['+', '2', '0', '3'],
    samVibhag: 0,
    khaliVibhags: [2],
  }),
  jhaptal: tal({
    name: 'jhaptal',
    matras: 10,
    vibhags: [2, 3, 2, 3],
    markers: ['+', '2', '0', '3'],
    samVibhag: 0,
    khaliVibhags: [2],
  }),
  rupak: tal({
    // Rupak's sam is khali-marked — the reason markers are per-tal data.
    name: 'rupak',
    matras: 7,
    vibhags: [3, 2, 2],
    markers: ['0', '1', '2'],
    samVibhag: 0,
    khaliVibhags: [0],
  }),
  ektal: tal({
    name: 'ektal',
    matras: 12,
    vibhags: [2, 2, 2, 2, 2, 2],
    markers: ['+', '0', '2', '0', '3', '4'],
    samVibhag: 0,
    khaliVibhags: [1, 3],
  }),
  chachar: tal({
    // LEAST CERTAIN — chachar vs ada chautal may differ; ask M.
    name: 'chachar',
    matras: 14,
    vibhags: [3, 4, 3, 4],
    markers: ['+', '2', '0', '3'],
    samVibhag: 0,
    khaliVibhags: [2],
    aliases: ['adachautal'],
  }),
});

const byAnyName = new Map();
for (const t of Object.values(TALS)) {
  byAnyName.set(t.name, t);
  for (const a of t.aliases) byAnyName.set(a, t);
}

/** Look up a tal by name or alias (case/space/hyphen-insensitive). Null if unknown. */
export function getTal(name) {
  if (typeof name !== 'string') return null;
  const key = name.toLowerCase().replace(/[\s_-]+/g, '');
  return byAnyName.get(key) ?? null;
}

/** Wrap any integer onto the cycle: → 1..tal.matras. */
export function wrapMatra(tal, n) {
  const m = ((n - 1) % tal.matras + tal.matras) % tal.matras + 1;
  return m;
}

/** 1-based matra numbers at which each vibhag starts. */
function vibhagStarts(tal) {
  const starts = [];
  let m = 1;
  for (const len of tal.vibhags) {
    starts.push(m);
    m += len;
  }
  return starts;
}

/** 0-based vibhag index containing 1-based matra m (m is wrapped first). */
export function vibhagOfMatra(tal, m) {
  const w = wrapMatra(tal, m);
  const starts = vibhagStarts(tal);
  for (let i = starts.length - 1; i >= 0; i--) {
    if (w >= starts[i]) return i;
  }
  return 0; // unreachable: starts[0] === 1
}

/** Marker string if matra m (wrapped) starts a vibhag, else null. */
export function markerAtMatra(tal, m) {
  const w = wrapMatra(tal, m);
  const starts = vibhagStarts(tal);
  const i = starts.indexOf(w);
  return i === -1 ? null : tal.markers[i];
}

/**
 * Landing arithmetic for phrase repeats (the tihai report).
 * A phrase of `phraseMatras` matras played `times` times starting at
 * `startMatra` occupies phraseMatras*times consecutive matras; the landing
 * is the cycle position of the FINAL repetition's LAST matra.
 * @returns {{matra: number, marker: string|null, isSam: boolean, isKhali: boolean}}
 */
export function landing(tal, startMatra, phraseMatras, times) {
  const last = wrapMatra(tal, startMatra + phraseMatras * times - 1);
  const v = vibhagOfMatra(tal, last);
  return {
    matra: last,
    marker: markerAtMatra(tal, last),
    isSam: last === vibhagStarts(tal)[tal.samVibhag],
    isKhali: tal.khaliVibhags.includes(v),
  };
}

/**
 * Validate the matra counts of a line's bar-separated segments against the
 * tal, given the line's start offset. Segment 0 runs from startMatra to the
 * end of its vibhag; each following segment should fill the next whole
 * vibhag; the FINAL segment may legally stop short (an incomplete last bar).
 * @param {Tal} tal
 * @param {number} startMatra   — 1-based cycle position of the line's first matra
 * @param {number[]} barSegmentLengths — matra counts between `|`s, in order
 * @returns {{segmentIndex: number, expected: number, got: number}[]}
 */
export function validateSpans(tal, startMatra, barSegmentLengths) {
  const problems = [];
  let m = wrapMatra(tal, startMatra);
  for (let i = 0; i < barSegmentLengths.length; i++) {
    const got = barSegmentLengths[i];
    const v = vibhagOfMatra(tal, m);
    const starts = vibhagStarts(tal);
    const vibhagEnd = starts[v] + tal.vibhags[v] - 1;
    const expected = vibhagEnd - m + 1; // matras remaining in the current vibhag
    const isLast = i === barSegmentLengths.length - 1;
    if (got !== expected && !(isLast && got < expected)) {
      problems.push({ segmentIndex: i, expected, got });
    }
    m = wrapMatra(tal, m + got);
  }
  return problems;
}
