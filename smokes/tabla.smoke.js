import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createPlayer } from '../src/shell/audio.js';
import { parseDocument } from '../src/engine/parse.js';
import { scheduleDocument } from '../src/engine/schedule.js';
import {
  GHE_ROUND_ROBIN,
  TABLA_SAMPLE_URLS,
  tablaVoicesForTick,
} from '../src/shell/tabla.js';

function timers() {
  const active = new Map();
  let id = 0;
  return {
    setInterval(fn) {
      active.set(++id, fn);
      return id;
    },
    clearInterval(key) {
      active.delete(key);
    },
    fire() {
      for (const fn of [...active.values()]) fn();
    },
  };
}

function sampleContext() {
  const starts = [];
  const param = () => ({
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    setTargetAtTime() {},
  });
  return {
    currentTime: 0,
    state: 'running',
    sampleRate: 8000,
    destination: {},
    resume() {},
    createGain: () => ({ gain: param(), connect() {} }),
    createBuffer: (_channels, length) => ({
      duration: length / 8000,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const source = {
        buffer: null,
        playbackRate: param(),
        connect() {},
        start(at) {
          starts.push({ at, buffer: source.buffer });
        },
        stop() {},
      };
      return source;
    },
    createOscillator: () => ({
      type: 'triangle',
      frequency: param(),
      connect() {},
      start() {},
      stop() {},
    }),
    decodeAudioData: (bytes) => Promise.resolve({ duration: 1, sampleUrl: bytes.url }),
    _starts: starts,
  };
}

export const smokes = [
  {
    name: 'tabla assets: the five approved processed WAV files ship with the app',
    fn() {
      assert.deepEqual(Object.keys(TABLA_SAMPLE_URLS), [
        'na-open',
        'ghe_7',
        'ghe_3',
        'ghe_4',
        'tun_3',
      ]);
      for (const url of Object.values(TABLA_SAMPLE_URLS)) {
        const path = new URL(`../public/${url}`, import.meta.url);
        assert.equal(existsSync(path), true, `${url} exists`);
        assert.ok(statSync(path).size > 1000, `${url} is not empty`);
      }
      const manifest = JSON.parse(
        readFileSync(new URL('../public/audio/tabla/mmiron-cc0/samples.json', import.meta.url), 'utf8')
      );
      assert.deepEqual(manifest.selection.approvedAvailable, [
        'na-open',
        'ghe_7',
        'ghe_3',
        'ghe_4',
        'tun_3',
      ]);
    },
  },
  {
    name: 'tabla map: Rupak follows the provisional seven-matra pattern',
    fn() {
      let i = 0;
      const nextGhe = () => GHE_ROUND_ROBIN[i++ % GHE_ROUND_ROBIN.length];
      const voices = Array.from({ length: 7 }, (_, index) =>
        tablaVoicesForTick({ tal: 'rupak', cycleMatra: index + 1 }, nextGhe)
      );
      assert.deepEqual(voices.map((v) => v.map((x) => x.sample)), [
        ['tun_3'],
        ['tun_3'],
        ['na-open'],
        ['ghe_7', 'na-open'],
        ['na-open'],
        ['ghe_3', 'na-open'],
        ['na-open'],
      ]);
      assert.equal(tablaVoicesForTick({ tal: 'tintal', cycleMatra: 1 }, nextGhe), null);
    },
  },
  {
    name: 'tabla scheduler seam: tick events carry their tal name',
    fn() {
      const schedule = scheduleDocument(parseDocument('tal: rupak\ntempo: 60\n\nS R g m P d n\n').doc);
      const ticks = schedule.events.filter((event) => event.kind === 'tick');
      assert.equal(ticks.length, 7);
      assert.ok(ticks.every((event) => event.tal === 'rupak'));
    },
  },
  {
    name: 'tabla player: samples load once and Rupak uses recorded voices',
    async fn() {
      const ctx = sampleContext();
      const clock = timers();
      const fetched = [];
      const player = createPlayer({
        createContext: () => ctx,
        fetchArrayBuffer: async (url) => {
          fetched.push(url);
          return { url };
        },
        setInterval: clock.setInterval,
        clearInterval: clock.clearInterval,
      });
      player.setTalaSound('tabla');
      assert.equal(await player.prepareTalaSound(), true);
      assert.equal(player.tablaReady, true);
      assert.deepEqual(fetched.sort(), Object.values(TABLA_SAMPLE_URLS).sort());

      player.load(scheduleDocument(parseDocument('tal: rupak\ntempo: 60\n\nS R g m P d n\n').doc));
      player.play();
      ctx.currentTime = 5.95;
      clock.fire();

      const sampleStarts = ctx._starts
        .filter((start) => start.buffer?.sampleUrl)
        .map((start) => start.buffer.sampleUrl.split('/').at(-1));
      assert.deepEqual(sampleStarts, [
        'tun_3.wav',
        'tun_3.wav',
        'na-open.wav',
        'ghe_7.wav',
        'na-open.wav',
        'na-open.wav',
        'ghe_3.wav',
        'na-open.wav',
        'na-open.wav',
      ]);
    },
  },
];
