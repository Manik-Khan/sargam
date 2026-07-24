import { scanRepeatedSlideAt } from './repeated-slide.js';
// src/engine/meter.js — local meter/layakari spans authored from a text
// selection. The written music remains the tala authority, while meter spans
// are structural local-grid data: they validate attacks, render guide lines,
// and schedule audible subdivision ticks without changing the surrounding
// matra count.

const NOTE_CHARS = new Set(['S', 'r', 'R', 'g', 'G', 'm', 'M', 'P', 'd', 'D', 'n', 'N']);
const CLUSTER_RE = /^[SrRgGmMPdDnN.'~-]+$/;

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

export function rational(n, d = 1) {
  const nn = Number(n);
  const dd = Number(d);
  if (!Number.isInteger(nn) || !Number.isInteger(dd) || dd === 0) return null;
  const sign = dd < 0 ? -1 : 1;
  const g = gcd(nn, dd);
  return { n: (nn / g) * sign, d: Math.abs(dd / g) };
}

export function addRational(a, b) {
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function subRational(a, b) {
  return rational(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mulRational(a, b) {
  return rational(a.n * b.n, a.d * b.d);
}

export function divRational(a, b) {
  return b.n === 0 ? null : rational(a.n * b.d, a.d * b.n);
}

export function compareRational(a, b) {
  return Math.sign(a.n * b.d - b.n * a.d);
}

export function equalRational(a, b) {
  return compareRational(a, b) === 0;
}

export function rationalNumber(value) {
  return value ? value.n / value.d : NaN;
}

export function formatRational(value) {
  if (!value) return '';
  return value.d === 1 ? String(value.n) : `${value.n}/${value.d}`;
}

export function parseRational(text) {
  const match = String(text ?? '').trim().match(/^(\d+)(?:\/(\d+))?$/);
  if (!match) return null;
  return rational(Number(match[1]), Number(match[2] || 1));
}

export function parseMeterValue(text) {
  const label = String(text ?? '').trim();
  const ratio = parseRational(label);
  if (!ratio || ratio.n <= 0 || ratio.d <= 0) {
    return { ok: false, message: 'Meter must be a positive value such as 3, 6, 5/7, or 4/3.' };
  }
  return {
    ok: true,
    label: formatRational(ratio),
    numerator: ratio.n,
    denominator: ratio.d,
    unit: rational(ratio.d, ratio.n),
  };
}

function lineRange(text, position) {
  const safe = Math.max(0, Math.min(text.length, position));
  const start = text.lastIndexOf('\n', Math.max(0, safe - 1)) + 1;
  const nl = text.indexOf('\n', safe);
  const end = nl === -1 ? text.length : nl;
  return { start, end, line: text.slice(0, start).split('\n').length, text: text.slice(start, end) };
}

function atomAttacks(token, baseIndex, matraStart, scale = rational(1, 1)) {
  if (!CLUSTER_RE.test(token)) return { attacks: [], error: `Unsupported token '${token}' in meter selection.` };
  const atoms = [];
  let octave = 0;
  let kanBoundary = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === '~') {
      if (atoms.some((a) => a.type === 'note') && i < token.length - 1) kanBoundary = atoms.length;
      continue;
    }
    if (c === "'") { octave += 1; continue; }
    if (c === '.') { octave -= 1; continue; }
    if (c === '-') {
      const last = atoms[atoms.length - 1];
      if (last) last.w += 1;
      else atoms.push({ type: 'hold', w: 1, index: baseIndex + i });
      continue;
    }
    if (NOTE_CHARS.has(c)) {
      atoms.push({ type: 'note', w: 1, index: baseIndex + i, ch: c, octave });
      octave = 0;
      continue;
    }
    return { attacks: [], error: `Unsupported character '${c}' in meter selection.` };
  }
  const timed = kanBoundary > 0 ? atoms.slice(kanBoundary) : atoms;
  const total = timed.reduce((sum, atom) => sum + atom.w, 0);
  if (total <= 0) return { attacks: [] };
  let cursor = rational(0, 1);
  const attacks = [];
  for (const atom of timed) {
    if (atom.type === 'note') {
      attacks.push({
        index: atom.index,
        ch: atom.ch,
        time: addRational(matraStart, mulRational(scale, cursor)),
      });
    }
    cursor = addRational(cursor, rational(atom.w, total));
  }
  return { attacks };
}

function scanBracket(inner, innerBase, matraStart) {
  const matches = [...inner.matchAll(/[^\s/]+/g)];
  if (matches.length === 0) return { attacks: [] };
  const attacks = [];
  const slotScale = rational(1, matches.length);
  for (let slot = 0; slot < matches.length; slot++) {
    const token = matches[slot][0];
    if (token === '.' || /^-+$/.test(token)) continue;
    const start = addRational(matraStart, rational(slot, matches.length));
    const scanned = atomAttacks(token, innerBase + matches[slot].index, start, slotScale);
    if (scanned.error) return scanned;
    attacks.push(...scanned.attacks);
  }
  return { attacks };
}

/**
 * Lightweight source scanner for authoring meter spans. It mirrors the written
 * timing rules that matter to selection: plain clusters, explicit dash slots,
 * [ ] one-beat groups, [[ ]] krintan wrappers, phrase/meend wrappers, rests,
 * and whole-matra sustains. It rejects `_` because that duration depends on tal.
 */
export function scanMusicLine(source) {
  const text = String(source ?? '');
  const attacks = [];
  let time = rational(0, 1);
  let i = 0;
  const prefix = text.slice(i).match(/^\s*@\d+\s*/);
  if (prefix) i += prefix[0].length;
  if (text.slice(i).startsWith('||:')) i += 3;

  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c) || c === '/' || c === '|' || c === '(' || c === ')' || c === '~') { i++; continue; }
    if (c === 'x' && /^x\d+/.test(text.slice(i))) {
      i += text.slice(i).match(/^x\d+/)[0].length;
      continue;
    }
    if (c === '[' && text[i + 1] === '[') { i += 2; continue; }
    if (c === ']' && text[i + 1] === ']') { i += 2; continue; }
    if (c === '[') {
      const close = text.indexOf(']', i + 1);
      if (close === -1) return { attacks, duration: time, error: '[ without closing ] in meter selection.' };
      const scanned = scanBracket(text.slice(i + 1, close), i + 1, time);
      if (scanned.error) return { attacks, duration: time, error: scanned.error };
      attacks.push(...scanned.attacks);
      time = addRational(time, rational(1, 1));
      i = close + 1;
      continue;
    }
    // SARGAM_REPEATED_SLIDE_ANCHOR_SCAN_2026_07_20 — keep score anchors and meter selections aware
    // that repeated local approaches still form one timed matra.
    const repeatedSlide = scanRepeatedSlideAt(text, i);
    if (repeatedSlide) {
      const totalSlots = repeatedSlide.groups.reduce((sum, group) => sum + group.slots, 0);
      let slot = 0;
      for (const group of repeatedSlide.groups) {
        attacks.push({
          index: group.destinationIndex,
          ch: group.destination.ch,
          time: addRational(time, rational(slot, totalSlots)),
        });
        slot += group.slots;
      }
      time = addRational(time, rational(1, 1));
      i = repeatedSlide.next;
      continue;
    }
    if (c === '{') {
      const close = text.indexOf('}', i + 1);
      if (close === -1) return { attacks, duration: time, error: '{ without closing } in meter selection.' };
      i = close + 1; // Grace notes carry no metric time; destination is scanned next.
      continue;
    }
    if (c === '_') {
      return { attacks, duration: time, error: "The '_' hold depends on the current tal; select a passage without it for this first meter prototype." };
    }

    let j = i;
    while (j < text.length && !' \t/|[](){}'.includes(text[j])) j++;
    if (j === i) { i++; continue; }
    const token = text.slice(i, j).replace(/:\|\|$/, '');
    if (/^gat(?:@\d+(?:\.\.@\d+)?|!)?$/i.test(token) || token === ':||' || token === '') { i = j; continue; }
    if (token === '.') {
      time = addRational(time, rational(1, 1));
      i = j;
      continue;
    }
    if (/^-+$/.test(token)) {
      time = addRational(time, rational(token.length, 1));
      i = j;
      continue;
    }
    const scanned = atomAttacks(token, i, time);
    if (scanned.error) return { attacks, duration: time, error: scanned.error };
    attacks.push(...scanned.attacks);
    if (scanned.attacks.length || CLUSTER_RE.test(token)) time = addRational(time, rational(1, 1));
    i = j;
  }
  return { attacks, duration: time, error: null };
}

export function selectionToMeterRange(text, selectionStart, selectionEnd) {
  const a = Math.min(selectionStart, selectionEnd);
  const b = Math.max(selectionStart, selectionEnd);
  if (a === b) return { ok: false, message: 'Select the first through last note of the meter span.' };
  const lineA = lineRange(text, a);
  const lineB = lineRange(text, Math.max(a, b - 1));
  if (lineA.start !== lineB.start) {
    return { ok: false, message: 'A meter span must be selected within one notation line.' };
  }
  if (lineA.text.trim().startsWith('>>')) {
    return { ok: false, message: 'Select notes in the music line, not the generated meter line.' };
  }
  const scanned = scanMusicLine(lineA.text);
  if (scanned.error) return { ok: false, message: scanned.error };
  const localA = a - lineA.start;
  const localB = b - lineA.start;
  const chosen = scanned.attacks.filter((attack) => attack.index >= localA && attack.index < localB);
  if (chosen.length < 2) {
    return { ok: false, message: 'Select at least two note attacks—the first and last attacks become the arch boundaries.' };
  }
  return {
    ok: true,
    sourceLine: lineA.line,
    lineStart: lineA.start,
    lineEnd: lineA.end,
    selectionStart: a,
    selectionEnd: b,
    start: chosen[0].time,
    end: chosen[chosen.length - 1].time,
    attacks: chosen,
    allAttacks: scanned.attacks,
  };
}

function isIntegerRational(value) {
  return Boolean(value && value.d === 1);
}

export function validateMeterRange(range, meter) {
  if (!range?.ok || !meter?.ok) return { ok: false, message: range?.message || meter?.message || 'Invalid meter span.' };
  if (!Array.isArray(range.attacks) || range.attacks.length < 2) {
    return { ok: false, message: 'A meter span must contain at least two note attacks.' };
  }
  for (const attack of range.attacks) {
    const steps = divRational(subRational(attack.time, range.start), meter.unit);
    if (!isIntegerRational(steps)) {
      return {
        ok: false,
        message: `${attack.ch} is off the ${meter.label} grid at ${formatRational(attack.time)} matras from the line start.`,
      };
    }
  }
  const totalSteps = divRational(subRational(range.end, range.start), meter.unit);
  if (!isIntegerRational(totalSteps)) {
    return { ok: false, message: `The selected landing does not fall on the ${meter.label} grid.` };
  }
  return { ok: true, steps: totalSteps.n };
}

function spanOverlap(a, b) {
  return compareRational(a.start, b.end) < 0 && compareRational(b.start, a.end) < 0;
}

function parseLaneEntries(raw, sourceLine, laneLine, sourceText) {
  const entries = String(raw ?? '').trim().replace(/^>>\s*/, '');
  if (!entries) return { spans: [], problems: [] };
  const spans = [];
  const problems = [];
  const scanned = scanMusicLine(sourceText);
  if (scanned.error) problems.push({ line: laneLine, col: null, msg: scanned.error });
  for (const piece of entries.split(';')) {
    const item = piece.trim();
    if (!item) continue;
    const match = item.match(/^(\d+(?:\/\d+)?)\s+@?(\d+(?:\/\d+)?)\.\.@?(\d+(?:\/\d+)?)$/);
    if (!match) {
      problems.push({ line: laneLine, col: null, msg: `meter entry '${item}' should look like 4/3 @0..3/2` });
      continue;
    }
    const meter = parseMeterValue(match[1]);
    const start = parseRational(match[2]);
    const end = parseRational(match[3]);
    if (!meter.ok || !start || !end || compareRational(start, end) >= 0) {
      problems.push({ line: laneLine, col: null, msg: `invalid meter entry '${item}'` });
      continue;
    }
    const attacks = scanned.attacks.filter(
      (attack) => compareRational(attack.time, start) >= 0 && compareRational(attack.time, end) <= 0,
    );
    const range = { ok: true, start, end, attacks };
    const validation = validateMeterRange(range, meter);
    if (!validation.ok) problems.push({ line: laneLine, col: null, msg: validation.message });
    spans.push({
      sourceLine,
      laneLine,
      label: meter.label,
      numerator: meter.numerator,
      denominator: meter.denominator,
      unit: meter.unit,
      start,
      end,
      valid: validation.ok,
      message: validation.ok ? null : validation.message,
    });
  }
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (spanOverlap(spans[i], spans[j])) {
        problems.push({ line: laneLine, col: null, msg: 'meter spans on one line may touch, but may not overlap' });
      }
    }
  }
  return { spans, problems };
}

export function parseMeterDocument(text) {
  const lines = String(text ?? '').split('\n');
  const spans = [];
  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('>>')) continue;
    let musicIndex = i - 1;
    while (musicIndex >= 0 && lines[musicIndex].trim().startsWith('>>')) musicIndex--;
    if (musicIndex < 0 || lines[musicIndex].trim() === '') {
      problems.push({ line: i + 1, col: null, msg: 'meter line has no music line above it' });
      continue;
    }
    const parsed = parseLaneEntries(lines[i], musicIndex + 1, i + 1, lines[musicIndex]);
    spans.push(...parsed.spans);
    problems.push(...parsed.problems);
  }
  return { spans, problems };
}

/**
 * Convert both legacy `>>` lanes and score-authored meter anchors into one
 * structural model. Anchor endpoints are already repairable exact metric
 * times, so the scheduler and Rhythm Grid do not need to know how the span
 * was authored.
 */
export function structuralMeterSpans(laneSpans = [], anchorMarks = []) {
  const spans = [...(laneSpans || [])];
  for (const mark of anchorMarks || []) {
    if (mark?.kind !== 'meter' || mark.status === 'missing' || mark.status === 'ambiguous') continue;
    const meter = parseMeterValue(mark.value);
    const startEndpoint = mark.resolvedStart || mark.start;
    const endEndpoint = mark.resolvedEnd || mark.end;
    const start = parseRational(startEndpoint?.time);
    const end = parseRational(endEndpoint?.time);
    if (!meter.ok || !start || !end || compareRational(start, end) >= 0) continue;
    spans.push({
      sourceLine: Number(startEndpoint.sourceLine),
      label: meter.label,
      numerator: meter.numerator,
      denominator: meter.denominator,
      unit: meter.unit,
      start,
      end,
      valid: true,
      anchorId: mark.id,
    });
  }
  return spans;
}

/**
 * Exact local subdivision positions inside one written matra. Matra heads are
 * omitted because the tala scheduler already owns that tick.
 */
export function meterTicksForMatra(spans, sourceLine, matraIndex) {
  const head = rational(matraIndex, 1);
  const tail = rational(matraIndex + 1, 1);
  const ticks = new Map();
  for (const span of spans || []) {
    if (Number(span?.sourceLine) !== Number(sourceLine) || span.valid === false || !span.unit) continue;
    const total = divRational(subRational(span.end, span.start), span.unit);
    if (!total) continue;
    const limit = Math.min(512, Math.floor(rationalNumber(total) + 1e-9));
    for (let step = 0; step <= limit; step++) {
      const point = addRational(span.start, mulRational(span.unit, rational(step, 1)));
      if (compareRational(point, head) <= 0 || compareRational(point, tail) >= 0) continue;
      if (compareRational(point, span.end) > 0) continue;
      const offset = subRational(point, head);
      ticks.set(formatRational(offset), { offset, label: span.label });
    }
  }
  return [...ticks.values()].sort((a, b) => compareRational(a.offset, b.offset));
}

function formatSpan(span) {
  return `${span.label} @${formatRational(span.start)}..${formatRational(span.end)}`;
}

function updateLane(text, sourceLine, updater) {
  const lines = String(text ?? '').split('\n');
  const musicIndex = sourceLine - 1;
  if (musicIndex < 0 || musicIndex >= lines.length) return { ok: false, message: 'Could not locate the selected music line.' };
  const laneIndex = musicIndex + 1 < lines.length && lines[musicIndex + 1].trim().startsWith('>>') ? musicIndex + 1 : -1;
  const existing = laneIndex === -1 ? [] : parseLaneEntries(lines[laneIndex], sourceLine, laneIndex + 1, lines[musicIndex]).spans;
  const next = updater(existing).sort((a, b) => compareRational(a.start, b.start));
  if (next.length === 0) {
    if (laneIndex !== -1) lines.splice(laneIndex, 1);
  } else {
    const lane = `>> ${next.map(formatSpan).join('; ')}`;
    if (laneIndex === -1) lines.splice(musicIndex + 1, 0, lane);
    else lines[laneIndex] = lane;
  }
  return { ok: true, text: lines.join('\n'), spans: next };
}

export function applyMeterToSelection(text, selectionStart, selectionEnd, meterText) {
  const meter = parseMeterValue(meterText);
  if (!meter.ok) return meter;
  const range = selectionToMeterRange(text, selectionStart, selectionEnd);
  if (!range.ok) return range;
  const validation = validateMeterRange(range, meter);
  if (!validation.ok) return validation;
  const span = {
    sourceLine: range.sourceLine,
    label: meter.label,
    numerator: meter.numerator,
    denominator: meter.denominator,
    unit: meter.unit,
    start: range.start,
    end: range.end,
    valid: true,
  };
  const updated = updateLane(text, range.sourceLine, (existing) => [
    ...existing.filter((old) => !spanOverlap(old, span) && !(equalRational(old.start, span.start) && equalRational(old.end, span.end))),
    span,
  ]);
  if (!updated.ok) return updated;
  return {
    ok: true,
    text: updated.text,
    span,
    selectionStart: range.selectionStart,
    selectionEnd: range.selectionEnd,
    message: `${meter.label} meter applied across ${validation.steps} local grid step${validation.steps === 1 ? '' : 's'}; playback and Rhythm Grid now follow it.`,
  };
}

export function clearMeterFromSelection(text, selectionStart, selectionEnd) {
  const range = selectionToMeterRange(text, selectionStart, selectionEnd);
  if (!range.ok) return range;
  const target = { start: range.start, end: range.end };
  let removed = 0;
  const updated = updateLane(text, range.sourceLine, (existing) => existing.filter((span) => {
    if (!spanOverlap(span, target) && !equalRational(span.start, target.start) && !equalRational(span.end, target.end)) return true;
    removed++;
    return false;
  }));
  if (!updated.ok) return updated;
  if (removed === 0) return { ok: false, message: 'No meter span crosses the selected passage.' };
  return {
    ok: true,
    text: updated.text,
    selectionStart: range.selectionStart,
    selectionEnd: range.selectionEnd,
    message: `Cleared ${removed} meter span${removed === 1 ? '' : 's'}.`,
  };
}

export function previewMeterSelection(text, selectionStart, selectionEnd, meterText = '') {
  const range = selectionToMeterRange(text, selectionStart, selectionEnd);
  if (!range.ok) return range;
  const meter = String(meterText ?? '').trim() ? parseMeterValue(meterText) : null;
  const validation = meter?.ok ? validateMeterRange(range, meter) : null;
  return {
    ok: true,
    sourceLine: range.sourceLine,
    start: range.start,
    end: range.end,
    label: meter?.ok ? meter.label : 'meter',
    valid: validation ? validation.ok : true,
    message: validation && !validation.ok ? validation.message : null,
  };
}
