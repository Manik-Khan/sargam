// src/shell/tone.js — pure melody-timbre settings shared by the UI,
// synthesized voices, and the SoundFont adapter. Values are normalized to
// 0..1 so each engine can translate them into meaningful controls.

export const TONE_SLIDERS = Object.freeze([
  'velocity',
  'brightness',
  'attack',
  'release',
  'reverb',
  'chorus',
]);

export const DEFAULT_TONE_BY_VOICE = Object.freeze({
  pluck: Object.freeze({
    velocity: 0.76,
    brightness: 0.62,
    attack: 0.04,
    release: 0.22,
    reverb: 0.05,
    chorus: 0,
    coupler: false,
    subOctave: false,
  }),
  practice: Object.freeze({
    velocity: 0.64,
    brightness: 0.3,
    attack: 0.16,
    release: 0.46,
    reverb: 0.11,
    chorus: 0,
    coupler: false,
    subOctave: false,
  }),
  sine: Object.freeze({
    velocity: 0.52,
    brightness: 0,
    attack: 0.16,
    release: 0.32,
    reverb: 0.025,
    chorus: 0,
    coupler: false,
    subOctave: false,
  }),
  harmonium: Object.freeze({
    velocity: 0.67,
    brightness: 0.54,
    attack: 0.2,
    release: 0.58,
    reverb: 0.18,
    chorus: 0.09,
    coupler: false,
    subOctave: false,
  }),
});

export function clamp01(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

export function normalizeToneSettings(value, voice = 'pluck') {
  const defaults = DEFAULT_TONE_BY_VOICE[voice] || DEFAULT_TONE_BY_VOICE.pluck;
  const source = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const key of TONE_SLIDERS) out[key] = clamp01(source[key], defaults[key]);
  out.coupler = Boolean(source.coupler ?? defaults.coupler);
  out.subOctave = Boolean(source.subOctave ?? defaults.subOctave);
  return out;
}

export function normalizeToneMap(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const voice of Object.keys(DEFAULT_TONE_BY_VOICE)) {
    out[voice] = normalizeToneSettings(source[voice], voice);
  }
  return out;
}

export function updateToneMap(map, voice, patch) {
  const normalized = normalizeToneMap(map);
  normalized[voice] = normalizeToneSettings(
    { ...normalized[voice], ...(patch || {}) },
    voice
  );
  return normalized;
}

export function toneAttackSeconds(value) {
  const x = clamp01(value, 0.1);
  return 0.002 + x * x * 0.12;
}

export function toneReleaseSeconds(value) {
  const x = clamp01(value, 0.3);
  return 0.025 + x * x * 0.52;
}

export function toneVelocity(value, grace = false) {
  const x = clamp01(value, 0.65);
  const level = 0.16 + x * 0.84;
  return grace ? level * 0.62 : level;
}

export function brightnessCutoff(value) {
  const x = clamp01(value, 0.5);
  return 700 + Math.pow(x, 1.35) * 11200;
}
