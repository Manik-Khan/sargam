// Class-audio-only host waveform path, image, and cache checks.
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  createSidecar,
  isSidecarCurrent,
  normalizeClassAudioSource,
  parsePgm,
  peaksFromPgm,
  resolveInside,
  sidecarRelativePath,
  workerSidecarURL,
} from '../scripts/waveform-worker-core.mjs';
import {
  WAVEFORM_WORKER_FILES,
  WAVEFORM_WORKER_OUTPUT,
} from '../scripts/build-waveform-worker.mjs';

function makePgm() {
  const width = 4;
  const height = 9;
  const pixels = Buffer.alloc(width * height);
  for (let x = 0; x < width; x++) pixels[4 * width + x] = 255;
  for (let y = 0; y < height; y++) pixels[y * width + 1] = 255;
  return Buffer.concat([
    Buffer.from(`P5\n# Sargam test\n${width} ${height}\n255\n`, 'ascii'),
    pixels,
  ]);
}

export const smokes = [
  {
    name: 'waveform worker: class-audio URLs map safely without touching the media folder',
    fn() {
      const source = normalizeClassAudioSource('/classaudio/10-25-1983 BF.wav');
      assert.equal(source.relative, '10-25-1983 BF.wav');
      assert.equal(source.pathname, '/classaudio/10-25-1983%20BF.wav');
      assert.equal(sidecarRelativePath(source.relative), '10-25-1983 BF.wav.json');
      assert.equal(
        workerSidecarURL(source.pathname),
        '/sargam-waveforms/classaudio/10-25-1983%20BF.wav.json',
      );
      assert.equal(
        resolveInside('/srv/classaudio', source.relative),
        path.resolve('/srv/classaudio/10-25-1983 BF.wav'),
      );
      assert.throws(() => normalizeClassAudioSource('/concertvideo/test.mp4'), /Only \/classaudio\//);
      assert.throws(() => normalizeClassAudioSource('/classaudio/test.exe'), /file type/);
      assert.throws(() => resolveInside('/srv/classaudio', '../private.wav'), /outside/);
    },
  },
  {
    name: 'waveform worker: FFmpeg PGM pixels become compact signed peak pairs',
    fn() {
      const pgm = parsePgm(makePgm());
      assert.equal(pgm.width, 4);
      assert.equal(pgm.height, 9);
      const peaks = peaksFromPgm(pgm);
      assert.deepEqual(peaks[0], [0, 0]);
      assert.deepEqual(peaks[1], [-1, 1]);
      assert.equal(peaks.length, 4);
    },
  },
  {
    name: 'waveform worker: source fingerprints invalidate replaced recordings',
    fn() {
      const stats = { size: 123456, mtimeMs: Date.parse('2026-07-29T12:00:00Z') };
      const waveform = createSidecar({
        sourcePathname: '/classaudio/123.wav',
        stats,
        duration: 90.1234,
        peaks: [[-0.5, 0.5], [-1, 1]],
      });
      assert.equal(waveform.duration, 90.123);
      assert.equal(isSidecarCurrent(waveform, stats), true);
      assert.equal(isSidecarCurrent(waveform, { ...stats, size: 123457 }), false);
      assert.equal(isSidecarCurrent(waveform, { ...stats, mtimeMs: stats.mtimeMs + 1000 }), false);
    },
  },
  {
    name: 'waveform worker: build bundle is portable source with explicit host prerequisites',
    fn() {
      assert.equal(WAVEFORM_WORKER_OUTPUT, 'dist-waveform-worker');
      assert.ok(WAVEFORM_WORKER_FILES.some(([, destination]) => destination === 'sargam-waveform-worker.mjs'));
      assert.ok(WAVEFORM_WORKER_FILES.some(([, destination]) => destination === 'START-SARGAM-WAVEFORM-WORKER.cmd'));
      assert.ok(WAVEFORM_WORKER_FILES.some(([, destination]) => destination === 'README.md'));
      assert.ok(!WAVEFORM_WORKER_FILES.some(([source]) => source.includes('node_modules')));
    },
  },
];
