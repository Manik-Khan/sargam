// src/engine/serialize.js — Sargam engine: model → canonical text.
// Plain JS, no React, no DOM. Requirement (spec §2):
// parse(serialize(parse(t))) is deep-equal stable; for well-formed input,
// serialize(parse(t)) preserves meaning exactly (whitespace may normalize).
//
// Canonicalization choices (all meaning-preserving under reparse):
//   - Bars are DERIVED from tal + start offset ("derived, never typed").
//   - Whole-matra sustains emit as separate `-` tokens (`--` normalizes).
//   - Subdivided matras emit as clusters unless they contain rests, which
//     need the bracket form `[ ]`.
//   - Krintan interiors join with `/`.

import { getTal, wrapMatra, vibhagOfMatra, markerAtMatra } from './tala.js';

// Canonical header order. `composition`/`type`/`laya` added 2026-07-16 (M2.5)
// after `tempo` and before identity — Appendix A's relative order is
// untouched, so existing canonical output is byte-stable.
const KNOWN_KEYS = [
  'title',
  'raga',
  'tal',
  'sa',
  'tempo',
  'composition',
  'type',
  'laya',
  'id',
  'created',
  'modified',
];

/**
 * @param {Document} doc
 * @returns {string}
 */
export function serializeDocument(doc) {
  const out = [];

  // Header directives, canonical order, then any unknown keys. Fenced
  // (frontmatter) form is preserved when the document uses it (§3.1
  // amended 2026-07-16).
  const dirs = doc.directives || {};
  if (doc.frontmatter) out.push('---');
  for (const k of KNOWN_KEYS) {
    if (k in dirs) out.push(`${k}: ${dirs[k]}`);
  }
  for (const k of Object.keys(dirs)) {
    if (!KNOWN_KEYS.includes(k)) out.push(`${k}: ${dirs[k]}`);
  }
  if (doc.frontmatter) out.push('---');

  let runningTal = dirs.tal ?? null;
  for (const section of doc.sections || []) {
    out.push('');
    if (section.tal !== runningTal) {
      out.push(`tal: ${section.tal}`);
      out.push('');
      runningTal = section.tal;
    }
    if (section.label !== null && section.label !== undefined) {
      out.push(section.label);
    }
    const tal = section.tal !== 'free' ? getTal(section.tal) : null;
    for (const line of section.lines) {
      out.push(serializeMusicLine(line, tal));
      const lyric = serializeLyrics(line, tal);
      if (lyric !== null) out.push(lyric);
      const bol = serializeBols(line);
      if (bol !== null) out.push(bol);
    }
  }

  let text = out.join('\n');
  if (text !== '') text += '\n';
  return text;
}

// ---------------------------------------------------------------------------
// Music lines
// ---------------------------------------------------------------------------

function serializeMusicLine(line, tal) {
  // 1. Token items, each covering a matra range (holds cover several).
  const items = [];
  let k = 0;
  while (k < line.matras.length) {
    const hold = holdRunLength(line, k, tal);
    if (hold > 0) {
      items.push({ text: '_', from: k, to: k + hold - 1 });
      k += hold;
    } else {
      items.push({ text: matraToken(line, k), from: k, to: k });
      k++;
    }
  }

  // 2. Cross-matra meend: trailing ~ on the from matra's token.
  for (const span of line.spans) {
    if (span.type !== 'meend') continue;
    if (span.from.matraIndex === span.to.matraIndex) continue; // handled in matraToken
    const item = items.find((it) => it.from <= span.from.matraIndex && span.from.matraIndex <= it.to);
    if (item && !item.text.endsWith('~')) item.text += '~';
  }

  // 3. Phrase repeats.
  for (const pr of line.phraseRepeats) {
    const a = items.find((it) => it.from === pr.fromMatra);
    const b = items.find((it) => it.to === pr.toMatra);
    if (a && b) {
      a.text = '(' + a.text;
      b.text = b.text + `)x${pr.times}`;
    }
  }

  // 4. Krintan wrapping (interior joined with /).
  for (const span of line.spans) {
    if (span.type !== 'krintan') continue;
    const ai = items.findIndex((it) => it.from <= span.from.matraIndex && span.from.matraIndex <= it.to);
    const bi = items.findIndex((it) => it.from <= span.to.matraIndex && span.to.matraIndex <= it.to);
    if (ai === -1 || bi === -1) continue;
    for (let i = ai; i < bi; i++) items[i].joinNext = '/';
    items[ai].text = '[[' + items[ai].text;
    items[bi].text = items[bi].text + ']]';
  }

  // 5. Assemble with derived bars between matras at vibhag boundaries.
  const parts = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    parts.push(it.text);
    if (i === items.length - 1) break;
    if (tal && boundaryAfter(line, it.to, tal)) parts.push('|');
    parts.push(it.joinNext === '/' ? '/' : ' ');
  }
  // Bars glue without surrounding join chars; normalize spacing.
  let body = '';
  for (const p of parts) {
    if (p === '|') body += ' | ';
    else if (p === ' ') body += ' ';
    else if (p === '/') body += '/';
    else body += p;
  }
  body = body.replace(/\s+/g, ' ').replace(/\/ /g, '/').replace(/ \//g, '/').trim();

  const prefix = [];
  if (line.startMatra !== 1) prefix.push(`@${line.startMatra}`);
  if (line.lineRepeat) return `${prefix.join(' ')}${prefix.length ? ' ' : ''}||: ${body} :||`;
  return `${prefix.join(' ')}${prefix.length ? ' ' : ''}${body}`.trim();
}

/** True if a derived barline falls after 0-based matra index k. */
function boundaryAfter(line, k, tal) {
  return markerAtMatra(tal, line.startMatra + k + 1) !== null;
}

/**
 * If matra k begins a `_` hold (flagged first sustain), return the number of
 * whole-matra sustain matras the `_` covers; else 0.
 */
function holdRunLength(line, k, tal) {
  const first = line.matras[k];
  if (!isWholeSustain(first) || first.events[0].holdToVibhag !== true) return 0;
  let expected = 1;
  if (tal) {
    const pos = wrapMatra(tal, line.startMatra + k);
    const v = vibhagOfMatra(tal, pos);
    let vibhagStart = 1;
    for (let i = 0; i < v; i++) vibhagStart += tal.vibhags[i];
    expected = Math.max(1, vibhagStart + tal.vibhags[v] - pos);
  }
  let run = 1;
  while (
    run < expected &&
    k + run < line.matras.length &&
    isWholeSustain(line.matras[k + run]) &&
    line.matras[k + run].events[0].holdToVibhag !== true
  ) {
    run++;
  }
  return run;
}

function isWholeSustain(matra) {
  return (
    matra.events.length === 1 &&
    matra.events[0].type === 'sustain' &&
    matra.events[0].dur.num === matra.events[0].dur.den
  );
}

// ---------------------------------------------------------------------------
// One matra → token text
// ---------------------------------------------------------------------------

function noteAtom(ev) {
  const o = ev.octave || 0;
  const prefix = o < 0 ? '.'.repeat(-o) : o > 0 ? "'".repeat(o) : '';
  return prefix + ev.ch;
}

function lcm(a, b) {
  const g = (x, y) => (y ? g(y, x % y) : x);
  return (a * b) / g(a, b);
}

function matraToken(line, k) {
  const matraIndex = k;
  const evs = line.matras[k].events;

  // Single whole-matra event.
  if (evs.length === 1 && evs[0].dur.num === evs[0].dur.den) {
    const e = evs[0];
    if (e.type === 'note') return withinMatraTilde(line, matraIndex, [noteAtom(e)], [0]);
    if (e.type === 'rest') return '.';
    return '-';
  }

  // Subdivided matra: compute slot counts from durations.
  const L = evs.reduce((acc, e) => lcm(acc, e.dur.den), 1);
  const slots = evs.map((e) => (e.dur.num * L) / e.dur.den);
  const hasRest = evs.some((e) => e.type === 'rest');

  if (hasRest) {
    // Bracket form: each event is an atom slot plus `-` extension slots.
    const entries = [];
    evs.forEach((e, i) => {
      entries.push(e.type === 'note' ? noteAtom(e) : e.type === 'rest' ? '.' : '-');
      for (let s = 1; s < slots[i]; s++) entries.push('-');
    });
    return `[${entries.join(' ')}]`;
  }

  // Cluster form: atoms with merged `-` extensions.
  const atoms = evs.map((e, i) => {
    const base = e.type === 'note' ? noteAtom(e) : '-'.repeat(slots[i]);
    return e.type === 'note' ? base + '-'.repeat(slots[i] - 1) : base;
  });
  return withinMatraTilde(
    line,
    matraIndex,
    atoms,
    evs.map((_, i) => i)
  );
}

/** Insert `~` after the from-event's atom for meend spans within this matra. */
function withinMatraTilde(line, matraIndex, atoms, eventIndexOfAtom) {
  const span = line.spans.find(
    (s) =>
      s.type === 'meend' &&
      s.from.matraIndex === matraIndex &&
      s.to.matraIndex === matraIndex
  );
  if (!span) return atoms.join('');
  const at = eventIndexOfAtom.indexOf(span.from.eventIndex);
  if (at === -1) return atoms.join('');
  const parts = atoms.slice();
  parts[at] = parts[at] + '~';
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Lyrics and bols
// ---------------------------------------------------------------------------

function serializeLyrics(line, tal) {
  if (!line.lyrics || line.lyrics.length === 0) return null;
  const byMatra = new Map(line.lyrics.map((l) => [l.matraIndex, l.text]));

  // Segments follow the derived bars.
  const cuts = [0];
  for (let k = 0; k < line.matras.length - 1; k++) {
    if (tal && boundaryAfter(line, k, tal)) cuts.push(k + 1);
  }
  cuts.push(line.matras.length);

  const segs = [];
  for (let i = 1; i < cuts.length; i++) {
    const struck = [];
    for (let m = cuts[i - 1]; m < cuts[i]; m++) {
      if (line.matras[m].events[0]?.type === 'note') struck.push(m);
    }
    const lastWithLyric = struck.reduce((acc, m, idx) => (byMatra.has(m) ? idx : acc), -1);
    const tokens = [];
    for (let idx = 0; idx <= lastWithLyric; idx++) {
      tokens.push(byMatra.get(struck[idx]) ?? '.');
    }
    segs.push(tokens.join(' '));
  }
  return '" ' + segs.join(' | ');
}

function serializeBols(line) {
  if (!line.bols || line.bols.length === 0) return null;
  // Walk note events in order; emit the word at marked events, '.' for gaps
  // before the last marked event (spec §3.8 amended 2026-07-16).
  const byKey = new Map(line.bols.map((b) => [`${b.ref.matraIndex}:${b.ref.eventIndex}`, b.mark]));
  const noteRefs = [];
  line.matras.forEach((m, mi) => {
    m.events.forEach((e, ei) => {
      if (e.type === 'note') noteRefs.push(`${mi}:${ei}`);
    });
  });
  const lastMarked = noteRefs.reduce((acc, key, idx) => (byKey.has(key) ? idx : acc), -1);
  const tokens = [];
  for (let i = 0; i <= lastMarked; i++) {
    tokens.push(byKey.get(noteRefs[i]) ?? '.');
  }
  return '> ' + tokens.join(' ');
}
