// src/shell/audio.js — M3 Wave B: sound (spec §6).
// Takes the pure event list from schedule.js and realizes it with the
// lookahead-scheduler pattern: a ~25ms timer schedules everything falling
// in the next ~100ms against the AudioContext clock. Audio starts
// synchronously inside the play gesture (the Bardic lesson: never start
// inside a .then()).
//
// Every browser surface is injected (env), so the driver logic runs — and
// is smoked — in bare node with a fake clock and a recording context.

import { renderPluck, renderTanpuraPluck, renderTick } from './dsp.js';
import {
  GHE_ROUND_ROBIN,
  TABLA_SAMPLE_URLS,
  tablaVoicesForTick,
} from './tabla.js';
import { createGeneralUserSoundfont } from './soundfont.js';
import {
  isSoundfontVoice,
  MELODY_VOICES,
  normalizeMelodyVoice,
} from './voices.js';
import {
  brightnessCutoff,
  normalizeToneMap,
  normalizeToneSettings,
  toneAttackSeconds,
  toneReleaseSeconds,
  toneVelocity,
} from './tone.js';

const LOOKAHEAD_S = 0.3; // AudioWorklet commands need comfortable lead time
const SOUNDFONT_START_LEAD_S = 0.06; // first sampled note is queued before it is due
const TICK_MS = 25; // driver timer period
const noop = () => {};

export { MELODY_VOICES } from './voices.js';
export const DRONE_MODES = Object.freeze(['off', 'sa-pa', 'sa-ma']);

const clampGain = (value, fallback = 1) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
};

/** Decode with both the promise and callback forms used across browsers. */
function decodeAudioData(context, arrayBuffer) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err || new Error('Could not decode tabla sample'));
    };

    try {
      const result = context.decodeAudioData(arrayBuffer, done, fail);
      if (result && typeof result.then === 'function') result.then(done, fail);
    } catch (err) {
      fail(err);
    }
  });
}

/**
 * @param {{
 *   createContext: () => AudioContext-like,
 *   fetchArrayBuffer?: (url: string) => Promise<ArrayBuffer>,
 *   setInterval?: Function, clearInterval?: Function,
 *   setTimeout?: Function, clearTimeout?: Function,
 * }} env
 */
export function createPlayer(env) {
  const setI = env.setInterval || ((fn, ms) => setInterval(fn, ms));
  const clearI = env.clearInterval || ((id) => clearInterval(id));
  const setT = env.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const clearT = env.clearTimeout || ((id) => clearTimeout(id));

  let ctx = null;
  let schedule = null;
  let timer = null;
  let playing = false;
  // Transport position is kept in schedule-time: startedAt is the ctx.time
  // matching schedule-time `offset`.
  let startedAt = 0;
  let offset = 0;
  let nextIndex = 0;
  let loop = null; // {from, to} in schedule seconds, or null
  // Quieter defaults keep notation playback in the same useful range as
  // class recordings. App.jsx restores each user's saved preferences.
  const gains = { melody: 0.4, tick: 0.25, drone: 0.16 };
  const muted = { melody: false, tick: false, drone: false };
  let talaSound = 'click'; // click | tabla | off
  let melodyVoice = 'pluck';
  let droneMode = 'off'; // off | sa-pa | sa-ma
  let onCursor = noop;
  let onStop = noop;
  const cursorTimers = new Set();
  let masterGains = null;
  let mixBus = null;
  let melodyFilter = null;
  let melodyRoomGain = null;
  let toneByVoice = normalizeToneMap(null);
  let soundfont = null;

  // Tabla samples are loaded once, decoded into the current AudioContext,
  // and retained for the life of the player. If they are not ready for an
  // early beat, that beat safely falls back to the synthesized click.
  const tablaBuffers = new Map();
  let tablaLoadPromise = null;
  let tablaLoadError = null;
  let gheIndex = 0;

  // The tanpura support is intentionally independent of tala and tempo: a
  // slow four-string cycle keeps ringing while the notation transport runs.
  let nextDroneAt = null;
  let droneStep = 0;

  function currentTone() {
    return toneByVoice[melodyVoice] || toneByVoice.pluck;
  }

  function roomImpulse() {
    if (!ctx?.createBuffer) return null;
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.max(1, Math.round(sampleRate * 0.48));
    const buffer = ctx.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let seed = 0x9e3779b9 + channel * 104729;
      for (let i = 0; i < length; i++) {
        seed = (Math.imul(seed ^ (seed >>> 15), 2246822519) + 3266489917) | 0;
        const noise = ((seed >>> 0) / 4294967296) * 2 - 1;
        const t = i / sampleRate;
        data[i] = noise * Math.exp(-8.5 * t) * (0.68 - channel * 0.04);
      }
    }
    return buffer;
  }

  function applyToneBus() {
    if (!ctx) return;
    const tone = currentTone();
    if (melodyFilter?.frequency) {
      const cutoff = brightnessCutoff(tone.brightness);
      if (melodyFilter.frequency.setTargetAtTime) {
        melodyFilter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.025);
      } else {
        melodyFilter.frequency.value = cutoff;
      }
    }
    if (melodyRoomGain?.gain) {
      // Sampled voices use SpessaSynth's MIDI reverb send. Avoid doubling
      // them through Sargam's tiny local room.
      const wet = isSoundfontVoice(melodyVoice) ? 0 : tone.reverb * 0.34;
      if (melodyRoomGain.gain.setTargetAtTime) {
        melodyRoomGain.gain.setTargetAtTime(wet, ctx.currentTime, 0.025);
      } else {
        melodyRoomGain.gain.value = wet;
      }
    }
    if (soundfont && isSoundfontVoice(melodyVoice)) {
      soundfont.setSettings(melodyVoice, toneByVoice[melodyVoice]);
    }
  }

  function ensureCtx() {
    if (!ctx) {
      ctx = env.createContext();
      mixBus = ctx.destination;
      if (typeof ctx.createDynamicsCompressor === 'function') {
        const limiter = ctx.createDynamicsCompressor();
        if (limiter.threshold) limiter.threshold.value = -10;
        if (limiter.knee) limiter.knee.value = 18;
        if (limiter.ratio) limiter.ratio.value = 5;
        if (limiter.attack) limiter.attack.value = 0.004;
        if (limiter.release) limiter.release.value = 0.16;
        limiter.connect(ctx.destination);
        mixBus = limiter;
      }
      masterGains = {
        melody: ctx.createGain(),
        tick: ctx.createGain(),
        drone: ctx.createGain(),
      };

      // A real low-pass filter gives every voice an audible Brightness
      // control. A short generated room is used for the local synthesized
      // voices; no fixed resonant pitches are introduced.
      if (typeof ctx.createBiquadFilter === 'function') {
        melodyFilter = ctx.createBiquadFilter();
        melodyFilter.type = 'lowpass';
        if (melodyFilter.Q) melodyFilter.Q.value = 0.35;
        masterGains.melody.connect(melodyFilter);
        melodyFilter.connect(mixBus);
      } else {
        masterGains.melody.connect(mixBus);
      }

      if (typeof ctx.createConvolver === 'function') {
        const convolver = ctx.createConvolver();
        const impulse = roomImpulse();
        if (impulse) convolver.buffer = impulse;
        melodyRoomGain = ctx.createGain();
        masterGains.melody.connect(convolver);
        convolver.connect(melodyRoomGain);
        melodyRoomGain.connect(mixBus);
      }

      masterGains.tick.connect(mixBus);
      masterGains.drone.connect(mixBus);
      for (const k of Object.keys(masterGains)) applyGain(k);
      applyToneBus();
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); // not awaited — Bardic
    return ctx;
  }

  function applyGain(track) {
    if (!masterGains || !masterGains[track]) return;
    masterGains[track].gain.value = muted[track] ? 0 : gains[track];
  }

  function ensureSoundfontAdapter() {
    ensureCtx();
    if (!soundfont) {
      soundfont = createGeneralUserSoundfont({
        context: ctx,
        destination: masterGains.melody,
        fetchArrayBuffer: env.fetchArrayBuffer,
      });
      if (isSoundfontVoice(melodyVoice)) soundfont.setVoice(melodyVoice);
      for (const voice of MELODY_VOICES) {
        if (isSoundfontVoice(voice)) soundfont.setSettings(voice, toneByVoice[voice]);
      }
    }
    return soundfont;
  }

  async function prepareSoundfont() {
    const adapter = ensureSoundfontAdapter();
    if (isSoundfontVoice(melodyVoice)) adapter.setVoice(melodyVoice);
    return adapter.prepare();
  }

  async function prepareTabla() {
    ensureCtx();
    if (tablaBuffers.size === Object.keys(TABLA_SAMPLE_URLS).length) return true;
    if (tablaLoadPromise) return tablaLoadPromise;
    if (typeof env.fetchArrayBuffer !== 'function' || typeof ctx.decodeAudioData !== 'function') {
      tablaLoadError = new Error('This browser cannot load the tabla sample library.');
      return false;
    }

    tablaLoadPromise = Promise.all(
      Object.entries(TABLA_SAMPLE_URLS).map(async ([id, url]) => {
        const bytes = await env.fetchArrayBuffer(url);
        const buffer = await decodeAudioData(ctx, bytes);
        tablaBuffers.set(id, buffer);
      })
    )
      .then(() => {
        tablaLoadError = null;
        return true;
      })
      .catch((err) => {
        tablaLoadError = err;
        tablaLoadPromise = null; // a later user gesture may retry
        return false;
      });

    return tablaLoadPromise;
  }

  function nextGhe() {
    const id = GHE_ROUND_ROBIN[gheIndex % GHE_ROUND_ROBIN.length];
    gheIndex++;
    return id;
  }

  function schedTime(ev) {
    return startedAt + (ev.t - offset);
  }

  function clearCursorTimers() {
    for (const id of cursorTimers) clearT(id);
    cursorTimers.clear();
  }

  // Cursor events are discovered during lookahead, but the screen must move
  // at the event's AudioContext time rather than up to LOOKAHEAD_S early.
  function dispatchCursorAt(ev, at) {
    const delayMs = Math.max(0, (at - ctx.currentTime) * 1000);
    if (delayMs <= 2) {
      if (playing) onCursor(ev, at);
      return;
    }
    const id = setT(() => {
      cursorTimers.delete(id);
      if (playing) onCursor(ev, at);
    }, delayMs);
    cursorTimers.add(id);
  }

  // ---- melody voices ----

  const PLUCK_S = 2.5; // rendered ring length; note-off is the gain fade
  const TANPURA_S = 4.8;
  const pluckCache = new Map();
  const tanpuraCache = new Map();
  const tickCache = new Map();

  function audioBuffer(data) {
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate || 44100);
    buf.copyToChannel ? buf.copyToChannel(data, 0) : buf.getChannelData(0).set(data);
    return buf;
  }

  function pluckBuffer(freq, tone) {
    const brightness = Math.round(tone.brightness * 100);
    const key = `${Math.round(freq * 10)}:${brightness}`;
    let buf = pluckCache.get(key);
    if (!buf) {
      buf = audioBuffer(
        renderPluck({
          freq,
          dur: PLUCK_S,
          sampleRate: ctx.sampleRate || 44100,
          bright: 0.14 + tone.brightness * 0.72,
        })
      );
      pluckCache.set(key, buf);
    }
    return buf;
  }


  function tanpuraBuffer(freq, variant) {
    const v = Math.abs(variant) % 4;
    const key = `${Math.round(freq * 10)}:${v}`;
    let buf = tanpuraCache.get(key);
    if (!buf) {
      buf = audioBuffer(
        renderTanpuraPluck({
          freq,
          dur: TANPURA_S,
          sampleRate: ctx.sampleRate || 44100,
          variant: v,
        })
      );
      tanpuraCache.set(key, buf);
    }
    return buf;
  }

  function bendBufferSource(src, ev, at, dur) {
    if (!ev.glideFrom || !src.playbackRate) return;
    const ratio = ev.glideFrom / ev.freq;
    src.playbackRate.setValueAtTime(ratio, at);
    src.playbackRate.setTargetAtTime(1, at, Math.min(0.16, dur * 0.45));
  }

  function playBufferNote(ev, at, buffer, tone, { baseLevel = 0.9 } = {}) {
    if (!ctx.createBufferSource) return false;
    const g = ctx.createGain();
    g.connect(masterGains.melody);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(g);
    const dur = Math.max(0.03, ev.dur);
    const attack = Math.min(dur * 0.42, toneAttackSeconds(tone.attack));
    const release = toneReleaseSeconds(tone.release);
    const level = baseLevel * toneVelocity(tone.velocity, ev.grace);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + attack);
    g.gain.setValueAtTime(level, at + Math.max(attack, dur - 0.025));
    g.gain.setTargetAtTime(0.0001, at + dur, release);
    bendBufferSource(src, ev, at, dur);
    src.start(at);
    src.stop(at + dur + Math.max(0.42, release * 7));
    return true;
  }

  function playCurrentPluck(ev, at) {
    if (!ctx.createBuffer || !ctx.createBufferSource) return playNeutralTone(ev, at);
    const tone = toneByVoice.pluck;
    return playBufferNote(ev, at, pluckBuffer(ev.freq, tone), tone, { baseLevel: 0.92 });
  }


  function setOscPitch(osc, target, from, at, dur) {
    if (!osc.frequency) return;
    osc.frequency.setValueAtTime(from || target, at);
    if (from) osc.frequency.setTargetAtTime(target, at, Math.min(0.16, dur * 0.45));
  }

  function playNeutralTone(ev, at) {
    if (typeof ctx.createOscillator !== 'function') return false;
    const tone = toneByVoice.neutral;
    const g = ctx.createGain();
    g.connect(masterGains.melody);
    const osc = ctx.createOscillator();
    osc.type = tone.neutralWaveform === 'triangle' ? 'triangle' : 'sine';
    osc.connect(g);

    const dur = Math.max(0.03, ev.dur);
    const release = toneReleaseSeconds(tone.release);
    const level = 0.5 * toneVelocity(tone.velocity, ev.grace);
    const targetFreq = ev.freq;
    const startFreq = ev.glideFrom || null;
    const envelope = tone.neutralEnvelope || 'soft';

    g.gain.setValueAtTime(0.0001, at);
    if (envelope === 'bell') {
      const attack = Math.min(0.018, Math.max(0.004, dur * 0.08));
      const decay = 0.08 + dur * 0.34 + release * 0.45;
      g.gain.linearRampToValueAtTime(level, at + attack);
      g.gain.setTargetAtTime(0.0001, at + attack, decay);
    } else if (envelope === 'pluck') {
      const attack = Math.min(0.009, Math.max(0.002, dur * 0.04));
      const decay = 0.035 + release * 0.22;
      g.gain.linearRampToValueAtTime(level, at + attack);
      g.gain.setTargetAtTime(0.0001, at + attack, decay);
    } else {
      const attackScale = envelope === 'sustain' ? 0.72 : 1;
      const attack = Math.min(
        dur * 0.42,
        toneAttackSeconds(tone.attack) * attackScale
      );
      const releaseScale = envelope === 'sustain' ? 1.45 : 1;
      g.gain.linearRampToValueAtTime(level, at + attack);
      g.gain.setValueAtTime(level, at + Math.max(attack, dur - 0.025));
      g.gain.setTargetAtTime(0.0001, at + dur, release * releaseScale);
    }

    setOscPitch(osc, targetFreq, startFreq, at, dur);
    osc.start(at);
    osc.stop(at + dur + Math.max(0.28, release * 8));
    return true;
  }

  function playSoundfontVoice(ev, at) {
    const adapter = ensureSoundfontAdapter();
    adapter.setVoice(melodyVoice);
    if (adapter.ready) {
      return adapter.play(ev, at, melodyVoice, toneByVoice[melodyVoice]);
    }
    // Loading is lazy and may take a moment on first use. Keep playback
    // audible with the reliable pluck until the local SoundFont is ready.
    void adapter.prepare();
    return playCurrentPluck(ev, at);
  }

  function playNote(ev, at) {
    if (melodyVoice === 'neutral') return playNeutralTone(ev, at);
    if (isSoundfontVoice(melodyVoice)) return playSoundfontVoice(ev, at);
    return playCurrentPluck(ev, at);
  }

  // ---- tanpura support ----

  const DRONE_STEP_S = 0.72;

  function droneSequence() {
    const sa = Number(schedule?.saFreq) || 130.81278265;
    const upperSa = sa;
    const lowSa = sa / 2;
    const lead = droneMode === 'sa-ma' ? sa * 2 ** (5 / 12) : sa * 2 ** (7 / 12);
    return [lead, lowSa, upperSa, upperSa];
  }

  function playDronePluck(freq, at, variant) {
    if (!ctx.createBuffer || !ctx.createBufferSource) return false;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = tanpuraBuffer(freq, variant);
    src.connect(g);
    g.connect(masterGains.drone);
    g.gain.setValueAtTime(variant === 0 ? 0.7 : 0.56, at);
    g.gain.setTargetAtTime(0.0001, at + 3.7, 0.28);
    src.start(at);
    src.stop(at + TANPURA_S + 0.1);
    return true;
  }

  function pumpDrone(horizon) {
    if (droneMode === 'off' || !schedule) return;
    if (nextDroneAt === null) nextDroneAt = ctx.currentTime;
    const pitches = droneSequence();
    while (nextDroneAt <= horizon) {
      const step = droneStep % pitches.length;
      playDronePluck(pitches[step], Math.max(nextDroneAt, ctx.currentTime), step);
      droneStep++;
      nextDroneAt += DRONE_STEP_S;
    }
  }

  function playClick(ev, at) {
    if (!ctx.createBuffer || !ctx.createBufferSource) return;
    let buf = tickCache.get(ev.accent);
    if (!buf) {
      const data = renderTick(ev.accent, ctx.sampleRate || 44100);
      buf = ctx.createBuffer(1, data.length, ctx.sampleRate || 44100);
      buf.copyToChannel ? buf.copyToChannel(data, 0) : buf.getChannelData(0).set(data);
      tickCache.set(ev.accent, buf);
    }
    const g = ctx.createGain();
    g.connect(masterGains.tick);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(g);
    g.gain.setValueAtTime(1, at);
    src.start(at);
  }

  function playTablaVoice(voice, at) {
    const buffer = tablaBuffers.get(voice.sample);
    if (!buffer || !ctx.createBufferSource) return false;
    const g = ctx.createGain();
    g.connect(masterGains.tick);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(g);
    g.gain.setValueAtTime(clampGain(voice.gain, 0.75), at);
    src.start(at);
    if (src.stop && Number.isFinite(buffer.duration)) src.stop(at + buffer.duration + 0.02);
    return true;
  }

  function playTick(ev, at) {
    if (talaSound === 'off') return;

    if (talaSound === 'tabla') {
      const voices = tablaVoicesForTick(ev, nextGhe);
      if (voices) {
        const ready = voices.every((voice) => tablaBuffers.has(voice.sample));
        if (ready) {
          voices.forEach((voice) => playTablaVoice(voice, at));
          return;
        }
        // Loading begins on the selector gesture or first Play. Keep the
        // rhythm audible while it finishes rather than dropping beats.
        if (!tablaLoadPromise) void prepareTabla();
      }
    }

    playClick(ev, at);
  }

  // ---- the lookahead driver ----

  function pump() {
    if (!playing) return;
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    pumpDrone(horizon);
    const evs = schedule.events;
    while (nextIndex < evs.length && schedTime(evs[nextIndex]) <= horizon) {
      const ev = evs[nextIndex];
      const at = Math.max(schedTime(ev), ctx.currentTime);
      if (loop && ev.t >= loop.to) break; // handled by the loop wrap below
      if (ev.kind === 'note') playNote(ev, at);
      else if (ev.kind === 'tick') playTick(ev, at);
      else if (ev.kind === 'cursor') dispatchCursorAt(ev, at);
      nextIndex++;
    }

    const endT = loop ? loop.to : schedule.duration;
    const now = ctx.currentTime;
    if (now >= startedAt + (endT - offset)) {
      if (loop) {
        clearCursorTimers();
        // wrap: rebase the clock at the loop head, seek the event index
        startedAt = startedAt + (endT - offset - (loop.from - offset)) + 0;
        startedAt = now; // rebase precisely at wrap detection
        offset = loop.from;
        nextIndex = seekIndex(loop.from);
      } else {
        stop();
        onStop();
      }
    }
  }

  function seekIndex(t) {
    const evs = schedule.events;
    let i = 0;
    while (i < evs.length && evs[i].t < t - 1e-9) i++;
    return i;
  }

  function stop() {
    playing = false;
    if (timer !== null) {
      clearI(timer);
      timer = null;
    }
    if (soundfont) soundfont.stopAll(true);
    clearCursorTimers();
    offset = 0;
    nextIndex = 0;
    nextDroneAt = null;
    droneStep = 0;
  }

  return {
    load(sched) {
      schedule = sched;
      stop();
    },
    /** Synchronous on the gesture. from = schedule seconds. */
    play({ from = null } = {}) {
      if (!schedule) return false;
      ensureCtx();
      if (talaSound === 'tabla') void prepareTabla();
      if (isSoundfontVoice(melodyVoice)) void prepareSoundfont();
      if (from !== null) offset = from;
      clearCursorTimers();
      const startLead =
        isSoundfontVoice(melodyVoice) && soundfont?.ready
          ? SOUNDFONT_START_LEAD_S
          : 0;
      startedAt = ctx.currentTime + startLead;
      nextIndex = seekIndex(offset);
      nextDroneAt = startedAt;
      droneStep = 0;
      playing = true;
      if (timer === null) timer = setI(pump, TICK_MS);
      pump(); // schedule the first horizon immediately, inside the gesture
      return true;
    },
    pause() {
      if (!playing) return;
      offset = Math.max(offset, offset + (ctx.currentTime - startedAt));
      playing = false;
      if (soundfont) soundfont.stopAll(true);
      clearCursorTimers();
      nextDroneAt = null;
      droneStep = 0;
      if (timer !== null) {
        clearI(timer);
        timer = null;
      }
    },
    stop() {
      stop();
    },
    setLoop(range) {
      loop = range; // {from, to} | null
      if (playing && loop && (offset < loop.from || offset >= loop.to)) {
        clearCursorTimers();
        offset = loop.from;
        const startLead =
          isSoundfontVoice(melodyVoice) && soundfont?.ready
            ? SOUNDFONT_START_LEAD_S
            : 0;
        startedAt = ctx.currentTime + startLead;
        nextIndex = seekIndex(loop.from);
      }
    },
    setGain(track, value) {
      if (!(track in gains)) return;
      gains[track] = clampGain(value, gains[track]);
      applyGain(track);
    },
    setMuted(track, value) {
      if (!(track in muted)) return;
      muted[track] = Boolean(value);
      applyGain(track);
    },
    setTalaSound(mode) {
      talaSound = ['click', 'tabla', 'off'].includes(mode) ? mode : 'click';
    },
    setMelodyVoice(mode) {
      melodyVoice = normalizeMelodyVoice(mode);
      if (soundfont && isSoundfontVoice(melodyVoice)) soundfont.setVoice(melodyVoice);
      applyToneBus();
    },
    setToneSettings(voice, settings) {
      const mode = normalizeMelodyVoice(voice);
      toneByVoice = {
        ...toneByVoice,
        [mode]: normalizeToneSettings(settings, mode),
      };
      if (soundfont && isSoundfontVoice(mode)) {
        soundfont.setSettings(mode, toneByVoice[mode]);
      }
      if (mode === melodyVoice) applyToneBus();
    },
    setDroneMode(mode) {
      droneMode = DRONE_MODES.includes(mode) ? mode : 'off';
      nextDroneAt = playing && droneMode !== 'off' && ctx ? ctx.currentTime : null;
      droneStep = 0;
    },
    prepareTalaSound() {
      return talaSound === 'tabla' ? prepareTabla() : Promise.resolve(true);
    },
    prepareMelodyVoice() {
      return isSoundfontVoice(melodyVoice) ? prepareSoundfont() : Promise.resolve(true);
    },
    onCursor(cb) {
      onCursor = cb || noop;
    },
    onEnded(cb) {
      onStop = cb || noop;
    },
    get playing() {
      return playing;
    },
    get position() {
      if (!ctx) return offset;
      return playing
        ? Math.max(offset, offset + (ctx.currentTime - startedAt))
        : offset;
    },
    get talaSound() {
      return talaSound;
    },
    get melodyVoice() {
      return melodyVoice;
    },
    get droneMode() {
      return droneMode;
    },
    get toneSettings() {
      return normalizeToneMap(toneByVoice);
    },
    get soundfontReady() {
      return Boolean(soundfont?.ready);
    },
    get soundfontError() {
      return soundfont?.error || null;
    },
    // Compatibility aliases for the first sampled-harmonium prototype.
    get harmoniumReady() {
      return Boolean(soundfont?.ready);
    },
    get harmoniumError() {
      return soundfont?.error || null;
    },
    get tablaReady() {
      return tablaBuffers.size === Object.keys(TABLA_SAMPLE_URLS).length;
    },
    get tablaError() {
      return tablaLoadError;
    },
    get gains() {
      return { ...gains };
    },
  };
}
