// src/shell/tabla.js — small, explicit tabla sample map for notation playback.
//
// This first pass is deliberately conservative: Manik approved the five
// recordings below by ear, and only Rupak has a provisional stroke map. Other
// talas fall back to the existing click until their thekas are musically
// approved. Keeping the pattern as data makes future corrections small and
// auditable rather than burying musical decisions inside Web Audio code.

export const TABLA_SAMPLE_URLS = Object.freeze({
  'na-open': 'audio/tabla/mmiron-cc0/processed/na-open.wav',
  ghe_7: 'audio/tabla/mmiron-cc0/processed/ghe_7.wav',
  ghe_3: 'audio/tabla/mmiron-cc0/processed/ghe_3.wav',
  ghe_4: 'audio/tabla/mmiron-cc0/processed/ghe_4.wav',
  tun_3: 'audio/tabla/mmiron-cc0/processed/tun_3.wav',
});

export const GHE_ROUND_ROBIN = Object.freeze(['ghe_7', 'ghe_3', 'ghe_4']);

// Provisional Rupak playback shape: Tin Tin Na | Dhin Na | Dhin Na.
// `tun_3` is the approved resonant dayan voice; Dhin is represented by an
// approved Ghe layered with the approved open Na. This is a prototype sound
// map, not a claim that sample filenames define the musical bol vocabulary.
const RUPAK = Object.freeze([
  Object.freeze([{ sample: 'tun_3', gain: 0.9 }]),
  Object.freeze([{ sample: 'tun_3', gain: 0.72 }]),
  Object.freeze([{ sample: 'na-open', gain: 0.72 }]),
  Object.freeze([
    { sample: 'ghe', gain: 0.62 },
    { sample: 'na-open', gain: 0.76 },
  ]),
  Object.freeze([{ sample: 'na-open', gain: 0.68 }]),
  Object.freeze([
    { sample: 'ghe', gain: 0.58 },
    { sample: 'na-open', gain: 0.72 },
  ]),
  Object.freeze([{ sample: 'na-open', gain: 0.66 }]),
]);

/**
 * Return sample voices for one scheduled tala tick.
 *
 * @param {{tal?: string, cycleMatra?: number}} tick
 * @param {() => string} nextGhe supplies the next approved round-robin Ghe
 * @returns {{sample: string, gain: number}[] | null}
 *   null means "no approved tabla pattern for this tal; use the click".
 */
export function tablaVoicesForTick(tick, nextGhe) {
  if (String(tick?.tal || '').toLowerCase() !== 'rupak') return null;
  const cycleMatra = Number(tick?.cycleMatra);
  if (!Number.isInteger(cycleMatra) || cycleMatra < 1 || cycleMatra > RUPAK.length) {
    return null;
  }

  return RUPAK[cycleMatra - 1].map((voice) => ({
    ...voice,
    sample: voice.sample === 'ghe' ? nextGhe() : voice.sample,
  }));
}
