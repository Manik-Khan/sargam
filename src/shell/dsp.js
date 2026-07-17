// src/shell/dsp.js — Wave C sound sources (spec §6: "a plucked-style
// envelope with a timbre chosen by ear (M judges)").
//
// Karplus-Strong: a burst of noise fed through a tuned delay line with a
// gentle low-pass in the loop — a physical model of a plucked string,
// which is why it lands nearer a sarod than any oscillator can. All pure
// math over Float32Arrays: deterministic (seeded noise → cacheable, and
// smokeable down to the fundamental), no WebAudio here. audio.js pours
// these into AudioBuffers.
//
// Every constant is a Wave C tunable; M's ear is the judge of record.

/** Deterministic PRNG (mulberry32) so a given pluck is always the same. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Karplus-Strong pluck.
 * @param {{freq: number, dur: number, sampleRate: number, bright?: number}} o
 *   bright 0..1 — how much high end survives the initial excitation.
 * @returns {Float32Array}
 */
export function renderPluck({ freq, dur, sampleRate, bright = 0.55 }) {
  const n = Math.max(1, Math.round(dur * sampleRate));
  const out = new Float32Array(n);
  const period = sampleRate / freq;
  const N = Math.max(2, Math.floor(period));
  // fractional-delay correction via allpass would be nicer; for v1 the
  // integer delay plus averaging lands within the smoke's ±3%.
  const delay = new Float32Array(N);

  // excitation: noise, one-pole low-passed by (1-bright) for a rounder attack
  const rand = prng(Math.round(freq * 1000));
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const white = rand() * 2 - 1;
    lp = lp + bright * (white - lp);
    delay[i] = lp;
  }

  // loop: y[n] = decay * (y[n-N] + y[n-N-1]) / 2
  // decay tuned so low notes ring longer, like real strings
  const decay = Math.min(0.998, 0.994 + 0.004 * Math.min(1, 200 / freq));
  let idx = 0;
  let prev = delay[N - 1];
  for (let i = 0; i < n; i++) {
    const cur = delay[idx];
    const next = decay * 0.5 * (cur + prev);
    out[i] = cur;
    delay[idx] = next;
    prev = cur;
    idx = (idx + 1) % N;
  }

  // normalize to a safe peak, then a short attack ramp to kill the click
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? 0.9 / peak : 1;
  const attack = Math.min(n, Math.round(0.002 * sampleRate));
  for (let i = 0; i < n; i++) {
    const a = i < attack ? i / attack : 1;
    out[i] *= g * a;
  }
  return out;
}

/**
 * Tick per accent: a shaped noise burst (clap-ish), with a pitched thump
 * mixed in for sam so the cycle head is unmistakable. Khali is duller and
 * hollow (heavier low-pass) — present, but marked by absence of brightness.
 * @returns {Float32Array}
 */
export function renderTick(accent, sampleRate) {
  const shapes = {
    sam: { dur: 0.09, bright: 0.9, gain: 0.9, thump: 180 },
    khali: { dur: 0.07, bright: 0.18, gain: 0.5, thump: 0 },
    vibhag: { dur: 0.05, bright: 0.7, gain: 0.6, thump: 0 },
    plain: { dur: 0.035, bright: 0.55, gain: 0.35, thump: 0 },
  };
  const s = shapes[accent] || shapes.plain;
  const n = Math.round(s.dur * sampleRate);
  const out = new Float32Array(n);
  const rand = prng(accent.length * 7919);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const env = Math.exp((-6 * i) / n);
    const white = rand() * 2 - 1;
    lp = lp + s.bright * (white - lp);
    let v = lp * env;
    if (s.thump) v += 0.7 * Math.sin((2 * Math.PI * s.thump * i) / sampleRate) * Math.exp((-10 * i) / n);
    out[i] = Math.max(-1, Math.min(1, v * s.gain));
  }
  return out;
}
