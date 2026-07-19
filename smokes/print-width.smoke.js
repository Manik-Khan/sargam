// Browser-measured export width + Rupak sam-only continuation planning.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  clearMeasuredLineLayout,
  planLineSystems,
  setMeasuredLineLayout,
} from '../src/engine/layout.js';
import { getTal } from '../src/engine/tala.js';

function lineOf(count, startMatra = 1) {
  return {
    startMatra,
    matras: Array.from({ length: count }, () => ({ events: [{ type: 'note', ch: 'S' }] })),
    spans: [],
    phraseRepeats: [],
    passthrough: [],
  };
}

export const smokes = [
  {
    name: 'print width: browser measurements replace conservative estimates',
    fn() {
      const line = lineOf(8);
      const tal = getTal('tintal');

      assert.ok(planLineSystems(line, tal, { maxEm: 10 }).length > 1);

      setMeasuredLineLayout(line, {
        widths: Array(8).fill(1),
        prefixEm: 0,
        suffixEm: 0,
      });
      assert.deepEqual(planLineSystems(line, tal, { maxEm: 10 }), [
        { from: 0, to: 7, reason: 'fits' },
      ]);

      clearMeasuredLineLayout(line);
      assert.ok(planLineSystems(line, tal, { maxEm: 10 }).length > 1);
    },
  },
  {
    name: 'print width: Rupak continuation systems begin only on sam',
    fn() {
      const line = lineOf(21);
      const tal = getTal('rupak');
      setMeasuredLineLayout(line, {
        widths: Array(21).fill(3),
        prefixEm: 0,
        suffixEm: 0,
      });

      const ranges = planLineSystems(line, tal, { maxEm: 22 });
      assert.deepEqual(ranges, [
        { from: 0, to: 6, reason: 'sam' },
        { from: 7, to: 13, reason: 'sam' },
        { from: 14, to: 20, reason: 'fits' },
      ]);
      clearMeasuredLineLayout(line);
    },
  },
  {
    name: 'print width: a Rupak pickup folds immediately before the next sam',
    fn() {
      const line = lineOf(14, 4);
      const tal = getTal('rupak');
      setMeasuredLineLayout(line, {
        widths: Array(14).fill(3),
        prefixEm: 0,
        suffixEm: 0,
      });

      const ranges = planLineSystems(line, tal, { maxEm: 13 });
      assert.equal(ranges[0].to, 3);
      assert.equal(ranges[1].from, 4);
      assert.equal(ranges[0].reason, 'sam');
      clearMeasuredLineLayout(line);
    },
  },
  {
    name: 'print width: export remeasures without replacing browser printing',
    fn() {
      const source = readFileSync(new URL('../src/shell/ExportView.jsx', import.meta.url), 'utf8');
      assert.match(source, /maxSystemEm:\s*Infinity/);
      assert.match(source, /beforeprint/);
      assert.match(source, /window\.print\(\)/);
      assert.match(source, /contentWidthInEm/);
    },
  },
];
