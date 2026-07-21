// src/engine/audio-links.js — persistent links between a selected notation
// range and one A–B loop in the always-mounted Vilambit player. The recording
// remains external; the Markdown stores only a versioned recording reference,
// exact seconds, and the same repairable musical endpoints used by anchors.

import { endpointFromGesture, metadataRange as anchorMetadataRange, resolveEndpoint } from './anchors.js';
import { scanMusicLine } from './meter.js';

export const AUDIO_LINK_VERSION = 1;
export const AUDIO_LINK_OPEN = '<!-- sargam-audio-links:v1';
export const AUDIO_LINK_CLOSE = '-->';
const BLOCK_RE = /<!--\s*sargam-audio-links:v1[^\S\r\n]*(?:\r?\n)([\s\S]*?)(?:\r?\n)-->(?:\r?\n)?/;

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMillis(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function recordingReference(player) {
  const source = player?.source;
  const duration = finite(player?.duration);
  if (!player?.loaded || !source || duration == null || duration <= 0) return null;
  const name = String(source.name || '').trim();
  const kind = source.kind === 'video' ? 'video' : 'audio';
  const normalizedDuration = roundMillis(duration);
  if (!name) return null;
  return {
    key: hashText(`${kind}\n${name}\n${normalizedDuration}`),
    name,
    kind,
    duration: normalizedDuration,
  };
}

export function recordingMatches(reference, player) {
  const current = recordingReference(player);
  return Boolean(reference?.key && current?.key && reference.key === current.key);
}

export function audioLinkMetadataRange(text) {
  const source = String(text ?? '');
  const match = BLOCK_RE.exec(source);
  if (!match) return null;
  return { from: match.index, to: match.index + match[0].length, json: match[1] };
}

export function parseAudioLinkMetadata(text) {
  const range = audioLinkMetadataRange(text);
  if (!range) return { version: AUDIO_LINK_VERSION, links: [], range: null, problems: [] };
  try {
    const data = JSON.parse(range.json);
    if (!data || data.version !== AUDIO_LINK_VERSION || !Array.isArray(data.links)) {
      return {
        version: AUDIO_LINK_VERSION,
        links: [],
        range,
        problems: [{ line: null, col: null, msg: 'generated audio-link metadata has an unsupported shape or version' }],
      };
    }
    return { version: AUDIO_LINK_VERSION, links: data.links, range, problems: [] };
  } catch (error) {
    return {
      version: AUDIO_LINK_VERSION,
      links: [],
      range,
      problems: [{ line: null, col: null, msg: `generated audio-link metadata is not valid JSON: ${error.message}` }],
    };
  }
}

export function stripAudioLinkMetadata(text) {
  const source = String(text ?? '');
  const range = audioLinkMetadataRange(source);
  if (!range) return source;
  let from = range.from;
  let to = range.to;
  const after = source.slice(to);
  // When anchors follow, remove the two generated separators after the audio
  // block. When audio links are the final generated block, remove the two
  // generated separators before it instead. User-authored music bytes remain.
  const followingAnchor = after.match(/^(?:\r?\n){1,2}<!--\s*sargam-anchors:v1/);
  if (followingAnchor) {
    to += followingAnchor[0].indexOf('<!--');
  } else {
    for (let i = 0; i < 2; i++) {
      if (source.slice(Math.max(0, from - 2), from) === '\r\n') from -= 2;
      else if (source[from - 1] === '\n') from -= 1;
    }
  }
  return source.slice(0, from) + source.slice(to);
}

export function writeAudioLinkMetadata(text, links) {
  const clean = stripAudioLinkMetadata(text);
  if (!links?.length) return clean;
  const eol = clean.includes('\r\n') ? '\r\n' : '\n';
  const body = JSON.stringify({ version: AUDIO_LINK_VERSION, links }, null, 2).replace(/\n/g, eol);
  const block = `${AUDIO_LINK_OPEN}${eol}${body}${eol}${AUDIO_LINK_CLOSE}${eol}`;
  const anchorRange = anchorMetadataRange(clean);
  if (anchorRange) {
    return `${clean.slice(0, anchorRange.from)}${block}${eol}${clean.slice(anchorRange.from)}`;
  }
  return `${clean}${eol}${eol}${block}`;
}

function lineRange(text, pos) {
  const source = String(text ?? '');
  const safe = Math.max(0, Math.min(source.length, Number(pos) || 0));
  const start = source.lastIndexOf('\n', safe - 1) + 1;
  const newline = source.indexOf('\n', safe);
  const end = newline === -1 ? source.length : newline;
  const line = source.slice(0, start).split('\n').length;
  return { start, end, line, text: source.slice(start, end).replace(/\r$/, '') };
}

export function selectionToAudioAnchorRange(text, selectionStart, selectionEnd) {
  const a = Math.min(Number(selectionStart) || 0, Number(selectionEnd) || 0);
  const b = Math.max(Number(selectionStart) || 0, Number(selectionEnd) || 0);
  if (a === b) return { ok: false, message: 'Select the notation phrase to link.' };
  const lineA = lineRange(text, a);
  const lineB = lineRange(text, Math.max(a, b - 1));
  if (lineA.start !== lineB.start) {
    return { ok: false, message: 'The first audio-link version keeps a linked phrase on one notation line.' };
  }
  if (/^\s*(?:<!--|>>|lyrics:|bols:)/i.test(lineA.text)) {
    return { ok: false, message: 'Select notes in a music line.' };
  }
  const scanLine = lineA.text.replace(/\|\|:|:\|\|/g, (token) => ' '.repeat(token.length));
  const scanned = scanMusicLine(scanLine);
  if (scanned.error) return { ok: false, message: scanned.error };
  const localA = a - lineA.start;
  const localB = b - lineA.start;
  const chosen = scanned.attacks.filter((attack) => attack.index >= localA && attack.index < localB);
  if (!chosen.length) return { ok: false, message: 'The selection must contain at least one struck note.' };
  const first = chosen[0];
  const last = chosen[chosen.length - 1];
  const firstOrdinal = scanned.attacks.indexOf(first);
  const lastOrdinal = scanned.attacks.indexOf(last);
  const start = endpointFromGesture(text, {
    anchorKind: 'attack', sourceLine: lineA.line, ordinal: firstOrdinal, time: first.time, note: first.ch,
  });
  const end = endpointFromGesture(text, {
    anchorKind: 'attack', sourceLine: lineA.line, ordinal: lastOrdinal, time: last.time, note: last.ch,
  });
  if (!start || !end) return { ok: false, message: 'Could not resolve the selected notation attacks.' };
  return {
    ok: true,
    sourceLine: lineA.line,
    selectionStart: a,
    selectionEnd: b,
    start,
    end,
    attackCount: chosen.length,
  };
}

function nextLinkId(links) {
  let max = 0;
  for (const link of links || []) {
    const match = String(link.id || '').match(/^audio(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `audio${max + 1}`;
}

export function addAudioLink(text, request) {
  const metadata = parseAudioLinkMetadata(text);
  if (metadata.problems.length) return { ok: false, text, message: metadata.problems[0].msg };
  const recording = recordingReference(request?.player);
  if (!recording) return { ok: false, text, message: 'Load a recording in Vilambit first.' };
  const loop = request?.player?.loop || {};
  const startTime = finite(loop.a);
  const endTime = finite(loop.b);
  if (!loop.ready || startTime == null || endTime == null || endTime <= startTime) {
    return { ok: false, text, message: 'Set a complete A–B loop in Vilambit first.' };
  }
  const range = selectionToAudioAnchorRange(text, request.selectionStart, request.selectionEnd);
  if (!range.ok) return { ...range, text };
  const link = {
    id: nextLinkId(metadata.links),
    recording,
    startTime: roundMillis(startTime),
    endTime: roundMillis(endTime),
    notationStart: range.start,
    notationEnd: range.end,
  };
  const links = [...metadata.links, link];
  return {
    ok: true,
    text: writeAudioLinkMetadata(text, links),
    links,
    link,
    selectionStart: range.selectionStart,
    selectionEnd: range.selectionEnd,
    message: `Linked ${range.attackCount} notation attack${range.attackCount === 1 ? '' : 's'} to ${formatSeconds(link.startTime)}–${formatSeconds(link.endTime)}.`,
  };
}

export function removeAudioLink(text, id) {
  const metadata = parseAudioLinkMetadata(text);
  const links = metadata.links.filter((link) => link.id !== id);
  if (links.length === metadata.links.length) return { ok: false, text, message: 'Select a linked phrase first.' };
  return { ok: true, text: writeAudioLinkMetadata(text, links), links, message: 'Audio link removed.' };
}

export function parseAudioLinkDocument(text) {
  const metadata = parseAudioLinkMetadata(text);
  const problems = [...metadata.problems];
  const links = metadata.links.map((link) => {
    const start = resolveEndpoint(text, link.notationStart);
    const end = resolveEndpoint(text, link.notationEnd);
    const statuses = [start.status, end.status];
    const status = statuses.includes('missing')
      ? 'missing'
      : statuses.includes('ambiguous')
        ? 'ambiguous'
        : statuses.includes('repaired')
          ? 'repaired'
          : 'resolved';
    if (status === 'missing' || status === 'ambiguous') {
      problems.push({
        line: link.notationStart?.sourceLine ?? null,
        col: null,
        msg: `audio link ${status === 'missing' ? 'no longer finds its phrase' : 'matches more than one nearby passage'} — remove it and attach the loop again`,
      });
    }
    return {
      ...link,
      status,
      resolvedStart: start.endpoint,
      resolvedEnd: end.endpoint,
    };
  });
  return { ...metadata, links, problems };
}

export function audioLinkMetadataRanges(text) {
  const range = audioLinkMetadataRange(text);
  return range ? [{ from: range.from, to: range.to }] : [];
}

function formatSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
