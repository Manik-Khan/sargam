// src/shell/audio.js — M3 Wave B: sound (spec §6).
// Takes the pure event list from schedule.js and realizes it with the
// lookahead-scheduler pattern: a ~25ms timer schedules everything falling
// in the next ~100ms against the AudioContext clock. Audio starts
// synchronously inside the play gesture (the Bardic lesson: never start
// inside a .then()).
//
// Every browser surface is injected (env), so the driver logic runs — and
// is smoked — in bare node with a fake clock and a recording context.
// Voice DESIGN (timbre, tick sounds, glide shape) is the Wave C ear pass,
// judged by M; the constants here are starting points, not conclusions.

const LOOKAHEAD_S = 0.1; // schedule this far ahead of the audio clock
const TICK_MS = 25; // driver timer period

const noop = () => {};

import { renderPluck, renderTick } from './dsp.js';

/**
 * @param {{
 *   createContext: () => AudioContext-like,
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
  const gains = { melody: 1, tick: 1 };
  const muted = { melody: false, tick: false };
  let onCursor = noop;
  let onStop = noop;
  let masterGains = null;

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
    if (!masterGains) return;
    masterGains[track].gain.value = muted[track] ? 0 : gains[track];
  }

  function schedTime(ev) {
    return startedAt + (ev.t - offset);
  }

  // ---- voices (Wave C: Karplus-Strong pluck; every constant is M's-ear
  // territory). Buffers render deterministically in dsp.js and are cached
  // per pitch; falls back to an oscillator if the context lacks buffers.

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

  function playTick(ev, at) {
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
    setGain(track, v) {
      gains[track] = v;
      applyGain(track);
    },
    setMuted(track, v) {
      muted[track] = v;
      applyGain(track);
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
  };
}
