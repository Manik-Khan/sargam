// src/engine/model.js — Sargam engine: composition data structures.
// Plain JS, no React, no DOM. Durations are exact fractions — never floats
// (spec principle: exact matra fractions keep cross-rhythm possible later).

// ---------------------------------------------------------------------------
// Fractions
// ---------------------------------------------------------------------------

/**
 * @typedef {{num: number, den: number}} Frac  — both integers, den > 0.
 */

/** Construct a fraction. `den` defaults to 1. Not auto-reduced. */
export const frac = (num, den = 1) => ({ num, den });

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/** Reduce a fraction to lowest terms with a positive denominator. */
export function fracReduce(a) {
  const g = gcd(a.num, a.den);
  const sign = a.den < 0 ? -1 : 1;
  return frac((sign * a.num) / g, (sign * a.den) / g);
}

/** Sum of two fractions, reduced. */
export function fracAdd(a, b) {
  return fracReduce(frac(a.num * b.den + b.num * a.den, a.den * b.den));
}

/** Exact equality (compares values, not representations). */
export function fracEq(a, b) {
  return a.num * b.den === b.num * a.den;
}

/** Compare: -1 if a < b, 0 if equal, 1 if a > b. */
export function fracCmp(a, b) {
  const d = a.num * b.den - b.num * a.den;
  return d < 0 ? -1 : d > 0 ? 1 : 0;
}

/** Convert to a float — ONLY for final render/schedule output. */
export function fracToNumber(a) {
  return a.num / a.den;
}

// ---------------------------------------------------------------------------
// Model shapes (documentation of the plain-object contracts; no classes).
// These are the shapes parse.js produces and render.js/schedule.js consume.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Document
 * @property {Object} directives  — {tal, title, raga, sa, tempo, id, created, modified}
 * @property {Section[]} sections
 * @property {boolean} frontmatter — header was `---`-fenced (§3.1 amended 2026-07-16); serialize preserves the form
 *
 * @typedef {Object} Section
 * @property {string|null} label  — bare-text section label, e.g. 'Sthayi'
 * @property {string} tal         — tal name or 'free'
 * @property {Line[]} lines
 *
 * @typedef {Object} Line
 * @property {'music'} kind
 * @property {number} startMatra          — 1-based matra of the cycle; default 1 (`@N`)
 * @property {boolean} lineRepeat         — `||: :||`
 * @property {Matra[]} matras
 * @property {Span[]} spans               — meend, krintan
 * @property {PhraseRepeat[]} phraseRepeats
 * @property {{matraIndex: number, text: string}[]} lyrics      — resolved per spec §3.7
 * @property {{ref: EventRef, mark: 'da'|'ra'|'diri'}[]} bols   — resolved per spec §3.8
 * @property {{col: number, text: string}[]} passthrough        — unparsed fragments, rendered dim
 * @property {number} sourceLine
 *
 * @typedef {Object} Matra
 * @property {Event[]} events   — event durs sum to exactly 1
 *
 * @typedef {Object} Event
 * @property {'note'|'rest'|'sustain'} type
 * @property {Frac} dur
 * @property {string} [ch]       — notes only; case-preserving: 'S','r','M'…
 * @property {number} [octave]   — notes only; -2..2
 * @property {boolean} [holdToVibhag]  — first sustain generated from `_`, for round-trip
 *
 * @typedef {Object} EventRef
 * @property {number} matraIndex  — 0-based within the line
 * @property {number} eventIndex  — 0-based within the matra
 *
 * @typedef {Object} Span
 * @property {'meend'|'krintan'} type
 * @property {EventRef} from
 * @property {EventRef} to
 *
 * @typedef {Object} PhraseRepeat
 * @property {number} times
 * @property {number} fromMatra  — 0-based, inclusive, within the line
 * @property {number} toMatra    — 0-based, inclusive, within the line
 *
 * @typedef {Object} Problem
 * @property {number} line
 * @property {number|null} col
 * @property {string} msg
 */
