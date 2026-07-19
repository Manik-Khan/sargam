// spessasynth-assets.smoke.js — guard the bundled library dependency and
// same-origin AudioWorklet asset required by the sampled harmonium.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

export const smokes = [
  {
    name: 'spessasynth: npm libraries are pinned and the worklet is public',
    async fn() {
      const pkg = JSON.parse(
        await readFile(new URL('../package.json', import.meta.url), 'utf8')
      );
      assert.equal(pkg.dependencies.spessasynth_lib, '4.3.0');
      assert.equal(pkg.dependencies.spessasynth_core, '4.3.0');
      const info = await stat(
        new URL(
          '../public/vendor/spessasynth/spessasynth_processor.min.js',
          import.meta.url
        )
      );
      assert.ok(info.size > 300_000, 'real SpessaSynth worklet processor is present');
    },
  },
  {
    name: 'spessasynth: adapter imports the bundled package, not unpkg source',
    async fn() {
      const src = await readFile(
        new URL('../src/shell/soundfont.js', import.meta.url),
        'utf8'
      );
      assert.ok(src.includes("from 'spessasynth_lib'"));
      assert.ok(!src.includes('unpkg.com/spessasynth_lib'));
      assert.ok(src.includes('vendor/spessasynth/spessasynth_processor.min.js'));
    },
  },
];
