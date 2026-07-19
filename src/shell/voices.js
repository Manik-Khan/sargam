// src/shell/voices.js — canonical melody voice catalogue.
//
// Voice choice may change timbre, articulation, and effects, but never the
// composition's pitch. Every sampled preset uses the same concert-pitch
// frequency supplied by the notation scheduler.

export const MELODY_VOICE_DEFS = Object.freeze({
  pluck: Object.freeze({
    id: 'pluck',
    label: 'Current pluck',
    engine: 'synth',
  }),
  neutral: Object.freeze({
    id: 'neutral',
    label: 'Neutral tone',
    engine: 'synth',
  }),
  harmonium: Object.freeze({
    id: 'harmonium',
    label: 'Reed organ / harmonium',
    engine: 'soundfont',
    bankMSB: 0,
    bankLSB: 0,
    program: 20,
    presetName: 'Reed Organ',
  }),
  violin: Object.freeze({
    id: 'violin',
    label: 'Violin',
    engine: 'soundfont',
    bankMSB: 0,
    bankLSB: 0,
    program: 40,
    presetName: 'Violin',
  }),
  cello: Object.freeze({
    id: 'cello',
    label: 'Cello',
    engine: 'soundfont',
    bankMSB: 0,
    bankLSB: 0,
    program: 42,
    presetName: 'Cello',
  }),
  'english-horn': Object.freeze({
    id: 'english-horn',
    label: 'English horn',
    engine: 'soundfont',
    bankMSB: 0,
    bankLSB: 0,
    program: 69,
    presetName: 'English Horn',
  }),
  sitar: Object.freeze({
    id: 'sitar',
    label: 'Sitar',
    engine: 'soundfont',
    bankMSB: 0,
    bankLSB: 0,
    program: 104,
    presetName: 'Sitar',
  }),
  shamisen: Object.freeze({
    id: 'shamisen',
    label: 'Shamisen',
    engine: 'soundfont',
    bankMSB: 0,
    bankLSB: 0,
    program: 106,
    presetName: 'Shamisen',
  }),
  koto: Object.freeze({
    id: 'koto',
    label: 'Koto',
    engine: 'soundfont',
    bankMSB: 0,
    bankLSB: 0,
    program: 107,
    presetName: 'Koto',
  }),
});

export const MELODY_VOICES = Object.freeze(Object.keys(MELODY_VOICE_DEFS));
export const MELODY_VOICE_OPTIONS = Object.freeze(
  MELODY_VOICES.map((id) => Object.freeze([id, MELODY_VOICE_DEFS[id].label]))
);
export const SOUNDFONT_VOICES = Object.freeze(
  MELODY_VOICES.filter((id) => MELODY_VOICE_DEFS[id].engine === 'soundfont')
);

const LEGACY_VOICE_MIGRATIONS = Object.freeze({
  sine: 'neutral',
  practice: 'pluck',
});

export function normalizeMelodyVoice(value) {
  const migrated = LEGACY_VOICE_MIGRATIONS[value] || value;
  return MELODY_VOICES.includes(migrated) ? migrated : 'pluck';
}

export function melodyVoiceDef(value) {
  return MELODY_VOICE_DEFS[normalizeMelodyVoice(value)];
}

export function melodyVoiceLabel(value) {
  return melodyVoiceDef(value).label;
}

export function isSoundfontVoice(value) {
  return melodyVoiceDef(value).engine === 'soundfont';
}
