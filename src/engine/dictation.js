// dictation.js — spoken (or typed) sargam syllables → notation atoms.
//
// M's idea, 2026-07-16: say "sa ga ma pa dha ni sa", get SGmPDNS. The
// insight that makes it tractable is his: **the raga declares the notes.**
// In Bhairavi "re" means komal re without saying so, because that is how
// the tradition already encodes it — you only name the accidental when you
// depart from the raga. So the grammar is small, closed, and mostly
// determined before a word is spoken.
//
// This module is the GRAMMAR half, deliberately separated from any input
// channel: pure text→text, offline, no microphone, no network. A keyboard
// can drive it today (fast entry: type what you'd say). A speech front-end,
// if one is ever built, feeds it recognized words and nothing here changes.
// Same pattern as the rest of the engine: pure core, injected surfaces.
//
// Engine rules apply: plain JS, no React, no DOM, never throws.

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

// Sa and Pa are fixed. Every other syllable has two forms; which one a bare
// syllable means is decided by the raga (below). Letters per spec §3.3:
// capitals shuddha, lowercase komal — with Ma the known exception, since it
// has no komal form: m = shuddh Ma, M = tivra Ma.
const FORMS = {
  sa: { fixed: 'S' },
  re: { komal: 'r', shuddh: 'R' },
  ga: { komal: 'g', shuddh: 'G' },
  ma: { shuddh: 'm', tivra: 'M' },
  pa: { fixed: 'P' },
  dha: { komal: 'd', shuddh: 'D' },
  ni: { komal: 'n', shuddh: 'N' },
};

/** Raga → which form each bare syllable takes. DATA, like tala.js: adding a
 *  raga is a data edit, not a code change. Only ragas M has dictated are
 *  here — Claude must never invent a raga's notes (working rule: never
 *  improvise the tradition). Ragas absent from this table fall back to
 *  shuddha and say so; explicit modifiers always work regardless. */
export const RAGA_SCALES = {
  // M, 2026-07-16, verbatim: "Raga Bhairavi. Sa komal re komal ga shuddh ma
  // P komal dha komal ni."
  bhairavi: { re: 'r', ga: 'g', ma: 'm', dha: 'd', ni: 'n' },
};

const DEFAULT_SCALE = { re: 'R', ga: 'G', ma: 'm', dha: 'D', ni: 'N' };

const MODIFIERS = {
  komal: 'komal',
  shuddh: 'shuddh',
  shuddha: 'shuddh',
  suddh: 'shuddh',
  tivra: 'tivra',
  teevra: 'tivra',
  tivar: 'tivra',
};

// M proposed low/middle/high; the tradition's own words work too. Octave
// words are ONE-SHOT — they bind the next note only — which is the literal
// reading of M's example ("S low n low d low n ..." names it three times).
// OPEN RULING: sticky registers ("mandra ni dha ni" holding until changed)
// would be less to say. M's call; the change is localized to applyOctave().
const OCTAVES = {
  low: -1,
  mandra: -1,
  down: -1,
  middle: 0,
  madhya: 0,
  high: 1,
  taar: 1,
  tar: 1,
  up: 1,
};

/** Manglings a general-purpose recognizer is likely to return for these
 *  syllables. SPECULATIVE — untested against a real recognizer; extend from
 *  live data rather than trusting this list. */
// An alias may expand to MULTIPLE words ('sorry' → 'sa re'). The first
// entries under FIELD DATA are real recognizer output from M's own mic
// test (2026-07-16: "sa re ga ma pa" came back as "sorry I got my fire") —
// keep extending this table from what the recognizer actually returns.
const ALIASES = {
  knee: 'ni',
  nee: 'ni',
  ne: 'ni',
  saw: 'sa',
  sah: 'sa',
  so: 'sa',
  ray: 're',
  rey: 're',
  gah: 'ga',
  guh: 'ga',
  mah: 'ma',
  muh: 'ma',
  pah: 'pa',
  puh: 'pa',
  da: 'dha',
  duh: 'dha',
  dah: 'dha',
  the: 'dha',
  komul: 'komal',
  kamal: 'komal',
  // FIELD DATA (M, 2026-07-16)
  sorry: 'sa re',
  got: 'ga',
  my: 'ma',
  fire: 'pa',
  i: '',
  // spoken letter-names
  ess: 'sa',
  es: 'sa',
  are: 're',
  ar: 're',
  gee: 'ga',
  jee: 'ga',
  em: 'ma',
  pea: 'pa',
  pee: 'pa',
  dee: 'dha',
  en: 'ni',
  // number words — recognizers nail digits, so 1..7 are the reliable
  // spoken channel: Sa=1 Re=2 Ga=3 Ma=4 Pa=5 Dha=6 Ni=7
  one: 'sa',
  two: 're',
  three: 'ga',
  four: 'ma',
  five: 'pa',
  six: 'dha',
  seven: 'ni',
  1: 'sa',
  2: 're',
  3: 'ga',
  4: 'ma',
  5: 'pa',
  6: 'dha',
  7: 'ni',
};

// Voice has no case: in caseless mode a bare letter maps to its syllable
// and the raga decides the form (M's raga-defaults insight, applied to
// letters). Typed mode keeps case meaningful — except s and p, which have
// no komal form and forgive lowercase in both modes.
const LETTER_SYLLABLE = { s: 'sa', r: 're', g: 'ga', m: 'ma', p: 'pa', d: 'dha', n: 'ni' };

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// A bare notation letter is accepted alongside the spoken syllable — M's
// own octave example mixed them ("S low n low d ..."), which is evidently
// how he thinks: the letters where he knows them, the words where he'd
// speak them. Unambiguous, since no sargam syllable is a single letter.
// Case is load-bearing here (r vs R), so letters are matched BEFORE the
// lowercasing that syllables need.
const LETTER_RE = /^[SrRgGmMPdDnN]$/;

const clean = (w) => w.replace(/[^A-Za-z0-9]/g, '');
const normalize = (w) => {
  const lower = clean(w).toLowerCase();
  return ALIASES[lower] || lower;
};

function pickForm(syllable, mod, scale) {
  const forms = FORMS[syllable];
  if (forms.fixed) return forms.fixed;
  if (mod && forms[mod]) return forms[mod];
  return scale[syllable];
}

function applyOctave(letter, octave) {
  if (octave < 0) return '.'.repeat(-octave) + letter;
  if (octave > 0) return "'".repeat(octave) + letter;
  return letter;
}

/**
 * @param {string} input  words: "sa ga ma pa", "low komal ni", "shuddh re"
 * @param {{raga?: string}} [opts]
 * @returns {{atoms: string[], problems: string[]}}  atoms are notation
 *   note-atoms ('S', 'r', ".n", "'M") — feed to atomsToText for text.
 */
export function spokenToAtoms(input, opts = {}) {
  const problems = [];
  let scale = DEFAULT_SCALE;
  if (opts.raga) {
    const key = String(opts.raga).toLowerCase().replace(/^raga\s+/, '').trim();
    if (RAGA_SCALES[key]) {
      scale = { ...DEFAULT_SCALE, ...RAGA_SCALES[key] };
    } else {
      problems.push(
        `raga '${opts.raga}' isn't in the scale table — bare syllables will read as shuddha. Add it to RAGA_SCALES, or name the accidentals ("komal re").`
      );
    }
  }

  // Alias expansion pass first — an alias may expand to several words.
  const raw = [];
  for (const w of String(input || '').split(/\s+/)) {
    const c = clean(w);
    if (!c) continue;
    const lower = c.toLowerCase();
    if (lower in ALIASES) {
      for (const part of ALIASES[lower].split(/\s+/)) if (part) raw.push(part);
    } else {
      raw.push(c);
    }
  }

  const atoms = [];
  let mod = null;
  let octave = 0;
  let pendingWord = null;

  for (const rawWord of raw) {
    if (rawWord.length === 1 && /[A-Za-z]/.test(rawWord)) {
      const lower = rawWord.toLowerCase();
      if (opts.caselessLetters && LETTER_SYLLABLE[lower]) {
        // voice: letter → syllable; raga + modifiers decide the form
        const letter = pickForm(LETTER_SYLLABLE[lower], mod, scale);
        atoms.push(applyOctave(letter, octave));
        mod = null;
        octave = 0;
        pendingWord = null;
        continue;
      }
      const typedForm =
        rawWord === 's' ? 'S' : rawWord === 'p' ? 'P' : LETTER_RE.test(rawWord) ? rawWord : null;
      if (typedForm) {
        atoms.push(applyOctave(typedForm, octave));
        mod = null;
        octave = 0;
        pendingWord = null;
        continue;
      }
    }
    const w = normalize(rawWord);
    if (!w) continue;
    if (MODIFIERS[w]) {
      mod = MODIFIERS[w];
      pendingWord = w;
      continue;
    }
    if (w in OCTAVES) {
      octave = OCTAVES[w];
      pendingWord = w;
      continue;
    }
    if (FORMS[w]) {
      const letter = pickForm(w, mod, scale);
      atoms.push(applyOctave(letter, octave));
      mod = null;
      octave = 0; // one-shot; see the OPEN RULING above
      pendingWord = null;
      continue;
    }
    problems.push(`'${w}' isn't a sargam syllable — skipped`);
  }

  if (pendingWord) {
    problems.push(`'${pendingWord}' has no note after it`);
  }
  return { atoms, problems };
}

/**
 * Atoms → Sargam text.
 * @param {string[]} atoms
 * @param {{separator?: string}} [opts]  ' ' → one note per matra (the
 *   useful default for hand-editing afterwards); '' → one matra holding
 *   them all, which is how M wrote his examples out.
 *   OPEN RULING: which should be the default, and should a spoken command
 *   ("in one beat") switch it? M's call.
 */
export function atomsToText(atoms, opts = {}) {
  const sep = opts.separator !== undefined ? opts.separator : ' ';
  return atoms.join(sep);
}
