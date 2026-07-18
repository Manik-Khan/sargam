// smokes/vilambit-assets.smoke.js — static integration checks for the split player.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

export const smokes = [
  {
    name: 'vilambit: entry page loads split assets in original order',
    async fn() {
      const html = await read('../public/vilambit.html');
      assert.match(html, /<link rel="stylesheet" href="vilambit\/vilambit\.css">/);
      const signal = html.indexOf('vilambit/vendor/signalsmith-stretch.js');
      const flac = html.indexOf('vilambit/vendor/libflac.js');
      const app = html.indexOf('vilambit/vilambit-app.js');
      assert.ok(signal >= 0 && flac > signal && app > flac);
      assert.doesNotMatch(html, /Vilambit v2 — the musician's practice player/);
      assert.doesNotMatch(html, /var SignalsmithStretch =/);
    },
  },
  {
    name: 'vilambit: split assets retain vendor engines and app test hook',
    async fn() {
      const signal = await read('../public/vilambit/vendor/signalsmith-stretch.js');
      const flac = await read('../public/vilambit/vendor/libflac.js');
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(signal, /var SignalsmithStretch =/);
      assert.match(flac, /window\.Flac|Flac/);
      assert.match(app, /Vilambit v2 — the musician's practice player/);
      assert.match(app, /window\.VILAMBIT_TEST/);
    },
  },
  {
    name: 'vilambit: seek-before-first-play routing remains present',
    async fn() {
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(app, /state\.engine === 'none'/);
      assert.match(app, /state\.posPaused = t/);
      assert.match(app, /media\.currentTime = t/);
      assert.match(app, /return state\.posPaused \|\| media\.currentTime \|\| 0/);
    },
  },
];
