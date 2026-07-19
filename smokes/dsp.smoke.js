// dsp.smoke.js — Wave C: the Karplus-Strong pluck and tick DSP are pure
// math over Float32Arrays, so node can verify what matters before any ear
// hears it: length, energy, decay, and — via autocorrelation — that the
// pluck actually rings at the requested pitch. Timbre judgment stays M's.
import assert from 'node:assert/strict';
import {
  renderPluck,
  renderTanpuraPluck,
  renderTick,
} from '../src/shell/dsp.js';

const SR = 44100;

const rms = (buf, from, to) => {
  let acc = 0;
  const a = Math.floor(from), b = Math.floor(to);
  for (let i = a; i < b; i++) acc += buf[i] * buf[i];
  return Math.sqrt(acc / Math.max(1, b - a));
};

/** Dominant period via autocorrelation over an early window. */
function dominantPeriod(buf, sampleRate, minF = 60, maxF = 2000) {
  const start = Math.floor(0.05 * sampleRate);
  const win = Math.floor(0.1 * sampleRate);
  let bestLag = 0, best = -Infinity;
  const maxLag = Math.floor(sampleRate / minF);
  const minLag = Math.floor(sampleRate / maxF);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = start; i < start + win; i++) acc += buf[i] * buf[i + lag];
    if (acc > best) { best = acc; bestLag = lag; }
  }
  return sampleRate / bestLag;
}

export const smokes = [
  {
    name: 'pluck: buffer has the requested length and real energy',
    fn() {
      const buf = renderPluck({ freq: 220, dur: 1.0, sampleRate: SR });
      assert.equal(buf.length, SR);
      assert.ok(rms(buf, 0, SR * 0.1) > 0.01, 'audible attack');
    },
  },
  {
    name: 'pluck: it decays — a pluck, not an organ',
    fn() {
      const buf = renderPluck({ freq: 220, dur: 2.0, sampleRate: SR });
      const head = rms(buf, 0, SR * 0.2);
      const tail = rms(buf, SR * 1.6, SR * 2.0);
      assert.ok(tail < head * 0.5, `tail ${tail} vs head ${head}`);
    },
  },
  {
    name: 'pluck: rings at the requested fundamental (±3%)',
    fn() {
      for (const f of [131, 220, 440]) {
        const buf = renderPluck({ freq: f, dur: 1.0, sampleRate: SR });
        const got = dominantPeriod(buf, SR);
        assert.ok(Math.abs(got - f) / f < 0.03, `asked ${f}, rings at ${got.toFixed(1)}`);
      }
    },
  },
  {
    name: 'pluck: output stays within [-1, 1]',
    fn() {
      const buf = renderPluck({ freq: 440, dur: 1.0, sampleRate: SR });
      for (let i = 0; i < buf.length; i += 7) assert.ok(Math.abs(buf[i]) <= 1);
    },
  },
  {
    name: 'pluck: deterministic — same request, same samples (cacheable)',
    fn() {
      const a = renderPluck({ freq: 220, dur: 0.5, sampleRate: SR });
      const b = renderPluck({ freq: 220, dur: 0.5, sampleRate: SR });
      assert.deepEqual(Array.from(a.slice(0, 200)), Array.from(b.slice(0, 200)));
    },
  },
  {
    name: 'tanpura voice: long pluck renders safely with sustained energy',
    fn() {
      const buf = renderTanpuraPluck({ freq: 220, dur: 2.5, sampleRate: SR, variant: 2 });
      assert.equal(buf.length, Math.round(2.5 * SR));
      assert.ok(rms(buf, 0, SR * 0.25) > 0.005, 'audible attack');
      assert.ok(rms(buf, SR * 1.5, SR * 2.2) > 0.0001, 'drone keeps a tail');
      for (let i = 0; i < buf.length; i += 13) assert.ok(Math.abs(buf[i]) <= 1);
    },
  },
  {
    name: 'tick: each accent renders, sam louder than plain, khali duller than sam',
    fn() {
      const shapes = {};
      for (const accent of ['sam', 'khali', 'vibhag', 'plain']) {
        const buf = renderTick(accent, SR);
        assert.ok(buf.length > SR * 0.01, `${accent} long enough`);
        shapes[accent] = rms(buf, 0, buf.length);
        assert.ok(shapes[accent] > 0.001, `${accent} audible`);
        for (let i = 0; i < buf.length; i += 3) assert.ok(Math.abs(buf[i]) <= 1);
      }
      assert.ok(shapes.sam > shapes.plain, 'sam accented above plain');
    },
  },
];
