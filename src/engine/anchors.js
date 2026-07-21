// src/engine/anchors.js — portable, versioned musical anchors stored inside
// the Markdown file. The rendered notation is the normal authoring surface;
// this module owns the generated metadata, stable musical context, repair, and
// exact point/span records without depending on CodeMirror or browser DOM.

import {
  compareRational,
  formatRational,
  parseMeterValue,
  parseRational,
  scanMusicLine,
} from './meter.js';

export const ANCHOR_VERSION = 1;
export const ANCHOR_OPEN = '<!-- sargam-anchors:v1';
export const ANCHOR_CLOSE = '-->';
const BLOCK_RE = /<!--\s*sargam-anchors:v1[^\S\r\n]*(?:\r?\n)([\s\S]*?)(?:\r?\n)-->(?:\r?\n)?$/;
const POINT_KINDS = new Set(['da', 'ra', 'chikari']);
const SPAN_KINDS = new Set(['diri', 'meter', 'text']);

function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function normalizedMusicLine(line) {
  return String(line ?? '')
    .replace(/^\s*@\d+\s*/, '')
    .replace(/\|\|:|:\|\|/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function metadataRange(text) {
  const source = String(text ?? '');
  const match = source.match(BLOCK_RE);
  if (!match) return null;
  return { from: match.index, to: source.length, json: match[1] };
}

export function parseAnchorMetadata(text) {
  const range = metadataRange(text);
  if (!range) return { version: ANCHOR_VERSION, marks: [], range: null, problems: [] };
  try {
    const data = JSON.parse(range.json);
    if (!data || data.version !== ANCHOR_VERSION || !Array.isArray(data.marks)) {
      return {
        version: ANCHOR_VERSION,
        marks: [],
        range,
        problems: [{ line: null, col: null, msg: 'generated anchor metadata has an unsupported shape or version' }],
      };
    }
    return { version: ANCHOR_VERSION, marks: data.marks, range, problems: [] };
  } catch (error) {
    return {
      version: ANCHOR_VERSION,
      marks: [],
      range,
      problems: [{ line: null, col: null, msg: `generated anchor metadata is not valid JSON: ${error.message}` }],
    };
  }
}

export function stripAnchorMetadata(text) {
  const source = String(text ?? '');
  const range = metadataRange(source);
  if (!range) return source;
  // writeAnchorMetadata always inserts exactly two separator line endings.
  // Remove those generated separators—and nothing else—so placing or
  // removing an annotation never normalizes the musician's source text.
  let cut = range.from;
  for (let i = 0; i < 2; i++) {
    if (source.slice(Math.max(0, cut - 2), cut) === '\r\n') cut -= 2;
    else if (source[cut - 1] === '\n') cut -= 1;
  }
  return source.slice(0, cut);
}

export function writeAnchorMetadata(text, marks) {
  const clean = stripAnchorMetadata(text);
  if (!marks?.length) return clean;
  const eol = clean.includes('\r\n') ? '\r\n' : '\n';
  const body = JSON.stringify({ version: ANCHOR_VERSION, marks }, null, 2).replace(/\n/g, eol);
  return `${clean}${eol}${eol}${ANCHOR_OPEN}${eol}${body}${eol}${ANCHOR_CLOSE}${eol}`;
}

function sourceLinesWithoutMetadata(text) {
  return stripAnchorMetadata(text).split(/\r?\n/);
}

export function attacksForLine(text, sourceLine) {
  const lines = sourceLinesWithoutMetadata(text);
  const line = lines[sourceLine - 1] ?? '';
  // Repeat closers are structure, not attacks. The older meter scanner
  // predates score-side anchors and can otherwise report ':' as a token.
  const scanLine = line.replace(/\|\|:|:\|\|/g, ' ');
  const scanned = scanMusicLine(scanLine);
  if (scanned.error) return { line, attacks: [], duration: scanned.duration, error: scanned.error };
  const notes = scanned.attacks.map((attack, ordinal, all) => ({
    ...attack,
    ordinal,
    timeLabel: formatRational(attack.time),
    before: all[ordinal - 1]?.ch ?? null,
    after: all[ordinal + 1]?.ch ?? null,
  }));
  return { line, attacks: notes, duration: scanned.duration, error: null };
}

export function endpointFromGesture(text, gesture) {
  const sourceLine = Number(gesture?.sourceLine);
  const ordinal = Number(gesture?.ordinal);
  const time = String(gesture?.time ?? '');
  const kind = gesture?.anchorKind === 'boundary' ? 'boundary' : 'attack';
  const info = attacksForLine(text, sourceLine);
  const lineKey = hashText(normalizedMusicLine(info.line));
  if (kind === 'boundary') {
    return {
      kind,
      sourceLine,
      time,
      lineKey,
      boundary: gesture?.boundary ?? null,
    };
  }
  const attack = info.attacks[ordinal] || info.attacks.find((item) => item.timeLabel === time && item.ch === gesture?.note);
  if (!attack) return null;
  return {
    kind: 'attack',
    sourceLine,
    time: attack.timeLabel,
    ordinal: attack.ordinal,
    note: attack.ch,
    octave: Number(gesture?.octave || 0),
    before: attack.before,
    after: attack.after,
    lineKey,
  };
}

function nextMarkId(marks) {
  let max = 0;
  for (const mark of marks || []) {
    const match = String(mark.id || '').match(/^a(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `a${max + 1}`;
}

function orderedEndpoints(a, b) {
  if (!a || !b) return [a, b];
  if (a.sourceLine !== b.sourceLine) return a.sourceLine < b.sourceLine ? [a, b] : [b, a];
  const ar = parseRational(a.time);
  const br = parseRational(b.time);
  if (!ar || !br) return [a, b];
  return compareRational(ar, br) <= 0 ? [a, b] : [b, a];
}

export function addAnchorMark(text, request) {
  const model = parseAnchorMetadata(text);
  if (model.problems.length) return { ok: false, text, message: model.problems[0].msg };
  const kind = String(request?.kind || '').toLowerCase();
  if (!POINT_KINDS.has(kind) && !SPAN_KINDS.has(kind)) {
    return { ok: false, text, message: `Unknown annotation '${kind}'.` };
  }
  let start = endpointFromGesture(text, request.start);
  let end = request.end ? endpointFromGesture(text, request.end) : null;
  if (!start) return { ok: false, text, message: 'The annotation did not land on a musical attack or boundary.' };
  if (POINT_KINDS.has(kind) && start.kind !== 'attack') {
    return { ok: false, text, message: `${kind} attaches to a struck note.` };
  }
  if (kind === 'diri') {
    if (!end || start.kind !== 'attack' || end.kind !== 'attack') {
      return { ok: false, text, message: 'Diri connects two consecutive struck notes.' };
    }
    [start, end] = orderedEndpoints(start, end);
    if (start.sourceLine !== end.sourceLine || end.ordinal !== start.ordinal + 1) {
      return { ok: false, text, message: 'Diri connects exactly two consecutive attacks.' };
    }
  }
  if (kind === 'meter') {
    const meter = parseMeterValue(request.value);
    if (!meter.ok) return { ok: false, text, message: meter.message };
    if (!end) return { ok: false, text, message: 'Drag from the first through the landing attack or boundary.' };
    [start, end] = orderedEndpoints(start, end);
    if (start.sourceLine !== end.sourceLine) {
      return { ok: false, text, message: 'This first anchor version keeps a meter span on one source line.' };
    }
    request = { ...request, value: meter.label };
  }
  const mark = {
    id: nextMarkId(model.marks),
    kind,
    start,
    ...(end ? { end } : {}),
    ...(request.value ? { value: String(request.value) } : {}),
    ...(request.text ? { text: String(request.text) } : {}),
  };
  const marks = [...model.marks, mark];
  return { ok: true, text: writeAnchorMetadata(text, marks), mark, marks, message: `${kind} placed.` };
}

export function removeAnchorMark(text, id) {
  const model = parseAnchorMetadata(text);
  const marks = model.marks.filter((mark) => mark.id !== id);
  if (marks.length === model.marks.length) return { ok: false, text, message: 'Select an annotation first.' };
  return { ok: true, text: writeAnchorMetadata(text, marks), marks, message: 'Annotation removed.' };
}

export function updateAnchorMark(text, id, side, gesture) {
  const model = parseAnchorMetadata(text);
  const index = model.marks.findIndex((mark) => mark.id === id);
  if (index === -1) return { ok: false, text, message: 'That annotation no longer exists.' };
  const endpoint = endpointFromGesture(text, gesture);
  if (!endpoint) return { ok: false, text, message: 'The handle must snap to an attack or boundary.' };
  const next = { ...model.marks[index], [side === 'end' ? 'end' : 'start']: endpoint };
  if (next.kind === 'diri') {
    const [a, b] = orderedEndpoints(next.start, next.end);
    if (!a || !b || a.kind !== 'attack' || b.kind !== 'attack' || a.sourceLine !== b.sourceLine || b.ordinal !== a.ordinal + 1) {
      return { ok: false, text, message: 'Diri must still connect two consecutive attacks.' };
    }
    next.start = a; next.end = b;
  }
  if (next.kind === 'meter') {
    const [a, b] = orderedEndpoints(next.start, next.end);
    if (!a || !b || a.sourceLine !== b.sourceLine) return { ok: false, text, message: 'Meter handles must remain on one source line.' };
    next.start = a; next.end = b;
  }
  const marks = model.marks.slice();
  marks[index] = next;
  return { ok: true, text: writeAnchorMetadata(text, marks), marks, mark: next, message: 'Annotation moved.' };
}

function endpointCandidates(text, endpoint) {
  const lines = sourceLinesWithoutMetadata(text);
  const candidates = [];
  const inspect = (lineNo) => {
    if (lineNo < 1 || lineNo > lines.length) return;
    const info = attacksForLine(text, lineNo);
    const lineKey = hashText(normalizedMusicLine(info.line));
    const distance = Math.abs(lineNo - Number(endpoint.sourceLine));
    const proximity = Math.max(0, 4 - distance);
    if (endpoint.kind === 'boundary') {
      const boundaryTime = parseRational(endpoint.time);
      const withinLine = boundaryTime && info.duration && compareRational(boundaryTime, info.duration) <= 0;
      if (withinLine) {
        let score = proximity;
        if (lineNo === Number(endpoint.sourceLine)) score += 4;
        if (lineKey === endpoint.lineKey) score += 12;
        candidates.push({ endpoint: { ...endpoint, sourceLine: lineNo, lineKey }, score });
      }
      return;
    }
    for (const attack of info.attacks) {
      let score = proximity;
      if (lineNo === Number(endpoint.sourceLine)) score += 4;
      if (attack.timeLabel === endpoint.time) score += 5;
      if (attack.ch === endpoint.note) score += 4;
      if (attack.ordinal === endpoint.ordinal) score += 2;
      if (attack.before === endpoint.before) score += 1;
      if (attack.after === endpoint.after) score += 1;
      if (lineKey === endpoint.lineKey) score += 8;
      if (score >= 9) {
        candidates.push({
          endpoint: {
            ...endpoint,
            sourceLine: lineNo,
            time: attack.timeLabel,
            ordinal: attack.ordinal,
            note: attack.ch,
            before: attack.before,
            after: attack.after,
            lineKey,
          },
          score,
        });
      }
    }
  };
  inspect(Number(endpoint.sourceLine));
  for (let delta = 1; delta <= 4; delta++) {
    inspect(Number(endpoint.sourceLine) - delta);
    inspect(Number(endpoint.sourceLine) + delta);
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export function resolveEndpoint(text, endpoint) {
  if (!endpoint) return { status: 'missing', endpoint: null };
  const candidates = endpointCandidates(text, endpoint);
  if (!candidates.length) return { status: 'missing', endpoint: null };
  const best = candidates[0];
  const tied = candidates.filter((item) => item.score === best.score);
  if (tied.length > 1) return { status: 'ambiguous', endpoint: null, candidates: tied.map((item) => item.endpoint) };
  const exact = best.endpoint.sourceLine === endpoint.sourceLine
    && best.endpoint.time === endpoint.time
    && (endpoint.kind === 'boundary' || best.endpoint.note === endpoint.note);
  return { status: exact ? 'resolved' : 'repaired', endpoint: best.endpoint };
}

export function parseAnchorDocument(text) {
  const metadata = parseAnchorMetadata(text);
  const problems = [...metadata.problems];
  const marks = metadata.marks.map((mark) => {
    const start = resolveEndpoint(text, mark.start);
    const end = mark.end ? resolveEndpoint(text, mark.end) : null;
    const statuses = [start.status, end?.status].filter(Boolean);
    let status = statuses.includes('missing') ? 'missing' : statuses.includes('ambiguous') ? 'ambiguous' : statuses.includes('repaired') ? 'repaired' : 'resolved';
    if (status === 'missing' || status === 'ambiguous') {
      problems.push({
        line: mark.start?.sourceLine ?? null,
        col: null,
        msg: `${mark.kind} anchor ${status === 'missing' ? 'no longer finds its note' : 'matches more than one nearby passage'} — select it in the score to reconnect it`,
      });
    }
    return {
      ...mark,
      status,
      resolvedStart: start.endpoint,
      resolvedEnd: end?.endpoint ?? null,
    };
  });
  return { ...metadata, marks, problems };
}

export function metadataRanges(text) {
  const range = metadataRange(text);
  return range ? [{ from: range.from, to: range.to }] : [];
}
