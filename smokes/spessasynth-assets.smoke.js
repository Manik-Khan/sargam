// spessasynth-assets.smoke.js — guard the bundled engine, worklet, and
// GeneralUser GS bank used by all sampled melody instruments.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { SoundBankLoader } from 'spessasynth_core';
import { MELODY_VOICE_DEFS, SOUNDFONT_VOICES } from '../src/shell/voices.js';

const BANK_URL = new URL(
  '../public/audio/soundfonts/generaluser/GeneralUser-GS-v1.471.sf2',
  import.meta.url
);

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
        new URL('../public/vendor/spessasynth/spessasynth_processor.min.js', import.meta.url)
      );
      assert.ok(info.size > 300_000, 'real SpessaSynth worklet processor is present');
    },
  },
  {
    name: 'spessasynth: GeneralUser GS and its license are bundled locally',
    async fn() {
      const info = await stat(BANK_URL);
      assert.ok(info.size > 25_000_000, 'real multi-instrument SoundFont is present');
      const license = await readFile(
        new URL('../public/audio/soundfonts/generaluser/LICENSE-GeneralUser-GS.txt', import.meta.url),
        'utf8'
      );
      assert.match(license, /use it in your software projects/i);
      assert.match(license, /GeneralUser GS v1\.471/);
    },
  },
  {
    name: 'spessasynth: bundled bank contains every selected preset at its declared program',
    async fn() {
      const bytes = await readFile(BANK_URL);
      const array = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const bank = SoundBankLoader.fromArrayBuffer(array);
      assert.equal(bank.soundBankInfo.name, 'GeneralUser GS 1.471');
      for (const voice of SOUNDFONT_VOICES) {
        const def = MELODY_VOICE_DEFS[voice];
        const preset = bank.presets.find(
          (p) => p.bankMSB === def.bankMSB &&
            p.bankLSB === def.bankLSB &&
            p.program === def.program
        );
        assert.ok(preset, `${voice} preset exists`);
        assert.equal(preset.name, def.presetName);
      }
    },
  },
  {
    name: 'spessasynth: adapter uses local package, worklet and SoundFont paths',
    async fn() {
      const src = await readFile(new URL('../src/shell/soundfont.js', import.meta.url), 'utf8');
      assert.ok(src.includes("from 'spessasynth_lib'"));
      assert.ok(src.includes('vendor/spessasynth/spessasynth_processor.min.js'));
      assert.ok(src.includes('audio/soundfonts/generaluser/GeneralUser-GS-v1.471.sf2'));
      assert.ok(!src.includes('unpkg.com'));
      assert.ok(!src.includes('raw.githubusercontent.com'));
    },
  },
];
