// A chikari is always the upper Sa, but its timbre should be adjustable
// independently of the notation melody. The default is deliberately soft:
// it needs to articulate a stroke without becoming the loudest sound in the
// room.

export const CHIKARI_SOUND_OPTIONS = Object.freeze([
  ['soft-string', 'Soft string'],
  ['rounded-tone', 'Rounded tone'],
  ['clear-string', 'Clear string'],
]);

const CHIKARI_SOUNDS = new Set(CHIKARI_SOUND_OPTIONS.map(([value]) => value));

export const DEFAULT_CHIKARI_SETTINGS = Object.freeze({
  sound: 'soft-string',
  intensity: 0.34,
  length: 0.38,
  brightness: 0.24,
});

const unit = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
};

export function normalizeChikariSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    sound: CHIKARI_SOUNDS.has(source.sound)
      ? source.sound
      : DEFAULT_CHIKARI_SETTINGS.sound,
    intensity: unit(source.intensity, DEFAULT_CHIKARI_SETTINGS.intensity),
    length: unit(source.length, DEFAULT_CHIKARI_SETTINGS.length),
    brightness: unit(source.brightness, DEFAULT_CHIKARI_SETTINGS.brightness),
  };
}

export function updateChikariSettings(previous, patch) {
  return normalizeChikariSettings({
    ...normalizeChikariSettings(previous),
    ...(patch || {}),
  });
}
