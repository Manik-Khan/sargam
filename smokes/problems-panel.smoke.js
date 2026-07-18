// smokes/problems-panel.smoke.js
import assert from 'node:assert/strict';
import {
  friendlyProblemMessage,
  groupProblems,
  problemSelectionRange,
  problemSummary,
} from '../src/shell/problems.js';

export const smokes = [
  {
    name: 'problems panel: summary uses singular and plural wording',
    fn() {
      assert.equal(problemSummary(1), '1 notation issue');
      assert.equal(problemSummary(12), '12 notation issues');
    },
  },
  {
    name: 'problems panel: exact duplicate diagnostics are grouped',
    fn() {
      const grouped = groupProblems([
        { line: 17, col: null, msg: 'vibhag 1 has 2 matras, expected 3' },
        { line: 17, col: null, msg: 'vibhag 1 has 2 matras, expected 3' },
        { line: 24, col: 33, msg: "unrecognized token 'gat'" },
      ]);
      assert.equal(grouped.length, 2);
      assert.equal(grouped[0].count, 2);
      assert.equal(grouped[1].count, 1);
    },
  },
  {
    name: 'problems panel: common parser messages are written plainly',
    fn() {
      assert.equal(
        friendlyProblemMessage('vibhag 3 has 14 matras, expected 2'),
        'Division 3 has 14 beats; this tal expects 2.',
      );
      assert.equal(
        friendlyProblemMessage("unrecognized token 'gat'"),
        'Sargam did not recognize “gat” as notation on this line.',
      );
    },
  },
  {
    name: 'problem navigation: line-only problems select the source line',
    fn() {
      const source = 'title: Test\nGat\nS R g m\nA.\n';
      assert.deepEqual(
        problemSelectionRange(source, { line: 3, col: null, msg: 'example' }),
        { start: 16, end: 23 },
      );
    },
  },
  {
    name: 'problem navigation: a precise unknown token is selected',
    fn() {
      const source = 'tal: rupak\n\nGat\nS R gat P\n';
      assert.deepEqual(
        problemSelectionRange(source, {
          line: 4,
          col: 5,
          msg: "unrecognized token 'gat'",
        }),
        { start: 20, end: 23 },
      );
    },
  },
];
