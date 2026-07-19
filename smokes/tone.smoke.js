// tone.smoke.js — pure tone settings and the isolated SoundFont adapter.
import assert from 'node:assert/strict';
import {
  DEFAULT_TONE_BY_VOICE,
  brightnessCutoff,
  normalizeToneMap,
  normalizeToneSettings,
  toneAttackSeconds,
  toneReleaseSeconds,
  toneVelocity,
  updateToneMap,
} from '../src/shell/tone.js';
import {
  bendValue,
  createHarmoniumSoundfont,
  frequencyToMidi,
} from '../src/shell/soundfont.js';

export const smokes = [
  {
    name: 'tone: every melody voice receives independent bounded defaults',
    fn() {
      const tones = normalizeToneMap(null);
      assert.deepEqual(Object.keys(tones).sort(), Object.keys(DEFAULT_TONE_BY_VOICE).sort());
      tones.pluck.velocity = 0;
      assert.notEqual(tones.practice.velocity, 0, 'voices do not share one settings object');
      const odd = normalizeToneSettings(
        { velocity: 9, brightness: -2, attack: 'bad', coupler: 1 },
        'harmonium'
      );
      assert.equal(odd.velocity, 1);
      assert.equal(odd.brightness, 0);
      assert.equal(odd.attack, DEFAULT_TONE_BY_VOICE.harmonium.attack);
      assert.equal(odd.coupler, true);
    },
  },
  {
    name: 'tone: one voice can be edited without changing the others',
    fn() {
      const before = normalizeToneMap(null);
      const after = updateToneMap(before, 'harmonium', {
        brightness: 0.2,
        coupler: true,
      });
      assert.equal(after.harmonium.brightness, 0.2);
      assert.equal(after.harmonium.coupler, true);
      assert.deepEqual(after.pluck, before.pluck);
    },
  },
  {
    name: 'tone: control curves remain useful and bounded',
    fn() {
      assert.ok(toneAttackSeconds(0) < toneAttackSeconds(1));
      assert.ok(toneReleaseSeconds(0) < toneReleaseSeconds(1));
      assert.ok(toneVelocity(0) < toneVelocity(1));
      assert.ok(toneVelocity(1, true) < toneVelocity(1, false));
      assert.ok(brightnessCutoff(0) >= 700);
      assert.ok(brightnessCutoff(1) <= 11900);
    },
  },
  {
    name: 'soundfont: frequencies map to MIDI notes plus a precise bend',
    fn() {
      assert.deepEqual(frequencyToMidi(440), {
        midi: 69,
        midiFloat: 69,
        bendSemitones: 0,
      });
      assert.equal(frequencyToMidi(220).midi, 57);
      assert.equal(bendValue(0), 8192);
      assert.ok(bendValue(0.5) > 8192);
      assert.equal(bendValue(99), 16383);
    },
  },
  {
    name: 'soundfont: adapter loads once and schedules harmonium notes exactly',
    async fn() {
      const calls = [];
      class FakeSynth {
        constructor(context) {
          calls.push(['construct', context]);
          this.soundBankManager = {
            addSoundBank: async (bank, id) => calls.push(['bank', bank.byteLength, id]),
          };
          this.isReady = Promise.resolve();
        }
        connect(node) { calls.push(['connect', node]); }
        setLogLevel(...args) { calls.push(['logs', ...args]); }
        programChange(...args) { calls.push(['program', ...args]); }
        pitchWheelRange(...args) { calls.push(['range', ...args]); }
        controllerChange(...args) { calls.push(['cc', ...args]); }
        pitchWheel(...args) { calls.push(['bend', ...args]); }
        noteOn(...args) { calls.push(['on', ...args]); }
        noteOff(...args) { calls.push(['off', ...args]); }
        stopAll(...args) { calls.push(['stopAll', ...args]); }
      }

      const context = {
        audioWorklet: {
          async addModule(url) { calls.push(['worklet', url]); },
        },
      };
      const adapter = createHarmoniumSoundfont({
        context,
        destination: { name: 'melody' },
        importModule: async () => ({ WorkletSynthesizer: FakeSynth }),
        fetchText: async () => 'registerProcessor("fake", class {});',
        fetchArrayBuffer: async () => new ArrayBuffer(12),
        createObjectURL: () => 'blob:test-worklet',
        revokeObjectURL: (url) => calls.push(['revoke', url]),
      });

      assert.equal(await adapter.prepare(), true);
      assert.equal(await adapter.prepare(), true, 'second preparation reuses the synth');
      assert.equal(adapter.ready, true);
      adapter.play(
        { freq: 440, glideFrom: 415.3046976, dur: 0.5, grace: false },
        2,
        { velocity: 0.5, coupler: true, subOctave: true }
      );

      const noteOns = calls.filter((c) => c[0] === 'on');
      const noteOffs = calls.filter((c) => c[0] === 'off');
      assert.equal(noteOns.length, 3, 'main, upper coupler and sub-octave sound');
      assert.equal(noteOffs.length, 3);
      assert.ok(noteOns.every((c) => c[4]?.time === 2), 'note-ons retain scheduler time');
      assert.ok(noteOffs.every((c) => c[3]?.time === 2.5), 'note-offs retain duration');
      assert.ok(calls.some((c) => c[0] === 'bend' && c[3]?.time === 2), 'meend begins on time');
      assert.equal(calls.filter((c) => c[0] === 'construct').length, 1);
    },
  },
  {
    name: 'soundfont: unsupported browsers fail cleanly for pluck fallback',
    async fn() {
      const adapter = createHarmoniumSoundfont({ context: {}, destination: {} });
      assert.equal(await adapter.prepare(), false);
      assert.match(adapter.error.message, /AudioWorklet/);
      assert.equal(adapter.play({ freq: 440, dur: 1 }, 0), false);
    },
  },
];
