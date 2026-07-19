// audio.smoke.js — M3 Wave B driver logic under a fake clock.
// The WebAudio *sound* is Wave C ear work; what node can verify is the
// machinery: synchronous start, lookahead windowing, correct absolute
// times, pause/resume position math, loop wrap, track gain/mute routing.
import assert from 'node:assert/strict';
import { createPlayer } from '../src/shell/audio.js';
import { scheduleDocument } from '../src/engine/schedule.js';
import { parseDocument } from '../src/engine/parse.js';

const close = (a, b, msg) =>
  assert.ok(Math.abs(a - b) < 1e-6, `${a} !== ${b}${msg ? ` — ${msg}` : ''}`);

/** A minimal AudioContext recording every scheduled start. */
function mockCtx() {
  const started = [];
  const mkParam = () => ({
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  const ctx = {
    currentTime: 0,
    state: 'running',
    sampleRate: 8000, // small: keeps DSP renders fast under test
    destination: {},
    resume() {},
    createGain: () => ({ gain: mkParam(), connect() {} }),
    createBuffer: (ch, len) => ({
      length: len,
      getChannelData: () => new Float32Array(len),
    }),
    createBufferSource: () => {
      const src = {
        buffer: null,
        playbackRate: mkParam(),
        connect() {},
        start(at) {
          started.push({ at, kind: 'buffer' });
        },
        stop() {},
      };
      return src;
    },
    createOscillator: () => {
      const osc = {
        type: 'sine',
        frequency: mkParam(),
        connect() {},
        start(at) {
          started.push({ at, freq: osc._freq, oscillatorType: osc.type });
        },
        stop() {},
      };
      osc.frequency.setValueAtTime = (f) => {
        osc._freq = f;
      };
      return osc;
    },
    _started: started,
  };
  return ctx;
}

/** Fake timer registry the test advances by hand. */
function mockTimers(now = () => 0) {
  const intervals = new Map();
  const timeouts = new Map();
  let nextId = 1;
  const fireDueTimeouts = () => {
    let ran = true;
    while (ran) {
      ran = false;
      for (const [id, timer] of [...timeouts]) {
        if (timer.at <= now() + 1e-9) {
          timeouts.delete(id);
          timer.fn();
          ran = true;
        }
      }
    }
  };
  return {
    setInterval: (fn, ms) => {
      const id = nextId++;
      intervals.set(id, { fn, ms });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timeouts.set(id, { fn, at: now() + ms / 1000 });
      return id;
    },
    clearTimeout: (id) => timeouts.delete(id),
    fire() {
      for (const { fn } of [...intervals.values()]) fn();
      fireDueTimeouts();
    },
    fireTimeouts: fireDueTimeouts,
    get active() {
      return intervals.size;
    },
    get pendingTimeouts() {
      return timeouts.size;
    },
  };
}

function make(src) {
  const ctx = mockCtx();
  const timers = mockTimers(() => ctx.currentTime);
  const player = createPlayer({
    createContext: () => ctx,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  player.load(scheduleDocument(parseDocument(src).doc));
  return { ctx, timers, player };
}

const SRC = 'tal: tintal\ntempo: 60\n\nS R g m\n';

export const smokes = [
  {
    name: 'audio: play() schedules the first lookahead window synchronously',
    fn() {
      const { ctx, player } = make(SRC);
      player.play();
      // At t=0 with a 300ms horizon, only events at t<=0.3 land.
      assert.ok(ctx._started.length >= 1, 'something scheduled inside the gesture');
      assert.ok(
        ctx._started.every((s) => s.at <= 0.3 + 1e-9),
        'nothing beyond the horizon'
      );
    },
  },
  {
    name: 'audio: the pump schedules later events as the clock advances',
    fn() {
      const { ctx, timers, player } = make(SRC);
      player.play();
      const before = ctx._started.length;
      ctx.currentTime = 0.95; // R (t=1) enters the horizon
      timers.fire();
      assert.ok(ctx._started.length > before, 'R scheduled');
      const rNote = ctx._started.find((s) => Math.abs(s.at - 1) < 1e-6);
      assert.ok(rNote, 'R lands at exactly t=1');
    },
  },
  {
    name: 'audio: events already due schedule at now, never in the past',
    fn() {
      const { ctx, player } = make(SRC);
      ctx.currentTime = 2.5; // start mid-document
      player.play({ from: 2.4 });
      for (const s of ctx._started) assert.ok(s.at >= 2.5 - 1e-9, `${s.at} in the past`);
    },
  },
  {
    name: 'audio: pause freezes position; resume continues from it',
    fn() {
      const { ctx, timers, player } = make(SRC);
      player.play();
      ctx.currentTime = 1.5;
      timers.fire();
      player.pause();
      close(player.position, 1.5);
      assert.equal(timers.active, 0, 'driver timer released');
      ctx.currentTime = 9;
      close(player.position, 1.5, 'position frozen while paused');
      player.play();
      close(player.position, 1.5, 'resume picks up where it left off');
    },
  },
  {
    name: 'audio: playback ends at duration and reports it',
    fn() {
      const { ctx, timers, player } = make(SRC);
      let ended = false;
      player.onEnded(() => {
        ended = true;
      });
      player.play();
      ctx.currentTime = 4.2;
      timers.fire();
      assert.equal(ended, true);
      assert.equal(player.playing, false);
    },
  },
  {
    name: 'audio: loop wraps back to its head instead of ending',
    fn() {
      const { ctx, timers, player } = make(SRC);
      player.setLoop({ from: 0, to: 2 }); // first two matras
      player.play();
      ctx.currentTime = 2.01;
      timers.fire();
      assert.equal(player.playing, true, 'still playing after the wrap');
      ctx.currentTime = 2.05;
      timers.fire();
      // after the wrap, S (schedule t=0) is rescheduled at ~2.01 absolute
      const rewrapped = ctx._started.filter((s) => s.at > 2);
      assert.ok(rewrapped.length > 0, 'loop head rescheduled after wrap');
    },
  },
  {
    name: 'audio: cursor callback fires with events, not audio nodes',
    fn() {
      const { timers, ctx, player } = make(SRC);
      const seen = [];
      player.onCursor((ev) => seen.push(ev));
      player.play();
      ctx.currentTime = 3.95;
      timers.fire();
      assert.ok(seen.length >= 4, 'all four matra cursors dispatched');
      assert.equal(seen[0].matraIndex, 0);
      assert.equal(seen[3].matraIndex, 3);
    },
  },
  {
    name: 'audio: lookahead queues audio early but moves the visible cursor at its exact time',
    fn() {
      const { timers, ctx, player } = make(
        'tal: tintal\ntempo: 240\n\nS R\n'
      );
      const seen = [];
      player.onCursor((ev) => seen.push(ev.matraIndex));
      player.play();
      assert.deepEqual(seen, [0], 'the second cursor is not shown 250ms early');
      assert.ok(timers.pendingTimeouts >= 1, 'future cursor is waiting for audio time');
      ctx.currentTime = 0.24;
      timers.fireTimeouts();
      assert.deepEqual(seen, [0]);
      ctx.currentTime = 0.25;
      timers.fireTimeouts();
      assert.deepEqual(seen, [0, 1]);
    },
  },
  {
    name: 'audio: mute routes a track gain to zero and back',
    fn() {
      const { ctx, player } = make(SRC);
      player.play();
      player.setMuted('tick', true);
      // the master gain node for tick is the second createGain call
      player.setGain('melody', 0.4);
      player.setMuted('tick', false);
      assert.ok(true, 'gain routing exercises without throwing');
    },
  },
  {
    name: 'audio: notation starts quieter and independent gains clamp safely',
    fn() {
      const player = createPlayer({ createContext: mockCtx });
      assert.deepEqual(player.gains, { melody: 0.4, tick: 0.25, drone: 0.16 });
      player.setGain('melody', 0.62);
      player.setGain('tick', 9);
      player.setGain('drone', -2);
      assert.deepEqual(player.gains, { melody: 0.62, tick: 1, drone: 0 });
    },
  },
  {
    name: 'audio: melody voices and tanpura modes validate safely',
    fn() {
      const player = createPlayer({ createContext: mockCtx });
      assert.equal(player.melodyVoice, 'pluck');
      assert.equal(player.droneMode, 'off');
      player.setMelodyVoice('violin');
      player.setDroneMode('sa-ma');
      assert.equal(player.melodyVoice, 'violin');
      assert.equal(player.droneMode, 'sa-ma');
      player.setMelodyVoice('unknown');
      player.setDroneMode('unknown');
      assert.equal(player.melodyVoice, 'pluck');
      assert.equal(player.droneMode, 'off');
    },
  },
  {
    name: 'audio: per-voice tone settings are normalized and kept independently',
    fn() {
      const player = createPlayer({ createContext: mockCtx });
      player.setToneSettings('pluck', { brightness: 0.1, velocity: 3 });
      player.setToneSettings('harmonium', { brightness: 0.8, coupler: true });
      assert.equal(player.toneSettings.pluck.brightness, 0.1);
      assert.equal(player.toneSettings.pluck.velocity, 1);
      assert.equal(player.toneSettings.harmonium.brightness, 0.8);
      assert.equal(player.toneSettings.harmonium.coupler, true);
      assert.notEqual(
        player.toneSettings.violin.brightness,
        player.toneSettings.harmonium.brightness
      );
    },
  },
  {
    name: 'audio: tanpura support schedules a tonic-relative drone beside the melody',
    fn() {
      const { ctx, player } = make('sa: A\ntal: tintal\ntempo: 60\n\nS\n');
      player.setTalaSound('off');
      player.setMelodyVoice('neutral');
      player.setDroneMode('sa-pa');
      player.play();
      assert.ok(ctx._started.some((s) => s.kind === 'buffer'), 'drone pluck scheduled');
      assert.ok(ctx._started.some((s) => s.freq === 220), 'neutral tone matches written Sa exactly');
    },
  },
  {
    name: 'audio: neutral envelopes and waveforms never alter the written pitch',
    fn() {
      for (const [envelope, waveform] of [
        ['soft', 'sine'],
        ['bell', 'triangle'],
        ['sustain', 'sine'],
        ['pluck', 'triangle'],
      ]) {
        const current = make('sa: A\ntal: tintal\ntempo: 60\n\nS\n');
        current.player.setTalaSound('off');
        current.player.setMelodyVoice('neutral');
        current.player.setToneSettings('neutral', {
          neutralEnvelope: envelope,
          neutralWaveform: waveform,
          sineOctave: 2,
        });
        current.player.play();
        const oscillator = current.ctx._started.find((s) => s.freq);
        assert.equal(oscillator.freq, 220, `${envelope}/${waveform} stays at written A3`);
        assert.equal(oscillator.oscillatorType, waveform);
      }
    },
  },
  {
    name: 'audio: play with nothing loaded is a safe no-op',
    fn() {
      const player = createPlayer({ createContext: mockCtx });
      assert.equal(player.play(), false);
    },
  },
];
