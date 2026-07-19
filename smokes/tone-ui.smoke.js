// tone-ui.smoke.js — guard the visible instrument choices and settings panel.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export const smokes = [
  {
    name: 'tone UI: offers sampled harmonium and per-voice sound controls',
    async fn() {
      const src = await readFile(new URL('../src/shell/Transport.jsx', import.meta.url), 'utf8');
      for (const phrase of [
        'Sampled harmonium',
        'Sound settings',
        'Brightness',
        'Attack',
        'Release',
        'Room',
        'Upper coupler',
        'Sub-octave',
        'Register',
        'Envelope',
        'Rounded triangle',
      ]) {
        assert.ok(src.includes(phrase), `missing ${phrase}`);
      }
    },
  },
  {
    name: 'tone UI: accurately labels the SoundFont load as online',
    async fn() {
      const src = await readFile(new URL('../src/shell/Transport.jsx', import.meta.url), 'utf8');
      assert.ok(src.includes('first use loads the SoundFont online'));
      assert.ok(src.includes('Current Pluck remains the fallback'));
    },
  },
];
