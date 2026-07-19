// src/shell/audio.js — M3 Wave B: sound (spec §6).
// Takes the pure event list from schedule.js and realizes it with the
// lookahead-scheduler pattern: a ~25ms timer schedules everything falling
// in the next ~100ms against the AudioContext clock. Audio starts
// synchronously inside the play gesture (the Bardic lesson: never start
// inside a .then()).
//
// Every browser surface is injected (env), so the driver logic runs — and
// is smoked — in bare node with a fake clock and a recording context.

import { renderPluck, renderTick } from './dsp.js';
import {
  GHE_ROUND_ROBIN,
  TABLA_SAMPLE_URLS,
  tablaVoicesForTick,
} from './tabla.js';

const LOOKAHEAD_S = 0.1; // schedule this far ahead of the audio clock
const TICK_MS = 25; // driver timer period
const noop = () => {};

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
  const gains = { melody: 0.4, tick: 0.25 };
  const muted = { melody: false, tick: false };
  let talaSound = 'click'; // click | tabla | off
  let onCursor = noop;
  let onStop = noop;
  let masterGains = null;

  // Tabla samples are loaded once, decoded into the current AudioContext,
  // and retained for the life of the player. If they are not ready for an
  // early beat, that beat safely falls back to the synthesized click.
  const tablaBuffers = new Map();
  let tablaLoadPromise = null;
  let tablaLoadError = null;
  let gheIndex = 0;

  function ensureCtx() {
    if (!ctx) {
      ctx = env.createContext();
      masterGains = {
        melody: ctx.createGain(),
        tick: ctx.createGain(),
      };
      for (const k of Object.keys(masterGains)) {
        masterGains[k].connect(ctx.destination);
        applyGain(k);
      }
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); // not awaited — Bardic
    return ctx;
  }

  function applyGain(track) {
    if (!masterGains || !masterGains[track]) return;
    masterGains[track].gain.value = muted[track] ? 0 : gains[track];
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
  const pluckCache = new Map();
  const tickCache = new Map();

  function pluckBuffer(freq) {
    const key = Math.round(freq * 10);
    let buf = pluckCache.get(key);
    if (!buf) {
      const data = renderPluck({ freq, dur: PLUCK_S, sampleRate: ctx.sampleRate || 44100 });
      buf = ctx.createBuffer(1, data.length, ctx.sampleRate || 44100);
      buf.copyToChannel ? buf.copyToChannel(data, 0) : buf.getChannelData(0).set(data);
      pluckCache.set(key, buf);
    }
    return buf;
  }

  function playNote(ev, at) {
    if (!ctx.createBuffer || !ctx.createBufferSource) return playNoteOsc(ev, at);
    const g = ctx.createGain();
    g.connect(masterGains.melody);
    const src = ctx.createBufferSource();
    src.buffer = pluckBuffer(ev.freq);
    src.connect(g);
    const dur = Math.max(0.03, ev.dur);
    const level = ev.grace ? 0.55 : 0.9;
    g.gain.setValueAtTime(level, at);
    // let the string ring through the note, then fade at note-off
    g.gain.setTargetAtTime(0.0001, at + dur, 0.06);
    if (ev.glideFrom) {
      // meend on a pluck: strike, then bend — playbackRate ramps from the
      // source pitch's ratio up to 1, which is how a sarod meend works.
      const ratio = ev.glideFrom / ev.freq;
      src.playbackRate.setValueAtTime(ratio, at);
      src.playbackRate.setTargetAtTime(1, at, Math.min(0.14, dur * 0.45));
    }
    src.start(at);
    src.stop(at + dur + 0.4);
  }

  function playNoteOsc(ev, at) {
    const g = ctx.createGain();
    g.connect(masterGains.melody);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.connect(g);
    const dur = Math.max(0.03, ev.dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(ev.grace ? 0.5 : 0.85, at + 0.008);
    g.gain.setTargetAtTime(0.0001, at + 0.008, Math.max(0.05, dur * 0.35));
    osc.frequency.setValueAtTime(ev.freq, at);
    osc.start(at);
    osc.stop(at + dur + 0.25);
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
    offset = 0;
    nextIndex = 0;
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
      if (from !== null) offset = from;
      startedAt = ctx.currentTime;
      nextIndex = seekIndex(offset);
      playing = true;
      if (timer === null) timer = setI(pump, TICK_MS);
      pump(); // schedule the first horizon immediately, inside the gesture
      return true;
    },
    pause() {
      if (!playing) return;
      offset = offset + (ctx.currentTime - startedAt);
      playing = false;
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
    prepareTalaSound() {
      return talaSound === 'tabla' ? prepareTabla() : Promise.resolve(true);
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
