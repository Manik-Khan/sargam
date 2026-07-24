// SARGAM_NOTATION_STRUCTURE_WAVE_2026_07_18
// src/engine/commands.js — M4 selection commands (M, 2026-07-16: "buttons
// that let us highlight sections of notes and apply that formatting to the
// section — so you don't have to remember all of the commands").
//
// Pure string→string transforms over a selection of Sargam text. The
// editor buttons are a thin shell over these; everything testable lives
// here. Each transform preserves the selection's leading/trailing
// whitespace and returns text the parser accepts.
//
// Engine rules: plain JS, no React, no DOM, never throws.

/** Split a selection into [leading ws, core, trailing ws]. */
function trimmed(sel) {
  const s = String(sel ?? '');
  const lead = s.match(/^\s*/)[0];
  const tail = s.match(/\s*$/)[0];
  const core = s.slice(lead.length, s.length - tail.length || undefined);
  return [lead, s.trim() === '' ? '' : core, s.trim() === '' ? '' : tail];
}

/**
 * Slide (~). A selected cluster uses an explicit scope. That spelling remains
 * one matra when inserted inside a larger cluster: selecting the final DP in
 * DDDP produces `DD~(DP)`, not the kan-like `DD~DP`.
 */
export function applySlide(sel) {
  const [lead, core, tail] = trimmed(sel);
  if (core === '') return lead + '~' + tail;
  if (!/\s/.test(core)) return lead + '~(' + core + ')' + tail;
  return lead + '~(' + core + ')' + tail;
}

/**
 * Kan/grace ({...}X). The last note of the selection is the destination and
 * owns the beat; everything before it becomes the grace run. One cluster:
 * last character is the destination (dPm → {dP}m), keeping its octave
 * prefix with it. Spaced tokens: last token is the destination.
 */
export function applyKan(sel) {
  const [lead, core, tail] = trimmed(sel);
  if (core === '') return lead + '{}' + tail;
  const tokens = core.split(/\s+/);
  if (tokens.length >= 2) {
    const dest = tokens.pop();
    return lead + '{' + tokens.join('') + '}' + dest + tail;
  }
  const tok = tokens[0];
  // last note WITH its octave prefixes is the destination
  const m = tok.match(/^([\s\S]*?)(['.]*[SrRgGmMPdDnN])$/);
  if (!m || m[1] === '') return lead + '{' + tok + '}' + tail;
  return lead + '{' + m[1] + '}' + m[2] + tail;
}

/** Krintan ([[...]]). */
export function applyKrintan(sel) {
  const [lead, core, tail] = trimmed(sel);
  return lead + '[[' + core + ']]' + tail;
}

/** Slotted beat ([...]) — the selection shares one matra. */
export function applyBeat(sel) {
  const [lead, core, tail] = trimmed(sel);
  return lead + '[' + core + ']' + tail;
}

/** Phrase repeat ((...)xN). */
export function applyRepeat(sel, times = 3) {
  const [lead, core, tail] = trimmed(sel);
  const n = Number.isFinite(Number(times)) && Number(times) > 1 ? Number(times) : 3;
  return lead + '(' + core + ')x' + n + tail;
}

/** Line repeat (||: ... :||). */
export function applyLineRepeat(sel) {
  const [lead, core, tail] = trimmed(sel);
  return lead + '||: ' + core + ' :||' + tail;
}

/**
 * Octave shift. Every note in the selection moves one register up or down,
 * by ARITHMETIC on its existing marks — so down cancels up ('S → S, never
 * .'S), and marks stack ('S up → ''S). Rhythm, barlines, tildes, braces
 * and brackets pass through untouched.
 */
export function shiftOctave(sel, delta) {
  return String(sel ?? '').replace(/(['.]*)([SrRgGmMPdDnN])/g, (_, marks, letter) => {
    let o = 0;
    for (const c of marks) o += c === "'" ? 1 : -1;
    o += delta;
    if (o > 0) return "'".repeat(o) + letter;
    if (o < 0) return '.'.repeat(-o) + letter;
    return letter;
  });
}
