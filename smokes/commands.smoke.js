// commands.smoke.js — M4 selection commands (M, 2026-07-16: "buttons that
// let us highlight sections of notes and apply that formatting"). Pure
// string→string transforms in the engine; the editor buttons are a thin
// shell over these. Every result must be valid Sargam text.
import assert from 'node:assert/strict';
import {
  applySlide,
  applyKan,
  applyKrintan,
  applyBeat,
  applyRepeat,
  applyLineRepeat,
  shiftOctave,
} from '../src/engine/commands.js';
import { parseDocument } from '../src/engine/parse.js';

const parses = (fragment) => {
  const { problems } = parseDocument(`tal: free\n\n${fragment}\n`);
  assert.deepEqual(problems, [], `${JSON.stringify(fragment)} → ${JSON.stringify(problems)}`);
};

export const smokes = [
  // ---------- slide ----------
  {
    name: 'slide: a partial cluster gets an explicit scoped meend',
    fn() {
      assert.equal(applySlide('mg'), '~(mg)');
      parses(applySlide('mg'));
    },
  },
  {
    name: 'slide: a multi-beat selection gets one ranged arc (~(m g))',
    fn() {
      assert.equal(applySlide('m g'), '~(m g)');
      assert.equal(applySlide('m D -'), '~(m D -)');
      parses(applySlide('m g'));
    },
  },
  // ---------- kan ----------
  {
    name: 'kan: one multi-note cluster — last note becomes the destination',
    fn() {
      assert.equal(applyKan('dPm'), '{dP}m');
      parses(applyKan('dPm'));
    },
  },
  {
    name: 'kan: spaced tokens — last token is the destination, graces join',
    fn() {
      assert.equal(applyKan("P'SN 'S"), "{P'SN}'S");
      assert.equal(applyKan('d P m'), '{dP}m');
      parses(applyKan('d P m'));
    },
  },
  {
    name: 'kan: octave prefixes travel with their notes',
    fn() {
      assert.equal(applyKan("'S n"), "{'S}n");
      parses(applyKan("'S n"));
    },
  },
  // ---------- wrappers ----------
  {
    name: 'krintan, beat, repeat, line repeat wrap and stay parseable',
    fn() {
      assert.equal(applyKrintan('DP'), '[[DP]]');
      assert.equal(applyBeat('m - g'), '[m - g]');
      assert.equal(applyRepeat('SR gm P', 3), '(SR gm P)x3');
      assert.equal(applyLineRepeat('S R g m'), '||: S R g m :||');
      parses(applyKrintan('DP'));
      parses(applyBeat('m - g'));
      parses(applyRepeat('SR gm P', 3));
      parses(applyLineRepeat('S R g m'));
    },
  },
  // ---------- octave arithmetic ----------
  {
    name: 'octave up: every note in the selection rises one register',
    fn() {
      assert.equal(shiftOctave('S R g m', 1), "'S 'R 'g 'm");
      assert.equal(shiftOctave('mg', 1), "'m'g", 'clusters shift per note');
    },
  },
  {
    name: 'octave down cancels an up — no .\'S nonsense',
    fn() {
      assert.equal(shiftOctave("'S", -1), 'S');
      assert.equal(shiftOctave('.n', 1), 'n');
      assert.equal(shiftOctave('S', -1), '.S');
      assert.equal(shiftOctave(shiftOctave('S R', 1), -1), 'S R', 'round-trips');
    },
  },
  {
    name: 'octave shift leaves rhythm and structure untouched',
    fn() {
      assert.equal(shiftOctave('S - - | m~ g', 1), "'S - - | 'm~ 'g");
      assert.equal(shiftOctave('{dP}m', 1), "{'d'P}'m", 'graces shift too');
      // barline fragments need a metered tal — | narrates in free sections
      const { problems } = parseDocument(`tal: rupak\n\n${shiftOctave('S - - | m~ g', 1)} | - -\n`);
      assert.deepEqual(problems, [], JSON.stringify(problems));
      parses(shiftOctave('{dP}m', 1));
    },
  },
  {
    name: 'octave shift stacks to double marks and comes back',
    fn() {
      assert.equal(shiftOctave("'S", 1), "''S");
      assert.equal(shiftOctave("''S", -1), "'S");
      assert.equal(shiftOctave('.d', -1), '..d');
    },
  },
  // ---------- edges ----------
  {
    name: 'commands: empty selection yields insertable templates, never garbage',
    fn() {
      assert.equal(applySlide(''), '~');
      assert.equal(applyKan(''), '{}');
      assert.equal(applyKrintan(''), '[[]]');
      assert.equal(applyRepeat('', 3), '()x3');
      assert.equal(shiftOctave('', 1), '');
    },
  },
  {
    name: 'commands: surrounding whitespace is preserved, transform applies inside',
    fn() {
      assert.equal(applySlide('  mg  '), '  ~(mg)  ');
      assert.equal(shiftOctave(' S R ', 1), " 'S 'R ");
    },
  },
];
