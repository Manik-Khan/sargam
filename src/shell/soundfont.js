// src/shell/soundfont.js — SpessaSynth/GeneralUser GS adapter.
//
// SpessaSynth is the playback engine. GeneralUser GS supplies the sampled
// instrument presets. The bank is bundled locally under public/ so selected
// voices work without a network connection once Sargam itself is available.
//
// Pitch is non-negotiable: the scheduler supplies a concert-pitch frequency,
// and every preset receives the exact corresponding MIDI key plus pitch bend.
// There are no per-instrument transpositions or hidden octave changes.

import { WorkletSynthesizer } from 'spessasynth_lib';
import {
  clamp01,
  normalizeToneSettings,
  toneReleaseSeconds,
  toneVelocity,
} from './tone.js';
import {
  isSoundfontVoice,
  melodyVoiceDef,
  normalizeMelodyVoice,
  SOUNDFONT_VOICES,
} from './voices.js';

export const SPESSA_VERSION = '4.3.0';
export const SPESSA_PROCESSOR_URL =
  `${import.meta.env?.BASE_URL || '/'}vendor/spessasynth/spessasynth_processor.min.js`;
export const GENERALUSER_SOUNDFONT_URL =
  `${import.meta.env?.BASE_URL || '/'}audio/soundfonts/generaluser/GeneralUser-GS-v1.471.sf2`;

const CHANNELS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15]);
const PITCH_RANGE = 12;
const SETUP_LEAD_S = 0.04;

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
 *   soundfontUrl?: string,
 * }} env
 */
export function createGeneralUserSoundfont(env) {
  const context = env.context;
  const SynthClass = env.WorkletSynthesizerClass || WorkletSynthesizer;
  const processorUrl = env.processorUrl || SPESSA_PROCESSOR_URL;
  const soundfontUrl = env.soundfontUrl || GENERALUSER_SOUNDFONT_URL;

  let synth = null;
  let preparePromise = null;
  let error = null;
  let nextChannel = 0;
  let currentVoice = 'harmonium';
  const currentSettings = new Map();
  const channelVoice = new Map();

  for (const voice of SOUNDFONT_VOICES) {
    currentSettings.set(voice, normalizeToneSettings(null, voice));
  }

  function opts(at) {
    return Number.isFinite(at) ? { time: at } : undefined;
  }

  function setupTime(at) {
    const now = Number(context?.currentTime) || 0;
    return Math.max(now, Number(at) - SETUP_LEAD_S);
  }

  function controller(channel, number, value, at = null) {
    if (!synth) return;
    synth.controllerChange(channel, number, value, opts(at));
  }

  function applyPreset(channel, voice, at = null) {
    if (!synth) return;
    const mode = isSoundfontVoice(voice) ? normalizeMelodyVoice(voice) : 'harmonium';
    const preset = melodyVoiceDef(mode);
    controller(channel, 0, preset.bankMSB || 0, at);
    controller(channel, 32, preset.bankLSB || 0, at);
    synth.programChange(channel, preset.program, opts(at));
    channelVoice.set(channel, mode);
  }

  function applyChannelSettings(channel, voice, settings, at = null) {
    const mode = isSoundfontVoice(voice) ? normalizeMelodyVoice(voice) : 'harmonium';
    const s = normalizeToneSettings(settings, mode);
    controller(channel, 11, 127, at); // steady expression/bellows
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
      error = new Error('Sampled instruments require AudioWorklet and SoundFont loading.');
      return false;
    }

    preparePromise = (async () => {
      try {
        const soundBank = await env.fetchArrayBuffer(soundfontUrl);
        await context.audioWorklet.addModule(processorUrl);

        const next = new SynthClass(context);
        await next.soundBankManager.addSoundBank(soundBank, 'generaluser');
        await next.isReady;
        if (typeof next.setLogLevel === 'function') next.setLogLevel(false, false, false);
        next.connect(env.destination);

        synth = next;
        for (const channel of CHANNELS) {
          synth.pitchWheelRange(channel, PITCH_RANGE);
          applyPreset(channel, currentVoice);
          applyChannelSettings(
            channel,
            currentVoice,
            currentSettings.get(currentVoice)
          );
        }
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

  function scheduleBend(
    channel,
    fromSemitones,
    toSemitones,
    setupAt,
    noteAt,
    duration
  ) {
    if (!synth) return;
    // Establish the starting pitch before note-on. The moving bend begins at
    // the written note time, so setup latency cannot push the attack late.
    synth.pitchWheel(channel, bendValue(fromSemitones), opts(setupAt));
    const steps = Math.max(1, Math.min(8, Math.round(duration / 0.018)));
    for (let i = 1; i <= steps; i++) {
      const p = i / steps;
      const eased = 1 - Math.pow(1 - p, 2);
      const semis = fromSemitones + (toSemitones - fromSemitones) * eased;
      synth.pitchWheel(channel, bendValue(semis), opts(noteAt + duration * p));
    }
  }

  function play(ev, at, voice = currentVoice, settings = null) {
    if (!synth) return false;
    const mode = isSoundfontVoice(voice) ? normalizeMelodyVoice(voice) : currentVoice;
    const s = normalizeToneSettings(settings || currentSettings.get(mode), mode);
    const target = frequencyToMidi(ev.freq);
    const start = frequencyToMidi(ev.glideFrom || ev.freq);
    const channel = CHANNELS[nextChannel++ % CHANNELS.length];
    const duration = Math.max(0.035, Number(ev.dur) || 0.1);
    const glideDuration = ev.glideFrom ? Math.min(0.17, duration * 0.48) : 0;
    const startRelative = start.midiFloat - target.midi;
    const targetRelative = target.midiFloat - target.midi;
    const velocity = Math.max(
      1,
      Math.min(127, Math.round(toneVelocity(s.velocity, ev.grace) * 127))
    );

    const setupAt = setupTime(at);
    if (channelVoice.get(channel) !== mode) {
      applyPreset(channel, mode, setupAt);
      applyChannelSettings(channel, mode, s, setupAt);
    }
    // Settings are already applied to every channel by setVoice/setSettings.
    // Avoid re-sending six controller messages for every single note; that
    // message burst can make real-time worklet playback trail the scheduler.
    if (glideDuration > 0.005) {
      scheduleBend(
        channel,
        startRelative,
        targetRelative,
        setupAt,
        at,
        glideDuration
      );
    } else {
      synth.pitchWheel(channel, bendValue(targetRelative), opts(setupAt));
    }

    const notes = [target.midi];
    if (mode === 'harmonium' && s.coupler && inMidiRange(target.midi + 12)) {
      notes.push(target.midi + 12);
    }
    if (mode === 'harmonium' && s.subOctave && inMidiRange(target.midi - 12)) {
      notes.push(target.midi - 12);
    }
    for (const note of notes) synth.noteOn(channel, note, velocity, opts(at));
    for (const note of notes) synth.noteOff(channel, note, opts(at + duration));

    const resetAt = at + duration + toneReleaseSeconds(s.release) + 0.04;
    synth.pitchWheel(channel, 8192, opts(resetAt));
    return true;
  }

  function setVoice(voice) {
    if (!isSoundfontVoice(voice)) return;
    currentVoice = normalizeMelodyVoice(voice);
    if (!synth) return;
    for (const channel of CHANNELS) {
      applyPreset(channel, currentVoice);
      applyChannelSettings(
        channel,
        currentVoice,
        currentSettings.get(currentVoice)
      );
    }
  }

  function setSettings(voice, settings) {
    if (!isSoundfontVoice(voice)) return;
    const mode = normalizeMelodyVoice(voice);
    const normalized = normalizeToneSettings(settings, mode);
    currentSettings.set(mode, normalized);
    if (!synth || mode !== currentVoice) return;
    for (const channel of CHANNELS) applyChannelSettings(channel, mode, normalized);
  }

  function stopAll(force = true) {
    if (synth && typeof synth.stopAll === 'function') synth.stopAll(force);
  }

  function destroy() {
    if (synth && typeof synth.destroy === 'function') synth.destroy();
    synth = null;
    preparePromise = null;
    channelVoice.clear();
  }

  return {
    prepare,
    play,
    setVoice,
    setSettings,
    stopAll,
    destroy,
    get ready() {
      return Boolean(synth);
    },
    get error() {
      return error;
    },
    get voice() {
      return currentVoice;
    },
  };
}

// Temporary compatibility alias for callers/tests from the first prototype.
export const createHarmoniumSoundfont = createGeneralUserSoundfont;
