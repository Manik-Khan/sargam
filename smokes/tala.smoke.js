// smokes/tala.smoke.js — tal arithmetic against known answers (spec §8, plan Wave 1).
// Written FIRST, watched failing, then tala.js/model.js implemented to green.

import assert from 'node:assert/strict';
import {
  TALS,
  getTal,
  wrapMatra,
  vibhagOfMatra,
  markerAtMatra,
  landing,
  validateSpans,
} from '../src/engine/tala.js';
import { frac, fracAdd, fracEq, fracCmp, fracToNumber } from '../src/engine/model.js';

export const smokes = [
  // ---- fractions (model.js) ----
  {
    name: 'frac: constructor returns {num, den} ints, den defaults to 1',
    fn: () => {
      assert.deepEqual(frac(3, 4), { num: 3, den: 4 });
      assert.deepEqual(frac(5), { num: 5, den: 1 });
    },
  },
  {
    name: 'frac: 1/5 + 4/5 reduces to 1/1',
    fn: () => assert.deepEqual(fracAdd(frac(1, 5), frac(4, 5)), frac(1, 1)),
  },
  {
    name: 'frac: add reduces (1/6 + 1/3 = 1/2)',
    fn: () => assert.deepEqual(fracAdd(frac(1, 6), frac(1, 3)), frac(1, 2)),
  },
  {
    name: 'frac: fracEq compares across representations (2/4 == 1/2)',
    fn: () => {
      assert.equal(fracEq(frac(2, 4), frac(1, 2)), true);
      assert.equal(fracEq(frac(1, 3), frac(1, 4)), false);
    },
  },
  {
    name: 'frac: fracCmp orders correctly',
    fn: () => {
      assert.equal(fracCmp(frac(1, 3), frac(1, 2)), -1);
      assert.equal(fracCmp(frac(1, 2), frac(1, 3)), 1);
      assert.equal(fracCmp(frac(2, 6), frac(1, 3)), 0);
    },
  },
  {
    name: 'frac: fracToNumber for final output only',
    fn: () => assert.equal(fracToNumber(frac(3, 4)), 0.75),
  },

  // ---- tal lookup ----
  {
    name: 'getTal: known names resolve, unknown → null',
    fn: () => {
      assert.ok(getTal('tintal'));
      assert.equal(getTal('no-such-tal'), null);
    },
  },
  {
    name: 'getTal: chachar/adachautal alias resolves to the same tal',
    fn: () => {
      const a = getTal('chachar');
      const b = getTal('adachautal');
      assert.ok(a);
      assert.equal(a, b);
    },
  },

  // ---- marker derivation: the Kirwani facts ----
  {
    name: 'tintal: sam marker + at matra 1',
    fn: () => assert.equal(markerAtMatra(getTal('tintal'), 1), '+'),
  },
  {
    name: 'tintal: khali marker 0 at matra 9',
    fn: () => assert.equal(markerAtMatra(getTal('tintal'), 9), '0'),
  },
  {
    name: 'tintal: mid-vibhag matra 14 has no marker',
    fn: () => assert.equal(markerAtMatra(getTal('tintal'), 14), null),
  },
  {
    name: 'vistar @7: 3rd cell = matra 9 = khali',
    fn: () => {
      const t = getTal('tintal');
      assert.equal(wrapMatra(t, 7 + 2), 9);
      assert.equal(markerAtMatra(t, wrapMatra(t, 9)), '0');
    },
  },
  {
    name: 'sthayi @7: line position 11 wraps to matra 1 (sam)',
    fn: () => assert.equal(wrapMatra(getTal('tintal'), 7 + 10), 1),
  },
  {
    name: 'wrapMatra: wraps any int into 1..matras',
    fn: () => {
      const t = getTal('tintal');
      assert.equal(wrapMatra(t, 16), 16);
      assert.equal(wrapMatra(t, 17), 1);
      assert.equal(wrapMatra(t, 33), 1);
      assert.equal(wrapMatra(t, 0), 16);
    },
  },
  {
    name: 'vibhagOfMatra: tintal boundaries land in the right vibhag',
    fn: () => {
      const t = getTal('tintal');
      assert.equal(vibhagOfMatra(t, 1), 0);
      assert.equal(vibhagOfMatra(t, 4), 0);
      assert.equal(vibhagOfMatra(t, 5), 1);
      assert.equal(vibhagOfMatra(t, 9), 2);
      assert.equal(vibhagOfMatra(t, 16), 3);
    },
  },
  {
    name: 'jhaptal: uneven vibhags [2,3,2,3] place markers at 1,3,6,8',
    fn: () => {
      const t = getTal('jhaptal');
      assert.equal(markerAtMatra(t, 1), '+');
      assert.equal(markerAtMatra(t, 3), '2');
      assert.equal(markerAtMatra(t, 6), '0');
      assert.equal(markerAtMatra(t, 8), '3');
      assert.equal(markerAtMatra(t, 2), null);
    },
  },

  // ---- landing arithmetic ----
  {
    name: 'tihai: (SR gm P)x3 from sam lands matra 9, khali not sam',
    fn: () => {
      const l = landing(getTal('tintal'), 1, 3, 3);
      assert.equal(l.matra, 9);
      assert.equal(l.isKhali, true);
      assert.equal(l.isSam, false);
      assert.equal(l.marker, '0');
    },
  },
  {
    name: 'landing: sam landing reports isSam with + marker',
    fn: () => {
      // 4-matra phrase x4 from sam: 16 matras, last matra = 16... next cycle's sam is matra 1.
      // Landing = the matra the FINAL repetition's LAST matra occupies: start 1, 16 matras → matra 16.
      const l = landing(getTal('tintal'), 1, 4, 4);
      assert.equal(l.matra, 16);
      assert.equal(l.isSam, false);
      // A phrase engineered to land ON sam: start @14, 3-matra phrase x2 → 14..19 → last = 19 → wraps to 3? No:
      // start 14, 6 matras total occupy 14,15,16,1,2,3 → last = wrapMatra(14+6-1)=wrapMatra(19)=3.
      // Simplest sam case: start @2, 4-matra phrase x4 → last = wrapMatra(2+16-1)=wrapMatra(17)=1 = sam.
      const s = landing(getTal('tintal'), 2, 4, 4);
      assert.equal(s.matra, 1);
      assert.equal(s.isSam, true);
      assert.equal(s.marker, '+');
    },
  },

  // ---- rupak: khali-marked sam (why markers are data) ----
  {
    name: "rupak: sam's marker is 0",
    fn: () => assert.equal(markerAtMatra(getTal('rupak'), 1), '0'),
  },
  {
    name: 'rupak: sam is both sam and khali',
    fn: () => {
      const l = landing(getTal('rupak'), 1, 7, 1); // whole cycle → last matra 7; then a sam-landing case
      assert.equal(l.matra, 7);
      const s = landing(getTal('rupak'), 2, 7, 1); // start 2, 7 matras → last = wrap(2+7-1)=wrap(8)=1
      assert.equal(s.matra, 1);
      assert.equal(s.isSam, true);
      assert.equal(s.isKhali, true); // rupak's defining quirk
    },
  },

  // ---- per-tal structural invariants ----
  {
    name: 'TALS ships all five spec tals',
    fn: () => {
      for (const name of ['tintal', 'jhaptal', 'rupak', 'ektal', 'chachar']) {
        assert.ok(getTal(name), `missing tal: ${name}`);
      }
      assert.ok(Object.keys(TALS).length >= 5, 'TALS is missing entries');
    },
  },
  {
    name: 'every tal: vibhag lengths sum to matras',
    fn: () => {
      assert.ok(Object.keys(TALS).length > 0, 'TALS is empty — vacuous pass guard');
      for (const tal of Object.values(TALS)) {
        assert.equal(
          tal.vibhags.reduce((a, b) => a + b, 0),
          tal.matras,
          `${tal.name}: vibhags do not sum to matras`
        );
      }
    },
  },
  {
    name: 'every tal: one marker per vibhag',
    fn: () => {
      for (const tal of Object.values(TALS)) {
        assert.equal(tal.markers.length, tal.vibhags.length, `${tal.name}: marker count mismatch`);
      }
    },
  },
  {
    name: 'every tal: markerAtMatra defined for offsets 1..matras, non-null exactly at vibhag starts',
    fn: () => {
      for (const tal of Object.values(TALS)) {
        const starts = new Set();
        let m = 1;
        for (const len of tal.vibhags) {
          starts.add(m);
          m += len;
        }
        for (let i = 1; i <= tal.matras; i++) {
          const mk = markerAtMatra(tal, i);
          if (starts.has(i)) assert.ok(mk !== null, `${tal.name} matra ${i} should carry a marker`);
          else assert.equal(mk, null, `${tal.name} matra ${i} should carry no marker`);
        }
      }
    },
  },

  // ---- vibhag span validation ("line 4, vibhag 2 has 5 matras") ----
  {
    name: 'validateSpans: correct tintal line from sam → no problems',
    fn: () => {
      const t = getTal('tintal');
      assert.deepEqual(validateSpans(t, 1, [4, 4, 4, 4]), []);
    },
  },
  {
    name: 'validateSpans: 5-matra vibhag reported with expected/got',
    fn: () => {
      const t = getTal('tintal');
      const probs = validateSpans(t, 1, [4, 5, 4, 4]);
      assert.equal(probs.length >= 1, true);
      assert.equal(probs[0].segmentIndex, 1);
      assert.equal(probs[0].expected, 4);
      assert.equal(probs[0].got, 5);
    },
  },
  {
    name: 'validateSpans: @7 start offset — sthayi segments 2,4,4,4,2 are valid',
    fn: () => {
      // A line starting on matra 7 of tintal: first segment runs to the end of vibhag 2
      // (matras 7,8 → length 2), then full vibhags 3,4,1, then 2 matras into vibhag 2.
      const t = getTal('tintal');
      assert.deepEqual(validateSpans(t, 7, [2, 4, 4, 4, 2]), []);
    },
  },
];
