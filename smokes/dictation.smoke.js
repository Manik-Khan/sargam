// dictation.smoke.js — spoken/typed sargam syllables → notation.
// The specification here is M's own examples (2026-07-16), quoted verbatim
// in the smoke names. This module is the GRAMMAR half of the voice idea:
// pure text→text, offline, no microphone. A speech front-end (if one is
// ever built) feeds it words; a keyboard can feed it words today.
import assert from 'node:assert/strict';
import { spokenToAtoms, atomsToText, RAGA_SCALES } from '../src/engine/dictation.js';

const atoms = (s, opts) => spokenToAtoms(s, opts).atoms;
const text = (s, opts) => atomsToText(spokenToAtoms(s, opts).atoms, opts);

export const smokes = [
  // ---------- M's example 1 ----------
  {
    name: "M's example: 'Sa ga ma pa dha ni sa' → S G m P D N S",
    fn() {
      assert.deepEqual(atoms('Sa ga ma pa dha ni sa'), ['S', 'G', 'm', 'P', 'D', 'N', 'S']);
      assert.equal(text('Sa ga ma pa dha ni sa', { separator: '' }), 'SGmPDNS');
    },
  },
  {
    name: 'defaults with no raga are shuddha (and Ma is shuddh m, tivra is M)',
    fn() {
      assert.deepEqual(atoms('sa re ga ma pa dha ni'), ['S', 'R', 'G', 'm', 'P', 'D', 'N']);
    },
  },

  // ---------- M's example 2: octaves ----------
  {
    name: "M's example: 'S low n low d low n S high r high g high S' → S.n.d.nS'r'g'S",
    fn() {
      const src = 'S low n low d low n S high r high g high S';
      assert.equal(text(src, { separator: '' }), "S.n.d.nS'r'g'S");
    },
  },
  {
    name: "M's example mixes letters and words — bare notation letters are accepted",
    fn() {
      // M wrote his octave example with LETTERS (S, n, d, r, g), not
      // syllables — the letters where he knows them, the words where he'd
      // speak them. Case is load-bearing: n is komal ni, N is shuddh.
      assert.deepEqual(atoms('S n d N'), ['S', 'n', 'd', 'N']);
      assert.deepEqual(atoms('low n high S'), ['.n', "'S"]);
    },
  },
  {
    name: 'letters and syllables mix freely in one line',
    fn() {
      assert.deepEqual(atoms('sa r komal ga P'), ['S', 'r', 'g', 'P']);
    },
  },
  {
    name: 'octave words are one-shot: they bind the next note only',
    fn() {
      assert.deepEqual(atoms('low ni sa'), ['.N', 'S'], 'sa returns to madhya');
    },
  },
  {
    name: "the tradition's octave words work too: mandra / madhya / taar",
    fn() {
      assert.deepEqual(atoms('mandra ni sa taar sa'), ['.N', 'S', "'S"]);
      assert.deepEqual(atoms('madhya sa'), ['S']);
    },
  },

  // ---------- M's example 3: raga defaults ----------
  {
    name: "M's ruling: in Bhairavi, 're' means komal re without saying so",
    fn() {
      // M, 2026-07-16: "Raga Bhairavi. Sa komal re komal ga shuddh ma P
      // komal dha komal ni."
      assert.deepEqual(atoms('sa re ga ma pa dha ni', { raga: 'bhairavi' }), [
        'S', 'r', 'g', 'm', 'P', 'd', 'n',
      ]);
    },
  },
  {
    name: "M's ruling: explicit modifiers override the raga's defaults",
    fn() {
      // "unless you specifically state Shuddh re for like an ornament or
      // tivra Ma for a special line in Bhairavi"
      assert.deepEqual(atoms('shuddh re', { raga: 'bhairavi' }), ['R']);
      assert.deepEqual(atoms('tivra ma', { raga: 'bhairavi' }), ['M']);
      assert.deepEqual(atoms('komal ga', { raga: 'bhairavi' }), ['g']);
    },
  },
  {
    name: 'explicit modifiers work with no raga declared',
    fn() {
      assert.deepEqual(atoms('komal re komal ga tivra ma komal dha komal ni'), [
        'r', 'g', 'M', 'd', 'n',
      ]);
    },
  },
  {
    name: 'an unknown raga falls back to shuddha and narrates',
    fn() {
      const r = spokenToAtoms('sa re ga', { raga: 'notaraga' });
      assert.deepEqual(r.atoms, ['S', 'R', 'G']);
      assert.ok(r.problems.some((p) => /notaraga/.test(p)), JSON.stringify(r.problems));
    },
  },
  {
    name: 'modifiers and octaves compose in either order',
    fn() {
      assert.deepEqual(atoms('low komal ni'), ['.n']);
      assert.deepEqual(atoms('komal low ni'), ['.n']);
      assert.deepEqual(atoms('high tivra ma'), ["'M"]);
    },
  },

  // ---------- shape of the output ----------
  {
    name: 'atomsToText: separator decides beats — spaced is one note per matra',
    fn() {
      const a = ['S', 'G', 'm', 'P'];
      assert.equal(atomsToText(a, { separator: ' ' }), 'S G m P');
      assert.equal(atomsToText(a, { separator: '' }), 'SGmP');
    },
  },
  {
    name: 'output round-trips through the real parser as the same notes',
    fn() {
      // The point of the whole module: what it writes must be Sargam text.
      assert.equal(text('sa komal re komal ga', { separator: ' ' }), 'S r g');
    },
  },

  // ---------- robustness ----------
  {
    name: 'punctuation, case and extra whitespace are ignored',
    fn() {
      assert.deepEqual(atoms('  Sa,  RE.  ga!  '), ['S', 'R', 'G']);
    },
  },
  {
    name: 'common speech-recognition manglings map back to syllables',
    fn() {
      // Untested against a real recognizer — extend from live data.
      assert.deepEqual(atoms('sa knee da pa'), ['S', 'N', 'D', 'P']);
    },
  },
  {
    name: 'unrecognized words narrate and are skipped, never guessed',
    fn() {
      const r = spokenToAtoms('sa banana ga');
      assert.deepEqual(r.atoms, ['S', 'G']);
      assert.ok(r.problems.some((p) => /banana/.test(p)));
    },
  },
  {
    name: 'a dangling modifier at the end narrates',
    fn() {
      const r = spokenToAtoms('sa re komal');
      assert.deepEqual(r.atoms, ['S', 'R']);
      assert.ok(r.problems.some((p) => /komal/.test(p)));
    },
  },
  {
    name: 'empty input is empty output, no throw',
    fn() {
      assert.deepEqual(spokenToAtoms('').atoms, []);
      assert.deepEqual(spokenToAtoms('   ').problems, []);
    },
  },
  {
    name: 'RAGA_SCALES is data — Bhairavi is present and shaped for growth',
    fn() {
      assert.deepEqual(RAGA_SCALES.bhairavi, { re: 'r', ga: 'g', ma: 'm', dha: 'd', ni: 'n' });
    },
  },
// --- field fixes (M's mic test, 2026-07-16: "sa re ga ma pa" came back
  // as "sorry I got my fire"; spoken letters arrive lowercase; digits are
  // what recognizers actually nail).
  {
    name: "voice letters: caseless mode maps letters to syllables, raga decides the form",
    fn() {
      // spoken "s r g m p" arrives lowercase; case carries no information
      // in voice, so the raga does the deciding — M's own insight.
      assert.deepEqual(atoms('s r g m p', { caselessLetters: true }), ['S', 'R', 'G', 'm', 'P']);
      assert.deepEqual(atoms('s r g m p', { caselessLetters: true, raga: 'bhairavi' }), [
        'S', 'r', 'g', 'm', 'P',
      ]);
      assert.deepEqual(atoms('shuddh r', { caselessLetters: true, raga: 'bhairavi' }), ['R']);
    },
  },
  {
    name: 'typed letters: lowercase s and p forgive to S and P (no komal form exists)',
    fn() {
      assert.deepEqual(atoms('s r g m p'), ['S', 'r', 'g', 'm', 'P'], 'typed r stays komal');
    },
  },
  {
    name: "numbers: 1-7 and the words map to degrees (recognizers nail digits)",
    fn() {
      assert.deepEqual(atoms('1 2 3 4 5 6 7'), ['S', 'R', 'G', 'm', 'P', 'D', 'N']);
      assert.deepEqual(atoms('one two three four five six seven'), ['S', 'R', 'G', 'm', 'P', 'D', 'N']);
      assert.deepEqual(atoms('1 2 3', { raga: 'bhairavi' }), ['S', 'r', 'g'], 'raga defaults apply');
      assert.deepEqual(atoms('low 7 1'), ['.N', 'S'], 'octave words compose with digits');
      assert.deepEqual(atoms('komal 2'), ['r'], 'modifiers compose with digits');
    },
  },
  {
    name: "field aliases: M's actual mangling 'sorry I got my fire' recovers sa re ga ma pa",
    fn() {
      // Real recognizer output from M's test. 'sorry' expands to TWO
      // syllables; 'I' is noise and skipped without complaint.
      const r = spokenToAtoms('sorry I got my fire');
      assert.deepEqual(r.atoms, ['S', 'R', 'G', 'm', 'P']);
    },
  },
  {
    name: 'field aliases: spoken letter-names (ess, are, gee, em, pea, dee, en) map through',
    fn() {
      assert.deepEqual(atoms('ess are gee em pea dee en'), ['S', 'R', 'G', 'm', 'P', 'D', 'N']);
    },
  },
];
