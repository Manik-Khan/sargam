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
  createGeneralUserSoundfont,
  frequencyToMidi,
} from '../src/shell/soundfont.js';
import {
  MELODY_VOICES,
  MELODY_VOICE_DEFS,
  SOUNDFONT_VOICES,
  normalizeMelodyVoice,
} from '../src/shell/voices.js';

export const smokes = [
  {
    name: 'tone: every melody voice receives independent bounded defaults',
    fn() {
      const tones = normalizeToneMap(null);
      assert.deepEqual(Object.keys(tones), MELODY_VOICES);
      assert.deepEqual(Object.keys(tones), Object.keys(DEFAULT_TONE_BY_VOICE));
      tones.pluck.velocity = 0;
      assert.notEqual(tones.violin.velocity, 0, 'voices do not share one settings object');
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
    name: 'tone: neutral envelope and waveform validate without any octave transposition',
    fn() {
      const neutral = normalizeToneSettings(
        {
          sineOctave: 2,
          sineEnvelope: 'bell',
          sineWaveform: 'triangle',
        },
        'sine'
      );
      assert.equal(neutral.neutralEnvelope, 'bell');
      assert.equal(neutral.neutralWaveform, 'triangle');
      assert.equal('sineOctave' in neutral, false);
      assert.equal('neutralOctave' in neutral, false);
      const fallback = normalizeToneSettings(
        { neutralEnvelope: 'bad', neutralWaveform: 'square' },
        'neutral'
      );
      assert.equal(fallback.neutralEnvelope, 'soft');
      assert.equal(fallback.neutralWaveform, 'triangle');
      assert.equal(normalizeMelodyVoice('sine'), 'neutral');
      assert.equal(normalizeMelodyVoice('practice'), 'pluck');
    },
  },
  {
    name: 'tone: one voice can be edited without changing the others',
    fn() {
      const before = normalizeToneMap(null);
      const after = updateToneMap(before, 'violin', {
        brightness: 0.2,
        chorus: 0.4,
      });
      assert.equal(after.violin.brightness, 0.2);
      assert.equal(after.violin.chorus, 0.4);
      assert.deepEqual(after.pluck, before.pluck);
      assert.deepEqual(after.cello, before.cello);
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
    name: 'soundfont: every requested frequency maps to concert pitch with no hidden transpose',
    fn() {
      assert.deepEqual(frequencyToMidi(440), {
        midi: 69,
        midiFloat: 69,
        bendSemitones: 0,
      });
      assert.deepEqual(frequencyToMidi(220), {
        midi: 57,
        midiFloat: 57,
        bendSemitones: 0,
      });
      assert.equal(bendValue(0), 8192);
      assert.ok(bendValue(0.5) > 8192);
      assert.equal(bendValue(99), 16383);
      for (const voice of SOUNDFONT_VOICES) {
        assert.equal(MELODY_VOICE_DEFS[voice].transpose, undefined);
        assert.equal(MELODY_VOICE_DEFS[voice].octave, undefined);
      }
    },
  },
  {
    name: 'soundfont: GeneralUser presets load once and all instruments schedule the exact MIDI pitch',
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
      const adapter = createGeneralUserSoundfont({
        context,
        destination: { name: 'melody' },
        WorkletSynthesizerClass: FakeSynth,
        processorUrl: '/vendor/spessasynth/test-processor.js',
        soundfontUrl: '/audio/soundfonts/generaluser/test.sf2',
        fetchArrayBuffer: async (url) => {
          calls.push(['fetch', url]);
          return new ArrayBuffer(12);
        },
      });

      assert.equal(await adapter.prepare(), true);
      assert.equal(await adapter.prepare(), true, 'second preparation reuses the synth');
      assert.equal(adapter.ready, true);

      let at = 2;
      for (const voice of SOUNDFONT_VOICES) {
        calls.length = 0;
        adapter.setVoice(voice);
        const def = MELODY_VOICE_DEFS[voice];
        assert.ok(
          calls.some((c) => c[0] === 'program' && c[2] === def.program),
          `${voice} selects program ${def.program}`
        );

        calls.length = 0;
        adapter.play(
          { freq: 440, glideFrom: null, dur: 0.5, grace: false },
          at,
          voice,
          { velocity: 0.5 }
        );
        const noteOns = calls.filter((c) => c[0] === 'on');
        assert.equal(noteOns.length, 1, `${voice} has one untransposed fundamental`);
        assert.equal(noteOns[0][2], 69, `${voice} plays A4 as MIDI 69`);
        assert.equal(noteOns[0][4]?.time, at);
        assert.equal(
          calls.filter((c) => c[0] === 'cc').length,
          0,
          `${voice} does not flood the worklet with per-note controller setup`
        );
        const center = calls.find((c) => c[0] === 'bend' && c[2] === 8192);
        assert.ok(center, `${voice} is centered at concert pitch`);
        assert.ok(center[3]?.time < at, `${voice} pitch is prepared before note-on`);
        assert.ok(at - center[3].time <= 0.041);
        at += 1;
      }

      calls.length = 0;
      adapter.setVoice('harmonium');
      adapter.play(
        { freq: 440, glideFrom: 415.3046976, dur: 0.5, grace: false },
        20,
        'harmonium',
        { velocity: 0.5, coupler: true, subOctave: true }
      );
      assert.deepEqual(
        calls.filter((c) => c[0] === 'on').map((c) => c[2]).sort((a, b) => a - b),
        [57, 69, 81],
        'optional harmonium layers surround but do not replace the written pitch'
      );
      assert.ok(calls.some((c) => c[0] === 'bend' && c[3]?.time < 20));
      assert.equal(calls.filter((c) => c[0] === 'construct').length, 0);
    },
  },
  {
    name: 'soundfont: unsupported browsers fail cleanly for pluck fallback',
    async fn() {
      const adapter = createGeneralUserSoundfont({ context: {}, destination: {} });
      assert.equal(await adapter.prepare(), false);
      assert.match(adapter.error.message, /AudioWorklet/);
      assert.equal(adapter.play({ freq: 440, dur: 1 }, 0), false);
    },
  },
];
