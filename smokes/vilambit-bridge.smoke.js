// smokes/vilambit-bridge.smoke.js — protocol, trust boundary, and shell integration.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  VILAMBIT_CHANNEL,
  VILAMBIT_VERSION,
  formatVilambitTime,
  isExpectedVilambitEvent,
  makeVilambitCommand,
  postVilambitCommand,
  readVilambitMessage,
  sanitizeVilambitState,
} from '../src/shell/vilambit-bridge.js';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

function statePayload(overrides = {}) {
  return {
    ready: true,
    loaded: true,
    source: { name: 'Summer class.wav', kind: 'audio' },
    duration: 6994,
    position: 2541,
    playing: false,
    speed: 75,
    pitch: { semitones: 0, cents: 0, totalSemitones: 0 },
    loop: { a: 2538, b: 2558, on: true, ready: true },
    markers: [{ t: 2550, label: 'taan' }],
    error: null,
    ...overrides,
  };
}

export const smokes = [
  {
    name: 'vilambit bridge: command envelopes are versioned and narrow',
    async fn() {
      assert.deepEqual(makeVilambitCommand('seek', { seconds: 42 }), {
        channel: VILAMBIT_CHANNEL,
        version: VILAMBIT_VERSION,
        direction: 'command',
        type: 'seek',
        payload: { seconds: 42 },
      });
      assert.throws(() => makeVilambitCommand('expose-player'), /Unknown Vilambit command/);
    },
  },
  {
    name: 'vilambit bridge: state events accept only the v1 channel and direction',
    async fn() {
      const message = readVilambitMessage({
        channel: VILAMBIT_CHANNEL,
        version: VILAMBIT_VERSION,
        direction: 'event',
        type: 'state',
        payload: statePayload(),
      });
      assert.equal(message.type, 'state');
      assert.equal(message.state.source.name, 'Summer class.wav');
      assert.equal(message.state.position, 2541);
      assert.equal(readVilambitMessage({ ...message, channel: 'other' }), null);
      assert.equal(readVilambitMessage({
        channel: VILAMBIT_CHANNEL, version: 2, direction: 'event', type: 'state', payload: statePayload(),
      }), null);
      assert.equal(readVilambitMessage({
        channel: VILAMBIT_CHANNEL, version: 1, direction: 'command', type: 'state', payload: statePayload(),
      }), null);
    },
  },
  {
    name: 'vilambit bridge: snapshots are sanitized before entering React state',
    async fn() {
      const state = sanitizeVilambitState(statePayload({
        duration: 100,
        position: 120,
        speed: 240,
        markers: [{ t: -4, label: 'start' }],
      }));
      assert.equal(state.position, 100);
      assert.equal(state.speed, 200);
      assert.deepEqual(state.markers, [{ t: 0, label: 'start' }]);
    },
  },
  {
    name: 'vilambit bridge: source window and origin must both match',
    async fn() {
      const frameWindow = {};
      assert.equal(isExpectedVilambitEvent(
        { source: frameWindow, origin: 'https://sargam.example' },
        { frameWindow, origin: 'https://sargam.example' },
      ), true);
      assert.equal(isExpectedVilambitEvent(
        { source: {}, origin: 'https://sargam.example' },
        { frameWindow, origin: 'https://sargam.example' },
      ), false);
      assert.equal(isExpectedVilambitEvent(
        { source: frameWindow, origin: 'https://evil.example' },
        { frameWindow, origin: 'https://sargam.example' },
      ), false);
    },
  },
  {
    name: 'vilambit bridge: post helper sends the approved envelope to the exact origin',
    async fn() {
      const sent = [];
      const frameWindow = { postMessage: (...args) => sent.push(args) };
      assert.equal(postVilambitCommand(frameWindow, 'play', {}, 'https://sargam.example'), true);
      assert.equal(sent.length, 1);
      assert.equal(sent[0][0].type, 'play');
      assert.equal(sent[0][1], 'https://sargam.example');
    },
  },
  {
    name: 'vilambit bridge: recording time formatting handles long classes',
    async fn() {
      assert.equal(formatVilambitTime(2541.9), '42:21');
      assert.equal(formatVilambitTime(6994), '1:56:34');
      assert.equal(formatVilambitTime(-3), '0:00');
    },
  },
  {
    name: 'vilambit bridge: child publishes snapshots without exposing private engines',
    async fn() {
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(app, /SARGAM_VILAMBIT_BRIDGE_V1/);
      assert.match(app, /Core\.createPublicSnapshot/);
      assert.match(app, /event\.source !== window\.parent/);
      assert.match(app, /event\.origin !== window\.location\.origin/);
      assert.match(app, /request-state/);
      assert.match(app, /jump-marker/);
      assert.doesNotMatch(app, /payload:\s*state\b/);
    },
  },
  {
    name: 'vilambit bridge: notation shell mounts one remote bar against the persistent iframe',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      const bar = await read('../src/shell/PracticeBar.jsx');
      assert.match(app, /import PracticeBar from ['"]\.\/PracticeBar\.jsx['"]/);
      assert.match(app, /const vilambitRef = useRef\(null\)/);
      assert.match(app, /<PracticeBar\s+frameRef=\{vilambitRef\}/);
      assert.match(app, /<iframe[\s\S]*?ref=\{vilambitRef\}[\s\S]*?src=["']vilambit\.html["']/);
      assert.match(bar, /−5s/);
      assert.match(bar, /\+5s/);
      assert.match(bar, /Open Vilambit/);
      assert.doesNotMatch(bar, /AudioContext|createMediaElementSource|decodeAudioData/);
    },
  },
];
