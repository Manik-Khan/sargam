import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildPracticeQueue,
  normalizePracticeSet,
  planPracticeStep,
  speedForPracticePass,
} from '../src/engine/practice-sets.js';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

const step = {
  audioLinkId: 'audio1',
  target: { kind: 'repetitions', count: 5 },
  speed: { startPercent: 70, endPercent: 90, stepPercent: 10, changeEveryRepetitions: 2 },
};

export const smokes = [
  {
    name: 'practice sets: repetition plans carry a bounded speed ladder',
    fn() {
      const plan = planPracticeStep(step, { clipDurationSeconds: 8 });
      assert.equal(plan.ok, true);
      assert.deepEqual(plan.passes.map((pass) => pass.speedPercent), [70, 70, 80, 80, 90]);
      assert.equal(plan.passes.length, 5);
      assert.equal(plan.targetReached, true);
    },
  },
  {
    name: 'practice sets: timed steps count real playback time at each speed',
    fn() {
      const plan = planPracticeStep({
        audioLinkId: 'audio2',
        target: { kind: 'minutes', minutes: 1 },
        speed: { startPercent: 50, endPercent: 100, stepPercent: 25, changeEveryRepetitions: 1 },
      }, { clipDurationSeconds: 10 });
      assert.equal(plan.ok, true);
      assert.deepEqual(plan.passes.map((pass) => pass.speedPercent), [50, 75, 100, 100, 100]);
      assert.ok(plan.plannedSeconds >= 60);
      assert.ok(plan.passes.slice(0, -1).reduce((sum, pass) => sum + pass.totalSeconds, 0) < 60);
    },
  },
  {
    name: 'practice sets: descending speed ladders clamp at their ending speed',
    fn() {
      const descending = {
        audioLinkId: 'audio3',
        target: { kind: 'repetitions', count: 6 },
        speed: { startPercent: 120, endPercent: 80, stepPercent: 15, changeEveryRepetitions: 1 },
      };
      assert.deepEqual([0, 1, 2, 3, 4].map((index) => speedForPracticePass(descending, index)), [120, 105, 90, 80, 80]);
    },
  },
  {
    name: 'practice sets: sequence queues preserve step order and set repetitions',
    fn() {
      const set = {
        version: 1,
        id: 'morning-routine',
        name: 'Morning Routine',
        repeatSet: 2,
        steps: [
          { audioLinkId: 'audio1', target: { kind: 'repetitions', count: 2 } },
          { audioLinkId: 'audio2', target: { kind: 'repetitions', count: 1 } },
        ],
      };
      const queue = buildPracticeQueue(set, { audio1: 4, audio2: 6 });
      assert.equal(queue.ok, true);
      assert.deepEqual(queue.queue.map((item) => item.audioLinkId), ['audio1', 'audio1', 'audio2', 'audio1', 'audio1', 'audio2']);
      assert.deepEqual(queue.queue.map((item) => item.setRound), [1, 1, 1, 2, 2, 2]);
    },
  },
  {
    name: 'practice sets: malformed steps are narrated rather than guessed',
    fn() {
      const result = normalizePracticeSet({ version: 1, steps: [{ target: { kind: 'minutes', minutes: 5 } }] });
      assert.equal(result.ok, false);
      assert.match(result.problems.join(' '), /audioLinkId/);
    },
  },
  {
    name: 'linked clip transport: shell loops clips and exposes a stop-state button',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      const bar = await read('../src/shell/PracticeBar.jsx');
      // SUPERSEDED 2026-07-21, Phase 3B Wave 3: HTMLMediaElement.loop
      // restarted extracted files with a rough seam. Linked clips now use the
      // decoded Web Audio transport and saved in-file A–B boundaries.
      assert.match(app, /playClipLoopFile\(file, clip/);
      assert.doesNotMatch(app, /audio\.loop\s*=\s*true/);
      assert.match(app, /linkedPlayback/);
      assert.match(app, /stopLinkedPlayback/);
      assert.match(bar, /Stop Linked/);
      assert.match(bar, /aria-pressed/);
    },
  },
];
