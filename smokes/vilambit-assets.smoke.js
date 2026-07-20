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
      const core = html.indexOf('vilambit/vilambit-core.js');
      const app = html.indexOf('vilambit/vilambit-app.js');
      assert.ok(signal >= 0 && flac > signal && core > flac && app > core);
      assert.doesNotMatch(html, /Vilambit v2 — the musician's practice player/);
      assert.doesNotMatch(html, /var SignalsmithStretch =/);
    },
  },
  {
    name: 'vilambit: split assets retain vendor engines and app test hook',
    async fn() {
      const signal = await read('../public/vilambit/vendor/signalsmith-stretch.js');
      const flac = await read('../public/vilambit/vendor/libflac.js');
      const core = await read('../public/vilambit/vilambit-core.js');
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(signal, /var SignalsmithStretch =/);
      assert.match(flac, /window\.Flac|Flac/);
      assert.match(core, /root\.VilambitCore/);
      assert.match(app, /window\.VilambitCore/);
      assert.match(app, /Vilambit v2 — the musician's practice player/);
      assert.match(app, /window\.VILAMBIT_TEST/);
    },
  },
  {
    name: 'vilambit: app routes position and seek through the pure core',
    async fn() {
      const core = await read('../public/vilambit/vilambit-core.js');
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(app, /Core\.currentPosition/);
      assert.match(app, /Core\.planSeek/);
      assert.match(core, /engine === ENGINE_NONE/);
      assert.match(core, /writePausedPosition: true/);
      assert.match(core, /writeMediaTime: true/);
    },
  },
];
