// src/engine/bol-capture.js — keyboard-first bol entry on the score's exact
// attack grid. Notes remain the rhythmic authority. Unlike score-side drawing
// annotations, captured bols are written to the composition's ordinary,
// editable `>` attachment line.

import {
  attacksForLine,
  parseAnchorMetadata,
  writeAnchorMetadata,
} from './anchors.js';
import { parseDocument } from './parse.js';
import {
  BOL_KINDS,
  formatBolLane,
  parseBolLane,
} from './bol-lane.js';

const INSERT_KEYS = new Map([
  ['ArrowDown', 'da'],
  ['ArrowUp', 'ra'],
  ['v', 'diri'],
  ['V', 'diri'],
  ['^', 'chikari'],
  ['c', 'chikari'],
  ['C', 'chikari'],
]);

function sourceParts(text) {
  const source = String(text ?? '');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return { source, eol, lines: source.split(/\r?\n/) };
}

function lineStartOffset(lines, index, eol) {
  let offset = 0;
  for (let i = 0; i < index; i++) offset += lines[i].length + eol.length;
  return offset;
}

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
    text: source.slice(start, end).replace(/\r$/, ''),
  };
}

function cursorPass(cursor) {
  return Math.max(1, Number(cursor?.pass) || 1);
}

function findBolLane(text, sourceLine, pass = 1) {
  const parts = sourceParts(text);
  const musicIndex = Number(sourceLine) - 1;
  if (!Number.isInteger(musicIndex) || musicIndex < 0 || musicIndex >= parts.lines.length) {
    return { ...parts, musicIndex, laneIndex: -1, insertIndex: -1, body: '' };
  }

  let insertIndex = musicIndex + 1;
  let laneIndex = -1;
  // Meter and lyric attachments may sit between the music and bol lanes.
  // Stop at the first blank, label, directive, or subsequent music line.
  for (let i = musicIndex + 1; i < parts.lines.length; i++) {
    const trimmed = parts.lines[i].trim();
    if (trimmed.startsWith('>>') || trimmed.startsWith('"')) {
      insertIndex = i + 1;
      continue;
    }
    const bol = trimmed.match(/^>(\d+)?(?:\s|$)/);
    if (bol) {
      const lanePass = Math.max(1, Number(bol[1]) || 1);
      if (lanePass === Number(pass)) laneIndex = i;
      insertIndex = i + 1;
      continue;
    }
    break;
  }

  const trimmedLane = laneIndex >= 0 ? parts.lines[laneIndex].trim() : '';
  const prefix = trimmedLane.match(/^>(\d+)?/)?.[0] || '>';
  const raw = laneIndex >= 0 ? trimmedLane.slice(prefix.length).trim() : '';
  return { ...parts, musicIndex, laneIndex, insertIndex, body: raw, prefix };
}

function musicLineForSource(text, sourceLine) {
  const parsed = parseDocument(text);
  for (const section of parsed.doc.sections || []) {
    for (const line of section.lines || []) {
      if (line.sourceLine === Number(sourceLine)) return line;
    }
  }
  return null;
}

function structuralLane(text, sourceLine, pass = 1) {
  const musicLine = musicLineForSource(text, sourceLine);
  if (!musicLine) return null;
  const found = findBolLane(text, sourceLine, pass);
  const parsed = parseBolLane(found.body, musicLine, { diriAttacks: pass > 1 ? 1 : 2 });
  return { musicLine, found, parsed };
}

function writeBolLane(text, sourceLine, body, { keepEmpty = true, pass = 1 } = {}) {
  const lane = findBolLane(text, sourceLine, pass);
  if (lane.insertIndex < 0) {
    return { ok: false, text, message: 'The active music line no longer exists.' };
  }
  const normalized = String(body ?? '').trim();
  const prefix = pass > 1 ? `>${pass}` : lane.prefix === '>1' ? '>1' : '>';
  const bolText = normalized ? `${prefix} ${normalized}` : `${prefix} `;
  const lines = [...lane.lines];
  let laneIndex = lane.laneIndex;

  if (!normalized && !keepEmpty && laneIndex >= 0) {
    lines.splice(laneIndex, 1);
    laneIndex = -1;
  } else if (laneIndex >= 0) {
    const indent = lines[laneIndex].match(/^\s*/)?.[0] || '';
    lines[laneIndex] = indent + bolText;
  } else {
    laneIndex = lane.insertIndex;
    lines.splice(laneIndex, 0, bolText);
  }

  return {
    ok: true,
    text: lines.join(lane.eol),
    body: normalized,
    bolSourceLine: laneIndex >= 0 ? laneIndex + 1 : null,
  };
}

function bolAnchorRange(mark) {
  if (!BOL_KINDS.has(mark?.kind) || mark.start?.kind !== 'attack') return null;
  const sourceLine = Number(mark.start.sourceLine);
  const from = Number(mark.start.ordinal);
  const endOrdinal = mark.kind === 'diri' && mark.end?.kind === 'attack'
    ? Number(mark.end.ordinal)
    : from;
  if (!Number.isInteger(sourceLine) || !Number.isInteger(from) || !Number.isInteger(endOrdinal)) {
    return null;
  }
  return { sourceLine, from, to: Math.max(from, endOrdinal), kind: mark.kind };
}

function migrateBolAnchors(text, sourceLine) {
  const metadata = parseAnchorMetadata(text);
  if (metadata.problems.length) {
    return { ok: false, text, count: 0, message: metadata.problems[0].msg };
  }
  const migrated = [];
  const retained = metadata.marks.filter((mark) => {
    const range = bolAnchorRange(mark);
    if (range?.sourceLine === sourceLine) {
      migrated.push(range);
      return false;
    }
    return true;
  });
  if (!migrated.length) return { ok: true, text, count: 0 };

  const withoutAnchors = writeAnchorMetadata(text, retained);
  const lane = structuralLane(withoutAnchors, sourceLine);
  if (!lane) return { ok: false, text, count: 0, message: 'The active music line no longer exists.' };
  const assignments = [...lane.parsed.assignments];
  const coveredBy = [...lane.parsed.coveredBy];
  for (const mark of migrated) {
    assignments[mark.from] = mark.kind;
    if (mark.kind === 'diri') {
      for (let i = mark.from + 1; i <= mark.to; i++) coveredBy[i] = mark.from;
    }
  }
  const formatted = formatBolLane(lane.musicLine, assignments, coveredBy);
  const written = writeBolLane(withoutAnchors, sourceLine, formatted.text);
  return { ...written, count: migrated.length };
}

export function bolCursorSelection(text, cursor) {
  const sourceLine = Number(cursor?.sourceLine);
  const ordinal = Number(cursor?.ordinal);
  const pass = cursorPass(cursor);
  if (!Number.isInteger(sourceLine) || !Number.isInteger(ordinal)) return null;
  const lane = findBolLane(text, sourceLine, pass);
  if (lane.laneIndex < 0) return null;
  const line = lane.lines[lane.laneIndex];
  const lineStart = lineStartOffset(lane.lines, lane.laneIndex, lane.eol);
  const bodyOffset = line.indexOf('>') + lane.prefix.length;
  const body = line.slice(bodyOffset);
  const musicLine = musicLineForSource(text, sourceLine);
  if (!musicLine) return null;
  const parsed = parseBolLane(body, musicLine, { diriAttacks: pass > 1 ? 1 : 2 });
  const range = parsed.ranges[ordinal];
  if (range) {
    const leading = body.length - body.trimStart().length;
    const from = lineStart + bodyOffset + leading + range.from;
    return { from, to: lineStart + bodyOffset + leading + range.to };
  }
  const at = lineStart + line.length;
  return { from: at, to: at };
}

export function beginBolCapture(text, position) {
  const line = sourceLineAtPosition(text, position);
  let sourceLine = line.sourceLine;
  let info = attacksForLine(text, sourceLine);
  // Accept an immediately following blank or attachment line so the writer
  // never has to highlight a phrase before entering capture.
  if ((info.error || info.attacks.length === 0) && /^\s*(?:$|>|"|<!--)/.test(line.text)) {
    for (let candidate = line.sourceLine - 1; candidate >= Math.max(1, line.sourceLine - 3); candidate--) {
      const previous = attacksForLine(text, candidate);
      if (!previous.error && previous.attacks.length) {
        sourceLine = candidate;
        info = previous;
        break;
      }
    }
  }
  if (info.error || info.attacks.length === 0) {
    return {
      ok: false,
      text,
      cursor: null,
      message: info.error
        ? `Bol Capture cannot use this line: ${info.error}`
        : 'Place the text cursor on a music line before starting Bol Capture.',
    };
  }

  const migrated = migrateBolAnchors(text, sourceLine);
  if (!migrated.ok) return { ...migrated, cursor: null };
  const lane = structuralLane(migrated.text, sourceLine);
  if (!lane) return { ok: false, text: migrated.text, cursor: null, message: 'The active music line no longer exists.' };
  const formatted = formatBolLane(lane.musicLine, lane.parsed.assignments, lane.parsed.coveredBy);
  const ready = writeBolLane(migrated.text, sourceLine, formatted.text);
  if (!ready.ok) return { ...ready, cursor: null };
  const cursor = { sourceLine, ordinal: 0 };
  return {
    ok: true,
    text: ready.text,
    cursor,
    selection: bolCursorSelection(ready.text, cursor),
    message: migrated.count
      ? `Bol Capture ready. Moved ${migrated.count} existing bol mark${migrated.count === 1 ? '' : 's'} into the editable > line.`
      : `Bol Capture ready on the editable > line. ${captureStatus(info.attacks.length, 0)}`,
  };
}

function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom <= bTo && bFrom <= aTo;
}

function assignmentRange(assignments, coveredBy, index) {
  const covering = coveredBy[index];
  if (covering !== null && covering !== undefined) {
    return { from: covering, to: index };
  }
  if (!assignments[index]) return null;
  return {
    from: index,
    to: assignments[index] === 'diri' && coveredBy[index + 1] === index
      ? Math.min(assignments.length - 1, index + 1)
      : index,
  };
}

function clearBolRange(assignments, coveredBy, from, to) {
  const next = [...assignments];
  const nextCovered = [...coveredBy];
  let removed = 0;
  for (let i = 0; i < assignments.length; i++) {
    const range = assignmentRange(assignments, coveredBy, i);
    if (range && rangesOverlap(range.from, range.to, from, to)) {
      next[i] = '.';
      next[i] = null;
      if (assignments[i] === 'diri' && i + 1 < next.length) nextCovered[i + 1] = null;
      if (coveredBy[i] !== null && coveredBy[i] !== undefined) {
        next[coveredBy[i]] = null;
        nextCovered[i] = null;
      }
      removed++;
    }
  }
  return { assignments: next, coveredBy: nextCovered, removed };
}

export function removeBolAtCursor(text, cursor) {
  const sourceLine = Number(cursor?.sourceLine);
  const ordinal = Number(cursor?.ordinal);
  const pass = cursorPass(cursor);
  if (!Number.isInteger(sourceLine) || !Number.isInteger(ordinal)) {
    return { ok: false, text, message: 'Bol Capture has no active attack.' };
  }
  const lane = structuralLane(text, sourceLine, pass);
  if (!lane) return { ok: false, text, message: 'The active music line no longer exists.' };
  const cleared = clearBolRange(
    lane.parsed.assignments,
    lane.parsed.coveredBy,
    ordinal,
    ordinal
  );
  const formatted = formatBolLane(lane.musicLine, cleared.assignments, cleared.coveredBy);
  const written = writeBolLane(text, sourceLine, formatted.text, { pass });
  if (!written.ok) return written;
  return {
    ...written,
    cursor,
    selection: bolCursorSelection(written.text, cursor),
    message: cleared.removed ? 'Bol removed from the editable > line.' : 'No bol is attached to this attack.',
  };
}

export function setBolAtCursor(text, cursor, kind) {
  const sourceLine = Number(cursor?.sourceLine);
  const ordinal = Number(cursor?.ordinal);
  const pass = cursorPass(cursor);
  const info = attacksForLine(text, sourceLine);
  if (!BOL_KINDS.has(kind)) return { ok: false, text, message: `Unknown bol '${kind}'.` };
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= info.attacks.length) {
    return { ok: false, text, message: 'This phrase is complete. Move left to correct it.' };
  }
  const span = kind === 'diri' && pass === 1 ? 2 : 1;
  if (ordinal + span > info.attacks.length) {
    return { ok: false, text, message: 'Diri needs two consecutive attacks; only one remains.' };
  }

  const lane = structuralLane(text, sourceLine, pass);
  if (!lane) return { ok: false, text, message: 'The active music line no longer exists.' };
  const cleared = clearBolRange(
    lane.parsed.assignments,
    lane.parsed.coveredBy,
    ordinal,
    ordinal + span - 1
  );
  const assignments = cleared.assignments;
  const coveredBy = cleared.coveredBy;
  assignments[ordinal] = kind;
  if (kind === 'diri' && span === 2) coveredBy[ordinal + 1] = ordinal;

  const formatted = formatBolLane(lane.musicLine, assignments, coveredBy);
  const written = writeBolLane(text, sourceLine, formatted.text, { pass });
  if (!written.ok) return written;
  const nextOrdinal = Math.min(info.attacks.length, ordinal + span);
  const nextCursor = pass > 1
    ? { sourceLine, ordinal: nextOrdinal, pass }
    : { sourceLine, ordinal: nextOrdinal };
  return {
    ...written,
    cursor: nextCursor,
    selection: bolCursorSelection(written.text, nextCursor),
    message: `${kind === 'diri' ? 'Diri' : kind} written to bol pass ${pass}. ${captureStatus(info.attacks.length, nextOrdinal)}`,
  };
}

export function moveBolCursor(text, cursor, delta) {
  const sourceLine = Number(cursor?.sourceLine);
  const pass = cursorPass(cursor);
  const info = attacksForLine(text, sourceLine);
  if (!info.attacks.length) {
    return { ok: false, cursor, message: 'The active music line no longer has note attacks.' };
  }
  const ordinal = Math.max(0, Math.min(info.attacks.length, Number(cursor?.ordinal || 0) + delta));
  const nextCursor = pass > 1 ? { sourceLine, ordinal, pass } : { sourceLine, ordinal };
  return {
    ok: true,
    text,
    cursor: nextCursor,
    selection: bolCursorSelection(text, nextCursor),
    message: captureStatus(info.attacks.length, ordinal),
  };
}

function numberFirstBolLane(text, sourceLine) {
  const lane = findBolLane(text, sourceLine, 1);
  if (lane.laneIndex < 0 || lane.prefix !== '>') return text;
  const lines = [...lane.lines];
  lines[lane.laneIndex] = lines[lane.laneIndex].replace(/^(\s*)>(?=\s|$)/, '$1>1');
  return lines.join(lane.eol);
}

export function switchBolPass(text, cursor, pass) {
  const sourceLine = Number(cursor?.sourceLine);
  const targetPass = Math.max(1, Number(pass) || 1);
  const info = attacksForLine(text, sourceLine);
  if (!info.attacks.length) {
    return { ok: false, text, cursor, message: 'The active music line no longer has note attacks.' };
  }
  let nextText = targetPass > 1 ? numberFirstBolLane(text, sourceLine) : text;
  const lane = structuralLane(nextText, sourceLine, targetPass);
  if (!lane) return { ok: false, text, cursor, message: 'The active music line no longer exists.' };
  const formatted = formatBolLane(lane.musicLine, lane.parsed.assignments, lane.parsed.coveredBy);
  const written = writeBolLane(nextText, sourceLine, formatted.text, { pass: targetPass });
  if (!written.ok) return { ...written, cursor };
  const nextCursor = targetPass > 1
    ? { sourceLine, ordinal: 0, pass: targetPass }
    : { sourceLine, ordinal: 0 };
  return {
    ...written,
    cursor: nextCursor,
    selection: bolCursorSelection(written.text, nextCursor),
    message: `Bol pass ${targetPass} ready. ${captureStatus(info.attacks.length, 0)}`,
  };
}

export function captureStatus(total, ordinal) {
  const done = Math.max(0, Math.min(total, Number(ordinal) || 0));
  return done >= total
    ? `Complete: ${total}/${total} attacks. Use ← to review or Esc to edit the > line directly.`
    : `Attack ${done + 1} of ${total}.`;
}

export function applyBolCaptureKey(text, cursor, key) {
  if (/^[1-9]$/.test(key)) {
    return { handled: true, ...switchBolPass(text, cursor, Number(key)) };
  }
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
      selection: bolCursorSelection(text, cursor),
      message: 'Written hold markers are already mirrored in the > line. Use ←/→ to move between attacks.',
    };
  }
  const kind = INSERT_KEYS.get(key);
  if (!kind) return { handled: false, ok: true, text, cursor };
  return { handled: true, ...setBolAtCursor(text, cursor, kind) };
}
