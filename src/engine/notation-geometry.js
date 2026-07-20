// src/engine/notation-geometry.js — pure semantic geometry for one written line.
//
// This module does not know about pixels or the browser. It maps the parsed
// musical model to stable attack identities and exact visual-slot boundaries.
// Preview, export, anchor authoring, and overlays consume the attributes that
// render.js stamps from this map instead of rescanning source text or guessing
// fractional positions from a whole cell rectangle.

import { frac, fracAdd, fracReduce } from './model.js';

function formatFrac(value) {
  const reduced = fracReduce(value);
  return reduced.den === 1 ? String(reduced.num) : `${reduced.num}/${reduced.den}`;
}

function divideFrac(value, divisor) {
  return fracReduce(frac(value.num, value.den * divisor));
}

/**
 * Build exact attack and visual-slot geometry for a parsed music line.
 * Times are measured in matras from the beginning of the source line.
 * Grace notes are intentionally absent: they decorate an attack but do not
 * create metric slots or anchor ordinals.
 */
export function buildLineGeometry(line) {
  const sourceLine = Number(line?.sourceLine || 0);
  const attacks = [];
  const matras = [];
  let ordinal = 0;

  for (let matraIndex = 0; matraIndex < (line?.matras || []).length; matraIndex++) {
    const events = line.matras[matraIndex]?.events || [];
    const slots = [];
    let cursor = frac(matraIndex, 1);
    let slotIndex = 0;

    for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
      const event = events[eventIndex];
      if (event?.grace) continue;

      const eventStart = cursor;
      const eventDur = event?.dur || frac(0, 1);
      const eventEnd = fracAdd(eventStart, eventDur);
      const writtenSlots = Math.max(1, Number(event?.writtenSlots) || 1);
      const slotDur = divideFrac(eventDur, writtenSlots);
      const attack = event?.type === 'note'
        ? {
            sourceLine,
            ordinal,
            matraIndex,
            eventIndex,
            time: eventStart,
            timeLabel: formatFrac(eventStart),
            endTime: eventEnd,
            endTimeLabel: formatFrac(eventEnd),
            note: event.ch || '',
            octave: Number(event.octave || 0),
          }
        : null;

      if (attack) {
        attacks.push(attack);
        ordinal += 1;
      }

      let slotStart = eventStart;
      for (let partIndex = 0; partIndex < writtenSlots; partIndex++) {
        const slotEnd = fracAdd(slotStart, slotDur);
        slots.push({
          sourceLine,
          matraIndex,
          eventIndex,
          slotIndex,
          partIndex,
          parts: writtenSlots,
          kind: attack && partIndex === 0 ? 'attack' : 'hold',
          start: slotStart,
          startLabel: formatFrac(slotStart),
          end: slotEnd,
          endLabel: formatFrac(slotEnd),
          attackOrdinal: attack?.ordinal ?? null,
          note: attack?.note ?? '',
          octave: attack?.octave ?? 0,
        });
        slotStart = slotEnd;
        slotIndex += 1;
      }

      cursor = eventEnd;
    }

    matras.push({
      sourceLine,
      matraIndex,
      start: frac(matraIndex, 1),
      startLabel: String(matraIndex),
      end: frac(matraIndex + 1, 1),
      endLabel: String(matraIndex + 1),
      slots,
    });
  }

  return {
    sourceLine,
    duration: frac((line?.matras || []).length, 1),
    durationLabel: String((line?.matras || []).length),
    attacks,
    matras,
  };
}
