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

  // ---- voices (Wave C tunables) ----

  function playNote(ev, at) {
    const g = ctx.createGain();
    g.connect(masterGains.melody);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.connect(g);
    const dur = Math.max(0.03, ev.dur);
    // pluck envelope: fast attack, exponential-ish decay across the note
    const peak = ev.grace ? 0.5 : 0.85;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.008);
    g.gain.setTargetAtTime(0.0001, at + 0.008, Math.max(0.05, dur * 0.35));
    if (ev.glideFrom) {
      // meend: a shaped glide from the source pitch into this note
      osc.frequency.setValueAtTime(ev.glideFrom, at);
      osc.frequency.setTargetAtTime(ev.freq, at, Math.min(0.12, dur * 0.4));
    } else {
      osc.frequency.setValueAtTime(ev.freq, at);
    }
    osc.start(at);
    osc.stop(at + dur + 0.25);
  }

  function playTick(ev, at) {
    const g = ctx.createGain();
    g.connect(masterGains.tick);
    const osc = ctx.createOscillator();
    osc.connect(g);
    const accents = {
      sam: { freq: 1200, gain: 0.5, dur: 0.05, type: 'square' },
      khali: { freq: 420, gain: 0.28, dur: 0.06, type: 'sine' },
      vibhag: { freq: 880, gain: 0.35, dur: 0.04, type: 'square' },
      plain: { freq: 660, gain: 0.18, dur: 0.025, type: 'sine' },
    };
    const a = accents[ev.accent] || accents.plain;
    osc.type = a.type;
    osc.frequency.setValueAtTime(a.freq, at);
    g.gain.setValueAtTime(a.gain, at);
    g.gain.setTargetAtTime(0.0001, at + 0.005, a.dur);
    osc.start(at);
    osc.stop(at + a.dur + 0.1);
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
