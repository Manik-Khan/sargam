// Phase 3B Wave 3 — decoded clip transport schedules bounded Web Audio
// regions instead of restarting an HTML media element.
import assert from 'node:assert/strict';
import { startDecodedClipLoop } from '../src/shell/clip-audio.js';

export const smokes = [
  {
    name: 'clip audio: decoded transport schedules the refined in-file region',
    fn() {
      const previousWindow = globalThis.window;
      const starts = [];
      const stops = [];
      const sources = [];
      globalThis.window = {
        setInterval() { return 1; },
        clearInterval() {},
      };
      const context = {
        currentTime: 0,
        destination: {},
        createBufferSource() {
          const listeners = {};
          const source = {
            buffer: null,
            connect() { return this; },
            disconnect() {},
            addEventListener(type, fn) { listeners[type] = fn; },
            start(at, offset, duration) { starts.push({ at, offset, duration }); },
            stop(at) { stops.push(at); },
          };
          sources.push(source);
          return source;
        },
        createGain() {
          const gain = {
            cancelScheduledValues() {},
            setValueAtTime() {},
            linearRampToValueAtTime() {},
          };
          return { gain, connect() { return this; }, disconnect() {} };
        },
      };
      try {
        const session = startDecodedClipLoop({
          context,
          buffer: { duration: 5 },
          start: 0.4,
          end: 4.4,
          crossfadeMs: 12,
        });
        assert.ok(starts.length >= 1);
        assert.equal(starts[0].offset, 0.4);
        assert.equal(starts[0].duration, 4);
        assert.equal(session.region.start, 0.4);
        assert.equal(session.region.end, 4.4);
        session.stop();
        assert.ok(stops.length >= 1);
        assert.equal(session.playing, false);
      } finally {
        globalThis.window = previousWindow;
      }
    },
  },
];
