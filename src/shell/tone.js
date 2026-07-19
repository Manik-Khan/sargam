// src/shell/tone.js — pure melody-timbre settings shared by the UI,
// synthesized voices, and the SoundFont adapter. Values are normalized to
// 0..1 so each engine can translate them into meaningful controls.

import { MELODY_VOICES, normalizeMelodyVoice } from './voices.js';

export const NEUTRAL_ENVELOPES = Object.freeze(['soft', 'bell', 'sustain', 'pluck']);
export const NEUTRAL_WAVEFORMS = Object.freeze(['sine', 'triangle']);

export const TONE_SLIDERS = Object.freeze([
  'velocity',
  'brightness',
  'attack',
  'release',
  'reverb',
  'chorus',
]);

const base = (overrides = {}) => Object.freeze({
  velocity: 0.65,
  brightness: 0.5,
  attack: 0.12,
  release: 0.4,
  reverb: 0.12,
  chorus: 0.03,
  coupler: false,
  subOctave: false,
  ...overrides,
});

export const DEFAULT_TONE_BY_VOICE = Object.freeze({
  pluck: base({
    velocity: 0.76,
    brightness: 0.62,
    attack: 0.04,
    release: 0.22,
    reverb: 0.05,
    chorus: 0,
  }),
  neutral: base({
    velocity: 0.52,
    brightness: 0.38,
    attack: 0.16,
    release: 0.32,
    reverb: 0.025,
    chorus: 0,
    neutralEnvelope: 'soft',
    neutralWaveform: 'triangle',
  }),
  harmonium: base({
    velocity: 0.64,
    brightness: 0.46,
    attack: 0.14,
    release: 0.55,
    reverb: 0.15,
    chorus: 0.06,
  }),
  violin: base({
    velocity: 0.61,
    brightness: 0.48,
    attack: 0.24,
    release: 0.58,
    reverb: 0.18,
    chorus: 0.05,
  }),
  cello: base({
    velocity: 0.64,
    brightness: 0.36,
    attack: 0.22,
    release: 0.62,
    reverb: 0.19,
    chorus: 0.04,
  }),
  'english-horn': base({
    velocity: 0.58,
    brightness: 0.42,
    attack: 0.18,
    release: 0.5,
    reverb: 0.16,
    chorus: 0.025,
  }),
  sitar: base({
    velocity: 0.66,
    brightness: 0.64,
    attack: 0.025,
    release: 0.32,
    reverb: 0.08,
    chorus: 0,
  }),
  shamisen: base({
    velocity: 0.68,
    brightness: 0.58,
    attack: 0.02,
    release: 0.22,
    reverb: 0.055,
    chorus: 0,
  }),
  koto: base({
    velocity: 0.62,
    brightness: 0.56,
    attack: 0.025,
    release: 0.3,
    reverb: 0.075,
    chorus: 0,
  }),
});

export function clamp01(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

export function normalizeToneSettings(value, voice = 'pluck') {
  const mode = normalizeMelodyVoice(voice);
  const defaults = DEFAULT_TONE_BY_VOICE[mode] || DEFAULT_TONE_BY_VOICE.pluck;
  const source = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const key of TONE_SLIDERS) out[key] = clamp01(source[key], defaults[key]);
  out.coupler = Boolean(source.coupler ?? defaults.coupler);
  out.subOctave = Boolean(source.subOctave ?? defaults.subOctave);
  if (mode === 'neutral') {
    // Migrate the first prototype's sine keys while removing all octave
    // transposition. The oscillator always follows the written frequency.
    const envelope = source.neutralEnvelope ?? source.sineEnvelope;
    const waveform = source.neutralWaveform ?? source.sineWaveform;
    out.neutralEnvelope = NEUTRAL_ENVELOPES.includes(envelope)
      ? envelope
      : defaults.neutralEnvelope;
    out.neutralWaveform = NEUTRAL_WAVEFORMS.includes(waveform)
      ? waveform
      : defaults.neutralWaveform;
  }
  return out;
}

export function normalizeToneMap(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const voice of MELODY_VOICES) {
    const legacy = voice === 'neutral' ? source.sine : undefined;
    out[voice] = normalizeToneSettings(source[voice] ?? legacy, voice);
  }
  return out;
}

export function updateToneMap(map, voice, patch) {
  const mode = normalizeMelodyVoice(voice);
  const normalized = normalizeToneMap(map);
  normalized[mode] = normalizeToneSettings(
    { ...normalized[mode], ...(patch || {}) },
    mode
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
