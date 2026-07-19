// src/shell/soundfont.js — SpessaSynth/SoundFont adapter.
//
// The library is bundled by Vite from npm. SpessaSynth's AudioWorklet
// processor is copied into public/vendor/spessasynth so the browser can load
// it as a normal same-origin asset. The harmonium SoundFont itself remains an
// online prototype until its redistribution provenance is confirmed.

import { WorkletSynthesizer } from 'spessasynth_lib';
import {
  clamp01,
  normalizeToneSettings,
  toneReleaseSeconds,
  toneVelocity,
} from './tone.js';

export const SPESSA_VERSION = '4.3.0';
export const SPESSA_PROCESSOR_URL =
  `${import.meta.env?.BASE_URL || '/'}vendor/spessasynth/spessasynth_processor.min.js`;
export const HARMONIUM_SF2_URL =
  'https://raw.githubusercontent.com/ledlaux/harmonium-companion/refs/heads/soundfont/harmonium.sf2';

const CHANNELS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]);
const PITCH_RANGE = 12;

export function frequencyToMidi(freq) {
  const f = Number(freq);
  if (!(f > 0)) return { midi: 69, midiFloat: 69, bendSemitones: 0 };
  const midiFloat = 69 + 12 * Math.log2(f / 440);
  const midi = Math.max(0, Math.min(127, Math.round(midiFloat)));
  return { midi, midiFloat, bendSemitones: midiFloat - midi };
}

export function bendValue(semitones, range = PITCH_RANGE) {
  const r = Math.max(0.01, Math.abs(Number(range) || PITCH_RANGE));
  const normalized = Math.max(-1, Math.min(1, Number(semitones || 0) / r));
  return Math.max(0, Math.min(16383, Math.round(8192 + normalized * 8192)));
}

function midiValue(value) {
  return Math.max(0, Math.min(127, Math.round(clamp01(value) * 127)));
}

function inMidiRange(note) {
  return note >= 0 && note <= 127;
}

/**
 * @param {{
 *   context: BaseAudioContext-like,
 *   destination: AudioNode-like,
 *   fetchArrayBuffer?: (url:string)=>Promise<ArrayBuffer>,
 *   WorkletSynthesizerClass?: typeof WorkletSynthesizer,
 *   processorUrl?: string,
 * }} env
 */
export function createHarmoniumSoundfont(env) {
  const context = env.context;
  const SynthClass = env.WorkletSynthesizerClass || WorkletSynthesizer;
  const processorUrl = env.processorUrl || SPESSA_PROCESSOR_URL;

  let synth = null;
  let preparePromise = null;
  let error = null;
  let nextChannel = 0;
  let currentSettings = normalizeToneSettings(null, 'harmonium');

  function controller(channel, number, value, at = null) {
    if (!synth) return;
    const opts = Number.isFinite(at) ? { time: at } : undefined;
    synth.controllerChange(channel, number, value, opts);
  }

  function applyChannelSettings(channel, settings, at = null) {
    const s = normalizeToneSettings(settings, 'harmonium');
    controller(channel, 11, 127, at); // steady bellows/expression
    controller(channel, 7, 112, at); // headroom; Sargam owns master volume
    controller(channel, 72, midiValue(s.release), at);
    controller(channel, 73, midiValue(s.attack), at);
    controller(channel, 74, midiValue(s.brightness), at);
    controller(channel, 91, midiValue(s.reverb), at);
    controller(channel, 93, midiValue(s.chorus), at);
  }

  async function prepare() {
    if (synth) return true;
    if (preparePromise) return preparePromise;
    if (
      !context?.audioWorklet?.addModule ||
      typeof env.fetchArrayBuffer !== 'function'
    ) {
      error = new Error('Sampled harmonium requires AudioWorklet and SoundFont loading.');
      return false;
    }

    preparePromise = (async () => {
      try {
        const soundBank = await env.fetchArrayBuffer(HARMONIUM_SF2_URL);
        await context.audioWorklet.addModule(processorUrl);

        const next = new SynthClass(context);
        await next.soundBankManager.addSoundBank(soundBank, 'main');
        await next.isReady;
        if (typeof next.setLogLevel === 'function') next.setLogLevel(false, false, false);
        next.connect(env.destination);

        for (const channel of CHANNELS) {
          next.programChange(channel, 0);
          next.pitchWheelRange(channel, PITCH_RANGE);
        }
        synth = next;
        for (const channel of CHANNELS) applyChannelSettings(channel, currentSettings);
        error = null;
        return true;
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        preparePromise = null;
        return false;
      }
    })();

    return preparePromise;
  }

  function scheduleBend(channel, fromSemitones, toSemitones, at, duration) {
    if (!synth) return;
    const opts = (time) => ({ time });
    synth.pitchWheel(channel, bendValue(fromSemitones), opts(at));
    const steps = Math.max(1, Math.min(8, Math.round(duration / 0.018)));
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const eased = 1 - Math.pow(1 - p, 2);
      const semis = fromSemitones + (toSemitones - fromSemitones) * eased;
      synth.pitchWheel(channel, bendValue(semis), opts(at + duration * p));
    }
  }

  function play(ev, at, settings = currentSettings) {
    if (!synth) return false;
    const s = normalizeToneSettings(settings, 'harmonium');
    const target = frequencyToMidi(ev.freq);
    const start = frequencyToMidi(ev.glideFrom || ev.freq);
    const channel = CHANNELS[nextChannel++ % CHANNELS.length];
    const duration = Math.max(0.035, Number(ev.dur) || 0.1);
    const glideDuration = ev.glideFrom ? Math.min(0.17, duration * 0.48) : 0;
    const startRelative = start.midiFloat - target.midi;
    const targetRelative = target.midiFloat - target.midi;
    const velocity = Math.max(1, Math.min(127, Math.round(toneVelocity(s.velocity, ev.grace) * 127)));

    applyChannelSettings(channel, s, at);
    if (glideDuration > 0.005) {
      scheduleBend(channel, startRelative, targetRelative, at, glideDuration);
    } else {
      synth.pitchWheel(channel, bendValue(targetRelative), { time: at });
    }

    const notes = [target.midi];
    if (s.coupler && inMidiRange(target.midi + 12)) notes.push(target.midi + 12);
    if (s.subOctave && inMidiRange(target.midi - 12)) notes.push(target.midi - 12);
    for (const note of notes) synth.noteOn(channel, note, velocity, { time: at });
    for (const note of notes) synth.noteOff(channel, note, { time: at + duration });

    const resetAt = at + duration + toneReleaseSeconds(s.release) + 0.04;
    synth.pitchWheel(channel, 8192, { time: resetAt });
    return true;
  }

  function setSettings(settings) {
    currentSettings = normalizeToneSettings(settings, 'harmonium');
    if (!synth) return;
    for (const channel of CHANNELS) applyChannelSettings(channel, currentSettings);
  }

  function stopAll(force = true) {
    if (synth && typeof synth.stopAll === 'function') synth.stopAll(force);
  }

  function destroy() {
    if (synth && typeof synth.destroy === 'function') synth.destroy();
    synth = null;
    preparePromise = null;
  }

  return {
    prepare,
    play,
    setSettings,
    stopAll,
    destroy,
    get ready() {
      return Boolean(synth);
    },
    get error() {
      return error;
    },
  };
}
