// smokes/vilambit-marker-loop.smoke.js — marker-driven loop workflow and compact source controls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

async function loadCore() {
  const source = await read('../public/vilambit/vilambit-core.js');
  const context = vm.createContext({ globalThis: {} });
  vm.runInContext(source, context, { filename: 'vilambit-core.js' });
  return context.globalThis.VilambitCore;
}

export const smokes = [
  {
    name: 'vilambit marker loop: source controls are separated into waveform and loop groups',
    async fn() {
      const html = await read('../public/vilambit.html');
      assert.match(html, /id=["']waveToolbar["']/);
      assert.match(html, /class=["'][^"']*waveToolGroup[^"']*["']/);
      assert.match(html, /id=["']loopBoundaryGrid["']/);
      assert.match(html, /id=["']setA["'][^>]*>[^<]*Playhead/);
      assert.match(html, /id=["']setB["'][^>]*>[^<]*Playhead/);
    },
  },
  {
    name: 'vilambit marker loop: marker actions can seek, set either boundary, or loop to the next marker',
    async fn() {
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(app, /function setLoopBoundaryFromMarker/);
      assert.match(app, /function loopFromMarkerToNext/);
      assert.match(app, /Core\.loopFromMarkerToNext/);
      assert.match(app, /markerAction/);
      assert.match(app, /event\.shiftKey/);
      assert.match(app, /event\.altKey/);
    },
  },
  {
    name: 'vilambit marker loop: loop boundaries can be saved directly as markers',
    async fn() {
      const html = await read('../public/vilambit.html');
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(html, /id=["']saveAAsMarker["'][^>]*>A → Marker/);
      assert.match(html, /id=["']saveBAsMarker["'][^>]*>B → Marker/);
      assert.match(app, /function saveLoopBoundaryAsMarker/);
      assert.match(app, /duplicateTolerance = 0\.005/);
      assert.match(app, /Core\.addMarker\(state\.markers, time, state\.duration\)/);
    },
  },
  {
    name: 'vilambit marker loop: next-marker range skips duplicate timestamps and arms playback',
    async fn() {
      const core = await loadCore();
      assert.deepEqual(
        { ...core.loopFromMarkerToNext([
          { t: 10, label: 'A' },
          { t: 10, label: 'duplicate' },
          { t: 18.5, label: 'B' },
        ], 0, 60) },
        { loopA: 10, loopB: 18.5, ready: true, loopOn: true, nextMarkerIndex: 2 },
      );
      assert.deepEqual(
        { ...core.loopFromMarkerToNext([{ t: 10 }], 0, 60) },
        { loopA: 10, loopB: null, ready: false, loopOn: false, nextMarkerIndex: -1 },
      );
      assert.deepEqual(
        { ...core.setLoopBoundaryFromMarker({ loopA: 5, loopB: 8, point: 'A', markerTime: 12, duration: 60 }) },
        { loopA: 12, loopB: null, ready: false },
      );
      assert.deepEqual(
        { ...core.setLoopBoundaryFromMarker({ loopA: 15, loopB: 20, point: 'B', markerTime: 10, duration: 60 }) },
        { loopA: null, loopB: 10, ready: false },
      );
    },
  },
];
