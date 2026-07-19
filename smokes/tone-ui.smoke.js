// tone-ui.smoke.js — guard the visible instrument choices and settings panel.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MELODY_VOICE_OPTIONS } from '../src/shell/voices.js';

export const smokes = [
  {
    name: 'tone UI: offers the complete pitch-locked instrument catalogue',
    async fn() {
      const src = await readFile(new URL('../src/shell/Transport.jsx', import.meta.url), 'utf8');
      assert.ok(src.includes('MELODY_VOICE_OPTIONS'));
      for (const [, label] of MELODY_VOICE_OPTIONS) {
        assert.ok(label.length > 0, 'every voice has a label');
      }
      for (const phrase of [
        'Sound settings',
        'Brightness',
        'Attack',
        'Release',
        'Room',
        'Chorus',
        'Envelope',
        'Rounded triangle',
        'Changing instruments never transposes the notation',
      ]) {
        assert.ok(src.includes(phrase), `missing ${phrase}`);
      }
    },
  },
  {
    name: 'tone UI: removes octave/register transposition from the neutral voice',
    async fn() {
      const src = await readFile(new URL('../src/shell/Transport.jsx', import.meta.url), 'utf8');
      assert.ok(!src.includes('sineOctave'));
      assert.ok(!src.includes('Higher (+1 octave)'));
      assert.ok(!src.includes('label="Register"'));
      assert.ok(src.includes("composition's written pitch and octave"));
    },
  },
  {
    name: 'tone UI: sampled instruments are local and harmonium layers are explicitly additive',
    async fn() {
      const src = await readFile(new URL('../src/shell/Transport.jsx', import.meta.url), 'utf8');
      assert.ok(src.includes('GeneralUser GS is bundled locally'));
      assert.ok(src.includes('Add upper-octave coupler'));
      assert.ok(src.includes('Add sub-octave layer'));
      assert.ok(src.includes('written pitch remains present'));
      assert.ok(!src.includes('loads the SoundFont online'));
    },
  },
];
