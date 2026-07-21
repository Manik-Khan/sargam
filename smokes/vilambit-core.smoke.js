// smokes/vilambit-core.smoke.js — direct tests for Vilambit's pure player core.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadCore() {
  const source = await readFile(
    new URL('../public/vilambit/vilambit-core.js', import.meta.url),
    'utf8',
  );
  const context = vm.createContext({ globalThis: {} });
  vm.runInContext(source, context, { filename: 'vilambit-core.js' });
  return context.globalThis.VilambitCore;
}

export const smokes = [
  {
    name: 'vilambit core: clamps transport values at player limits',
    async fn() {
      const core = await loadCore();
      assert.equal(core.clampPosition(-3, 90), 0);
      assert.equal(core.clampPosition(123, 90), 90);
      assert.equal(core.clampTempo(24.6), 25);
      assert.equal(core.clampTempo(201), 200);
      assert.equal(core.clampSemitones(18), 12);
      assert.equal(core.clampCents(-140), -100);
      assert.equal(core.totalSemitones(2, 35), 2.35);
    },
  },
  {
    name: 'vilambit core: buffer position follows playing and paused stores',
    async fn() {
      const core = await loadCore();
      assert.equal(core.currentPosition({
        engine: 'buffer', playing: true, bufferInputTime: 14.25,
        pausedPosition: 3, duration: 60,
      }), 14.25);
      assert.equal(core.currentPosition({
        engine: 'buffer', playing: false, bufferInputTime: 14.25,
        pausedPosition: 3, duration: 60,
      }), 3);
    },
  },
  {
    name: 'vilambit core: pre-play position trusts a prior paused seek',
    async fn() {
      const core = await loadCore();
      assert.equal(core.currentPosition({
        engine: 'none', pausedPosition: 42.5, mediaTime: 0, duration: 100,
      }), 42.5);
      assert.equal(core.currentPosition({
        engine: 'none', pausedPosition: 0, mediaTime: 8, duration: 100,
      }), 8);
    },
  },
  {
    name: 'vilambit core: seek before first play writes both future stores',
    async fn() {
      const core = await loadCore();
      assert.deepEqual(
        { ...core.planSeek({ engine: 'none', target: 42.5, duration: 100 }) },
        {
          position: 42.5,
          writePausedPosition: true,
          writeMediaTime: true,
          scheduleBufferInput: false,
        },
      );
    },
  },
  {
    name: 'vilambit core: active buffer and media seeks route separately',
    async fn() {
      const core = await loadCore();
      assert.deepEqual(
        { ...core.planSeek({ engine: 'buffer', target: 12, duration: 100 }) },
        {
          position: 12,
          writePausedPosition: true,
          writeMediaTime: false,
          scheduleBufferInput: true,
        },
      );
      assert.deepEqual(
        { ...core.planSeek({ engine: 'video', target: 120, duration: 100 }) },
        {
          position: 100,
          writePausedPosition: false,
          writeMediaTime: true,
          scheduleBufferInput: false,
        },
      );
    },
  },
  {
    name: 'vilambit core: first play reconciles the duplicated seek stores',
    async fn() {
      const core = await loadCore();
      assert.deepEqual(
        { ...core.reconcileFirstPlay({
          engine: 'buffer', pausedPosition: 0, mediaTime: 33, duration: 90,
        }) },
        { pausedPosition: 33, mediaTime: 33 },
      );
      assert.deepEqual(
        { ...core.reconcileFirstPlay({
          engine: 'video', pausedPosition: 33, mediaTime: 0, duration: 90,
        }) },
        { pausedPosition: 33, mediaTime: 33 },
      );
    },
  },
  {
    name: 'vilambit core: loop bounds normalize, clamp, and report readiness',
    async fn() {
      const core = await loadCore();
      assert.deepEqual(
        { ...core.normalizeLoop(80, 20, 60) },
        { loopA: 20, loopB: 60, ready: true },
      );
      assert.deepEqual(
        { ...core.normalizeLoop(null, 20, 60) },
        { loopA: null, loopB: 20, ready: false },
      );
      assert.deepEqual(
        { ...core.clearLoop() },
        { loopA: null, loopB: null, loopOn: false, ready: false },
      );
    },
  },
  {
    name: 'vilambit core: setting B after A arms the completed loop',
    async fn() {
      const core = await loadCore();
      assert.deepEqual(
        { ...core.setLoopPoint({ loopA: 10, point: 'B', position: 25, duration: 60 }) },
        { loopA: 10, loopB: 25, ready: true, loopOn: true },
      );
    },
  },
  {
    name: 'vilambit core: markers sort stably without mutating caller data',
    async fn() {
      const core = await loadCore();
      const source = [
        { t: 20, label: 'second' },
        { t: -2, label: 'start' },
        { t: 20, label: 'second-b' },
      ];
      const sorted = core.sortMarkers(source, 90);
      assert.deepEqual(Array.from(sorted, (marker) => ({ ...marker })), [
        { t: 0, label: 'start' },
        { t: 20, label: 'second' },
        { t: 20, label: 'second-b' },
      ]);
      assert.equal(source[1].t, -2);
    },
  },
  {
    name: 'vilambit core: marker add, move, and remove remain ordered',
    async fn() {
      const core = await loadCore();
      const added = core.addMarker([{ t: 20, label: 'B' }], 5, 60, 'A');
      assert.deepEqual(Array.from(added, (marker) => ({ ...marker })), [
        { t: 5, label: 'A' },
        { t: 20, label: 'B' },
      ]);
      const moved = core.moveMarker(added, 1, 2, 60);
      assert.deepEqual(Array.from(moved, (marker) => ({ ...marker })), [
        { t: 2, label: 'B' },
        { t: 5, label: 'A' },
      ]);
      assert.deepEqual(
        Array.from(core.removeMarker(moved, 0, 60), (marker) => ({ ...marker })),
        [{ t: 5, label: 'A' }],
      );
    },
  },
  {
    name: 'vilambit core: public snapshot is serializable and bridge-safe',
    async fn() {
      const core = await loadCore();
      const snapshot = core.createPublicSnapshot({
        ready: true,
        fileURL: 'blob:local-recording',
        fileName: 'Summer class.wav',
        duration: 120,
        position: 130,
        playing: true,
        extractable: true,
        tempo: 73.6,
        semitones: 3,
        cents: -12,
        loopA: 40,
        loopB: 20,
        loopOn: true,
        markers: [{ t: 80, label: 'taan' }, { t: 10, label: 'sthayi' }],
      });
      assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), {
        ready: true,
        loaded: true,
        source: { name: 'Summer class.wav', kind: 'audio' },
        duration: 120,
        position: 120,
        playing: true,
        extractable: true,
        speed: 74,
        pitch: { semitones: 3, cents: -12, totalSemitones: 2.88 },
        loop: { a: 20, b: 40, on: true, ready: true },
        markers: [{ t: 10, label: 'sthayi' }, { t: 80, label: 'taan' }],
        error: null,
      });
    },
  },
];
