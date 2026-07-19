// src/shell/audio.js — M3 Wave B: sound (spec §6).
// Takes the pure event list from schedule.js and realizes it with the
// lookahead-scheduler pattern: a ~25ms timer schedules everything falling
// in the next ~100ms against the AudioContext clock. Audio starts
// synchronously inside the play gesture (the Bardic lesson: never start
// inside a .then()).
//
// Every browser surface is injected (env), so the driver logic runs — and
// is smoked — in bare node with a fake clock and a recording context.

import {
  renderPluck,
  renderPracticePluck,
  renderTanpuraPluck,
  renderTick,
} from './dsp.js';
import {
  GHE_ROUND_ROBIN,
  TABLA_SAMPLE_URLS,
  tablaVoicesForTick,
} from './tabla.js';
import { createHarmoniumSoundfont } from './soundfont.js';
import {
  brightnessCutoff,
  normalizeToneMap,
  normalizeToneSettings,
  toneAttackSeconds,
  toneReleaseSeconds,
  toneVelocity,
} from './tone.js';

const LOOKAHEAD_S = 0.1; // schedule this far ahead of the audio clock
const TICK_MS = 25; // driver timer period
const noop = () => {};

export const MELODY_VOICES = Object.freeze(['pluck', 'practice', 'sine', 'harmonium']);
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
 * }} env
 */
export function createPlayer(env) {
  const setI = env.setInterval || ((fn, ms) => setInterval(fn, ms));
  const clearI = env.clearInterval || ((id) => clearInterval(id));

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
  let melodyVoice = 'pluck'; // pluck | practice | sine | harmonium
  let droneMode = 'off'; // off | sa-pa | sa-ma
  let onCursor = noop;
  let onStop = noop;
  let masterGains = null;
  let mixBus = null;
  let melodyFilter = null;
  let melodyRoomGain = null;
  let toneByVoice = normalizeToneMap(null);
  let harmonium = null;

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
      // The sampled harmonium already has a proper MIDI reverb send. Avoid
      // doubling it through Sargam's tiny room while retaining the same UI.
      const wet = melodyVoice === 'harmonium' ? 0 : tone.reverb * 0.34;
      if (melodyRoomGain.gain.setTargetAtTime) {
        melodyRoomGain.gain.setTargetAtTime(wet, ctx.currentTime, 0.025);
      } else {
        melodyRoomGain.gain.value = wet;
      }
    }
    if (harmonium) harmonium.setSettings(toneByVoice.harmonium);
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

  function ensureHarmoniumAdapter() {
    ensureCtx();
    if (!harmonium) {
      harmonium = createHarmoniumSoundfont({
        context: ctx,
        destination: masterGains.melody,
        importModule: env.importModule,
        fetchText: env.fetchText,
        fetchArrayBuffer: env.fetchArrayBuffer,
        createObjectURL: env.createObjectURL,
        revokeObjectURL: env.revokeObjectURL,
      });
      harmonium.setSettings(toneByVoice.harmonium);
    }
    return harmonium;
  }

  async function prepareHarmonium() {
    return ensureHarmoniumAdapter().prepare();
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

  // ---- melody voices ----

  const PLUCK_S = 2.5; // rendered ring length; note-off is the gain fade
  const PRACTICE_S = 3.2;
  const TANPURA_S = 4.8;
  const pluckCache = new Map();
  const practiceCache = new Map();
  const tanpuraCache = new Map();
  const tickCache = new Map();
  let practiceVariant = 0;

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

  function practiceBuffer(freq, variant, tone) {
    const v = Math.abs(variant) % 4;
    const brightness = Math.round(tone.brightness * 100);
    const key = `${Math.round(freq * 10)}:${v}:${brightness}`;
    let buf = practiceCache.get(key);
    if (!buf) {
      buf = audioBuffer(
        renderPracticePluck({
          freq,
          dur: PRACTICE_S,
          sampleRate: ctx.sampleRate || 44100,
          variant: v,
          brightness: tone.brightness,
        })
      );
      practiceCache.set(key, buf);
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
    if (!ctx.createBuffer || !ctx.createBufferSource) return playSine(ev, at);
    const tone = toneByVoice.pluck;
    return playBufferNote(ev, at, pluckBuffer(ev.freq, tone), tone, { baseLevel: 0.92 });
  }

  function playPracticeTone(ev, at) {
    if (!ctx.createBuffer || !ctx.createBufferSource) return playSine(ev, at);
    const tone = toneByVoice.practice;
    const variant = practiceVariant++ % 4;
    return playBufferNote(ev, at, practiceBuffer(ev.freq, variant, tone), tone, {
      baseLevel: 0.76,
    });
  }

  function setOscPitch(osc, target, from, at, dur) {
    if (!osc.frequency) return;
    osc.frequency.setValueAtTime(from || target, at);
    if (from) osc.frequency.setTargetAtTime(target, at, Math.min(0.16, dur * 0.45));
  }

  function playSine(ev, at) {
    if (typeof ctx.createOscillator !== 'function') return false;
    const tone = toneByVoice.sine;
    const g = ctx.createGain();
    g.connect(masterGains.melody);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.connect(g);
    const dur = Math.max(0.03, ev.dur);
    const attack = Math.min(dur * 0.42, toneAttackSeconds(tone.attack));
    const release = toneReleaseSeconds(tone.release);
    const level = 0.54 * toneVelocity(tone.velocity, ev.grace);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + attack);
    g.gain.setValueAtTime(level, at + Math.max(attack, dur - 0.025));
    g.gain.setTargetAtTime(0.0001, at + dur, release);
    setOscPitch(osc, ev.freq, ev.glideFrom, at, dur);
    osc.start(at);
    osc.stop(at + dur + Math.max(0.22, release * 6));
    return true;
  }

  function playHarmonium(ev, at) {
    const adapter = ensureHarmoniumAdapter();
    if (adapter.ready) return adapter.play(ev, at, toneByVoice.harmonium);
    // Loading is intentionally lazy and may take a moment on first use. Keep
    // playback audible with the reliable pluck until the SoundFont is ready.
    void adapter.prepare();
    return playCurrentPluck(ev, at);
  }

  function playNote(ev, at) {
    if (melodyVoice === 'practice') return playPracticeTone(ev, at);
    if (melodyVoice === 'sine') return playSine(ev, at);
    if (melodyVoice === 'harmonium') return playHarmonium(ev, at);
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
      else if (ev.kind === 'cursor') onCursor(ev, at);
      nextIndex++;
    }

    const endT = loop ? loop.to : schedule.duration;
    const now = ctx.currentTime;
    if (now >= startedAt + (endT - offset)) {
      if (loop) {
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
    if (harmonium) harmonium.stopAll(true);
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
      if (melodyVoice === 'harmonium') void prepareHarmonium();
      if (from !== null) offset = from;
      startedAt = ctx.currentTime;
      nextIndex = seekIndex(offset);
      nextDroneAt = ctx.currentTime;
      droneStep = 0;
      playing = true;
      if (timer === null) timer = setI(pump, TICK_MS);
      pump(); // schedule the first horizon immediately, inside the gesture
      return true;
    },
    pause() {
      if (!playing) return;
      offset = offset + (ctx.currentTime - startedAt);
      playing = false;
      if (harmonium) harmonium.stopAll(true);
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
        offset = loop.from;
        startedAt = ctx.currentTime;
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
      melodyVoice = MELODY_VOICES.includes(mode) ? mode : 'pluck';
      applyToneBus();
    },
    setToneSettings(voice, settings) {
      const mode = MELODY_VOICES.includes(voice) ? voice : 'pluck';
      toneByVoice = {
        ...toneByVoice,
        [mode]: normalizeToneSettings(settings, mode),
      };
      if (mode === 'harmonium' && harmonium) {
        harmonium.setSettings(toneByVoice.harmonium);
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
      return melodyVoice === 'harmonium' ? prepareHarmonium() : Promise.resolve(true);
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
      return playing ? offset + (ctx.currentTime - startedAt) : offset;
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
    get harmoniumReady() {
      return Boolean(harmonium?.ready);
    },
    get harmoniumError() {
      return harmonium?.error || null;
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
