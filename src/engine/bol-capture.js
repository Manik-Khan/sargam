// src/engine/bol-capture.js — keyboard-first bol entry on the score's exact
// attack grid. Notes remain the rhythmic authority; capture only adds or
// replaces score-side articulation anchors.

import {
  addAnchorMark,
  attacksForLine,
  parseAnchorMetadata,
  writeAnchorMetadata,
} from './anchors.js';

const BOL_KINDS = new Set(['da', 'ra', 'diri', 'chikari']);
const INSERT_KEYS = new Map([
  ['ArrowDown', 'da'],
  ['ArrowUp', 'ra'],
  ['v', 'diri'],
  ['V', 'diri'],
  ['^', 'chikari'],
  ['c', 'chikari'],
  ['C', 'chikari'],
]);

export function sourceLineAtPosition(text, position) {
  const source = String(text ?? '');
  const safe = Math.max(0, Math.min(source.length, Number(position) || 0));
  const start = source.lastIndexOf('\n', Math.max(0, safe - 1)) + 1;
  const endIndex = source.indexOf('\n', safe);
  const end = endIndex === -1 ? source.length : endIndex;
  return {
    sourceLine: source.slice(0, start).split('\n').length,
    start,
    end,
    local: safe - start,
    text: source.slice(start, end),
  };
}

export function beginBolCapture(text, position) {
  const line = sourceLineAtPosition(text, position);
  const info = attacksForLine(text, line.sourceLine);
  if (info.error || info.attacks.length === 0) {
    return {
      ok: false,
      cursor: null,
      message: info.error
        ? `Bol Capture cannot use this line: ${info.error}`
        : 'Place the text cursor on a music line before starting Bol Capture.',
    };
  }
  const atOrAfterCaret = info.attacks.findIndex((attack) => attack.index >= line.local);
  const ordinal = atOrAfterCaret === -1 ? info.attacks.length - 1 : atOrAfterCaret;
  return {
    ok: true,
    cursor: { sourceLine: line.sourceLine, ordinal },
    message: captureStatus(info.attacks.length, ordinal),
  };
}

function gestureFor(info, sourceLine, ordinal) {
  const attack = info.attacks[ordinal];
  if (!attack) return null;
  return {
    anchorKind: 'attack',
    sourceLine,
    time: attack.timeLabel,
    ordinal,
    note: attack.ch,
  };
}

function markRange(mark) {
  if (!BOL_KINDS.has(mark?.kind) || mark.start?.kind !== 'attack') return null;
  const a = Number(mark.start.ordinal);
  const b = mark.kind === 'diri' && mark.end?.kind === 'attack'
    ? Number(mark.end.ordinal)
    : a;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  return {
    sourceLine: Number(mark.start.sourceLine),
    from: Math.min(a, b),
    to: Math.max(a, b),
  };
}

function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom <= bTo && bFrom <= aTo;
}

function clearBolRange(text, sourceLine, from, to) {
  const metadata = parseAnchorMetadata(text);
  if (metadata.problems.length) {
    return { ok: false, text, message: metadata.problems[0].msg, removed: [] };
  }
  const removed = [];
  const marks = metadata.marks.filter((mark) => {
    const range = markRange(mark);
    const conflict = range
      && range.sourceLine === sourceLine
      && rangesOverlap(range.from, range.to, from, to);
    if (conflict) removed.push(mark);
    return !conflict;
  });
  return {
    ok: true,
    text: removed.length ? writeAnchorMetadata(text, marks) : text,
    removed,
  };
}

export function removeBolAtCursor(text, cursor) {
  const sourceLine = Number(cursor?.sourceLine);
  const ordinal = Number(cursor?.ordinal);
  if (!Number.isInteger(sourceLine) || !Number.isInteger(ordinal)) {
    return { ok: false, text, message: 'Bol Capture has no active attack.' };
  }
  const result = clearBolRange(text, sourceLine, ordinal, ordinal);
  if (!result.ok) return result;
  return {
    ...result,
    message: result.removed.length ? 'Bol removed.' : 'No bol is attached to this attack.',
  };
}

export function setBolAtCursor(text, cursor, kind) {
  const sourceLine = Number(cursor?.sourceLine);
  const ordinal = Number(cursor?.ordinal);
  const info = attacksForLine(text, sourceLine);
  if (!BOL_KINDS.has(kind)) return { ok: false, text, message: `Unknown bol '${kind}'.` };
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= info.attacks.length) {
    return { ok: false, text, message: 'This phrase is complete. Move left to correct it.' };
  }
  const span = kind === 'diri' ? 2 : 1;
  if (ordinal + span > info.attacks.length) {
    return { ok: false, text, message: 'Diri needs two consecutive attacks; only one remains.' };
  }

  const cleared = clearBolRange(text, sourceLine, ordinal, ordinal + span - 1);
  if (!cleared.ok) return cleared;
  const refreshed = attacksForLine(cleared.text, sourceLine);
  const start = gestureFor(refreshed, sourceLine, ordinal);
  const end = kind === 'diri' ? gestureFor(refreshed, sourceLine, ordinal + 1) : null;
  const placed = addAnchorMark(cleared.text, { kind, start, ...(end ? { end } : {}) });
  if (!placed.ok) return placed;
  const nextOrdinal = Math.min(refreshed.attacks.length, ordinal + span);
  return {
    ...placed,
    cursor: { sourceLine, ordinal: nextOrdinal },
    message: `${kind === 'diri' ? 'Diri' : kind} entered. ${captureStatus(refreshed.attacks.length, nextOrdinal)}`,
  };
}

export function moveBolCursor(text, cursor, delta) {
  const sourceLine = Number(cursor?.sourceLine);
  const info = attacksForLine(text, sourceLine);
  if (!info.attacks.length) {
    return { ok: false, cursor, message: 'The active music line no longer has note attacks.' };
  }
  const ordinal = Math.max(0, Math.min(info.attacks.length, Number(cursor?.ordinal || 0) + delta));
  return {
    ok: true,
    cursor: { sourceLine, ordinal },
    message: captureStatus(info.attacks.length, ordinal),
  };
}

export function captureStatus(total, ordinal) {
  const done = Math.max(0, Math.min(total, Number(ordinal) || 0));
  return done >= total
    ? `Bol Capture complete: ${total}/${total} attacks.`
    : `Bol Capture: attack ${done + 1} of ${total}.`;
}

export function applyBolCaptureKey(text, cursor, key) {
  if (key === 'ArrowLeft') return { handled: true, ...moveBolCursor(text, cursor, -1) };
  if (key === 'ArrowRight') return { handled: true, ...moveBolCursor(text, cursor, 1) };
  if (key === 'Backspace') {
    const moved = moveBolCursor(text, cursor, -1);
    if (!moved.ok) return { handled: true, text, ...moved };
    const removed = removeBolAtCursor(text, moved.cursor);
    return { handled: true, cursor: moved.cursor, ...removed };
  }
  if (key === 'Delete') {
    return { handled: true, cursor, ...removeBolAtCursor(text, cursor) };
  }
  if (key === '-') {
    return {
      handled: true,
      ok: true,
      text,
      cursor,
      message: 'The note line already owns “-” and its held time; Bol Capture moves only between attacks.',
    };
  }
  const kind = INSERT_KEYS.get(key);
  if (!kind) return { handled: false, ok: true, text, cursor };
  return { handled: true, ...setBolAtCursor(text, cursor, kind) };
}
