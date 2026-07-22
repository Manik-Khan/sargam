// Phase 3B Wave 3 — non-destructive extracted-clip loop contracts.
import assert from 'node:assert/strict';
import {
  extractionRangeForLink,
  nearestZeroCrossing,
  normalizeClipLoopRegion,
  originalClipLoopRegion,
  snapLoopRegionToZeroCrossings,
  updateClipLoopAsset,
} from '../src/engine/clip-loop.js';

export const smokes = [
  {
    name: 'clip loop: extraction keeps source timing and adds editable padding',
    fn() {
      const range = extractionRangeForLink({ startTime: 10, endTime: 14 }, 100, 0.4);
      assert.equal(range.ok, true);
      assert.equal(range.extractionStart, 9.6);
      assert.equal(range.extractionEnd, 14.4);
      assert.equal(range.loopStart, 0.4);
      assert.equal(range.loopEnd, 4.4);
    },
  },
  {
    name: 'clip loop: extraction padding clamps at source boundaries',
    fn() {
      const range = extractionRangeForLink({ startTime: 0.1, endTime: 9.9 }, 10, 0.4);
      assert.equal(range.extractionStart, 0);
      assert.equal(range.extractionEnd, 10);
      assert.equal(range.paddingBefore, 0.1);
      assert.equal(range.paddingAfter, 0.1);
    },
  },
  {
    name: 'clip loop: old clips default to their complete extracted file',
    fn() {
      const region = normalizeClipLoopRegion({ startTime: 42, endTime: 48 });
      assert.deepEqual(region, { ok: true, start: 0, end: 6, duration: 6, crossfadeMs: 12 });
    },
  },
  {
    name: 'clip loop: reset uses the extraction-time intended phrase',
    fn() {
      const region = originalClipLoopRegion({
        startTime: 41.6, endTime: 48.4, duration: 6.8,
        defaultLoopStart: 0.4, defaultLoopEnd: 6.4,
        loopStart: 0.8, loopEnd: 6.1,
      });
      assert.equal(region.start, 0.4);
      assert.equal(region.end, 6.4);
    },
  },
  {
    name: 'clip loop: saved boundaries remain inside the binary file',
    fn() {
      const clip = updateClipLoopAsset({
        id: 'clip-0001', startTime: 10, endTime: 15, duration: 5,
      }, { start: -1, end: 7, duration: 5, crossfadeMs: 18 });
      assert.equal(clip.loopStart, 0);
      assert.equal(clip.loopEnd, 5);
      assert.equal(clip.crossfadeMs, 18);
    },
  },
  {
    name: 'clip loop: decoded duration safely clamps extraction-time reset points',
    fn() {
      const clip = updateClipLoopAsset({
        id: 'clip-0001', startTime: 10, endTime: 15, duration: 5,
        defaultLoopStart: 0.4, defaultLoopEnd: 4.9,
      }, { start: 0.5, end: 4.6, duration: 4.7 });
      assert.equal(clip.duration, 4.7);
      assert.equal(clip.defaultLoopEnd, 4.7);
      assert.equal(clip.loopEnd, 4.6);
    },
  },
  {
    name: 'clip loop: nearest zero crossing stays near the requested boundary',
    fn() {
      const samples = new Float32Array(100).fill(-1);
      for (let i = 20; i < 80; i++) samples[i] = 1;
      assert.equal(nearestZeroCrossing(samples, 0.023, 1000, 0.01), 0.02);
      const snapped = snapLoopRegionToZeroCrossings(samples, 1000, 0.023, 0.078, 0.1);
      assert.equal(snapped.start, 0.02);
      assert.equal(snapped.end, 0.08);
    },
  },
];
