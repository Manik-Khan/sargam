// src/engine/repeated-slide.js — local approach-slide groups that preserve
// the destination rhythm. `{n~}D--{n~}D` has the same 3:1 timing as `D--D`;
// each n is an untimed pitch approach, not an additional attack/grid slot.

import { frac, fracReduce } from './model.js';

const NOTE_CHARS = new Set(['S', 'r', 'R', 'g', 'G', 'm', 'M', 'P', 'd', 'D', 'n', 'N']);

function noteSpec(text) {
  let octave = 0;
  let note = null;
  for (const ch of String(text || '')) {
    if (ch === '.') { octave -= 1; continue; }
    if (ch === "'") { octave += 1; continue; }
    if (!NOTE_CHARS.has(ch) || note) return null;
    note = ch;
  }
  return note ? { ch: note, octave } : null;
}

/**
 * Scan a contiguous local-slide token at body[start]. At least two groups are
 * required so existing one-destination brace ornaments keep their old grammar.
 *
 * @returns {null|{next:number, events:object[], groups:object[]}}
 */
export function scanRepeatedSlideAt(body, start = 0) {
  if (body[start] !== '{') return null;
  const groups = [];
  let pos = start;
  while (pos < body.length && body[pos] === '{') {
    const close = body.indexOf('}', pos + 1);
    if (close < 0) break;
    const inner = body.slice(pos + 1, close).replace(/[\s/]+/g, '');
    const approachMatch = inner.match(/^([.'SrRgGmMPdDnN]+)~$/);
    if (!approachMatch) break;
    const approach = noteSpec(approachMatch[1]);
    if (!approach) break;
    const destinationIndex = close + 1;
    let cursor = destinationIndex;
    let destinationText = '';
    while (cursor < body.length && /[.'SrRgGmMPdDnN]/.test(body[cursor])) {
      destinationText += body[cursor++];
    }
    const destination = noteSpec(destinationText);
    if (!destination) break;
    let dashes = 0;
    while (body[cursor] === '-') { dashes += 1; cursor += 1; }
    groups.push({ approach, destination, destinationIndex, slots: 1 + dashes });
    pos = cursor;
  }
  if (groups.length < 2) return null;
  const totalSlots = groups.reduce((sum, group) => sum + group.slots, 0);
  const events = groups.map((group) => {
    const event = {
      type: 'note',
      ch: group.destination.ch,
      octave: group.destination.octave,
      dur: fracReduce(frac(group.slots, totalSlots)),
      approachSlide: { ...group.approach },
    };
    if (group.slots > 1) event.writtenSlots = group.slots;
    return event;
  });
  return { next: pos, events, groups };
}

export function serializeRepeatedSlideMatra(events) {
  if (!Array.isArray(events) || events.length < 2) return null;
  if (!events.every((event) => event?.type === 'note' && event.approachSlide)) return null;
  return events.map((event) => {
    const a = event.approachSlide;
    const approach = `${a.octave < 0 ? '.'.repeat(-a.octave) : a.octave > 0 ? "'".repeat(a.octave) : ''}${a.ch}`;
    const destination = `${event.octave < 0 ? '.'.repeat(-event.octave) : event.octave > 0 ? "'".repeat(event.octave) : ''}${event.ch}`;
    const slots = Math.max(1, Number(event.writtenSlots) || 1);
    return `{${approach}~}${destination}${'-'.repeat(slots - 1)}`;
  }).join('');
}
