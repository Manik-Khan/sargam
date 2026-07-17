// src/engine/render.js — Sargam engine: model → DOM.
// Plain JS. Produces DOM but never imports React (plan global constraint);
// `document` is referenced only at call time so jsdom smokes can inject it.
//
// Layout unit: the matra cell (spec §4). Each line is a CSS grid row —
// markers/arcs/glyphs/lyrics/bols live on separate grid rows sharing matra
// columns, so arcs span cells without any pixel measurement:
//   grid row 1: over-arc lane (meend arcs, krintan brackets — SVG)
//   grid row 2: matra cells (marker on top, glyphs, under-arc), barlines,
//               repeat glyphs, passthrough
//   grid row 3: lyric row
//   grid row 4: bol ticks
// Everything derived: markers and barlines from tal + start offset,
// under-arcs from subdivision, landing reports from tala.landing.

import { getTal, wrapMatra, markerAtMatra, landing } from './tala.js';
import { spellDegree } from './western.js';
import { DEFAULT_SA } from './schedule.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {Document} doc  parsed model (parse.js)
 * @param {{activeCursor?: {sectionIndex:number, lineIndex:number, matraIndex:number},
 *          activeLine?: number}} [opts]
 *   activeLine — 1-based SOURCE line the text cursor sits on; landing reports
 *   render only for that line (spec §4). activeCursor is the M3 playback seam.
 * @returns {HTMLElement} detached element; the caller mounts it
 */
export function renderDocument(doc, opts = {}) {
  const el = h('div', 'sargam-render');
  // Western note names are a DISPLAY swap only — the text stays sargam.
  // Same grid, same octave dots, same arcs; only the letter changes.
  const ctx = {
    ...opts,
    noteNames: opts.noteNames === 'western' ? 'western' : 'sargam',
    sa: doc?.directives?.sa || DEFAULT_SA,
  };
  for (let si = 0; si < (doc.sections || []).length; si++) {
    el.appendChild(renderSection(doc.sections[si], si, ctx));
  }
  return el;
}

const ACCIDENTAL = { 2: '\u266f\u266f', 1: '\u266f', 0: '', '-1': '\u266d', '-2': '\u266d\u266d' };

/** The character a note event shows: its sargam letter, or its Western
 *  name when the reader asked for that. Octave stays in the dots either
 *  way — the layout is the same page. */
function chOf(e, ctx) {
  if (!ctx || ctx.noteNames !== 'western') return e.ch;
  const p = spellDegree(ctx.sa, e.ch, 0);
  return p.step + (ACCIDENTAL[String(p.alter)] ?? '');
}

// ---------------------------------------------------------------------------
// Export view (spec §4.1) — the print artifact.
// Raga is the title; the rest of the metadata lists down the far right;
// identity directives never print. No cursor is passed, so landing reports
// (a check, not notation) do not appear.
// ---------------------------------------------------------------------------

// Three tiers, so any key M invents just works (M, 2026-07-16):
//   identity      — never prints
//   performance   — the far-right list: how it's played
//   everything else — provenance under the title: where it came from
// No allowlist to maintain: `source: AAK tape 12` appears with no code change.
const EXPORT_PERFORMANCE = [
  ['tal', 'Tal'],
  ['laya', 'Laya'],
  ['tempo', 'Tempo'],
  ['composition', 'Composition'],
  ['type', 'Type'],
  ['sa', 'Sa'],
];
const EXPORT_IDENTITY = ['id', 'created', 'modified'];
// raga and title own the headings; they never repeat in a list.
const EXPORT_HEADINGS = ['raga', 'title'];

/** C# → C♯, Bb → B♭; anything not a plain note name passes through. */
function prettyPitch(v) {
  const m = /^([A-Ga-g])([#b])$/.exec(String(v).trim());
  if (!m) return v;
  return m[1].toUpperCase() + (m[2] === '#' ? '♯' : '♭');
}

/** `composer` → `Composer`, `taught_by` → `Taught by`. */
function prettyKey(k) {
  const s = String(k).replace(/[_-]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function metaRow(label, value) {
  const row = h('div', 'sr-exp-meta-row');
  row.appendChild(h('span', 'sr-exp-meta-label', label));
  row.appendChild(h('span', 'sr-exp-meta-value', String(value)));
  return row;
}

/**
 * @param {Document} doc  parsed model
 * @returns {HTMLElement} detached export page; the caller mounts and prints it
 */
export function renderExport(doc, opts = {}) {
  const dirs = doc.directives || {};
  const has = (k) => k in dirs && String(dirs[k]).trim() !== '';
  const page = h('div', 'sr-export');

  const head = h('div', 'sr-exp-head');
  const left = h('div', 'sr-exp-headings');
  // Raga is the heading; with no raga, the composition's title takes the
  // slot rather than leaving the page untitled (and then isn't repeated).
  const heading = has('raga') ? dirs.raga : has('title') ? dirs.title : null;
  if (heading) left.appendChild(h('h1', 'sr-exp-raga', heading));
  if (has('raga') && has('title')) left.appendChild(h('p', 'sr-exp-title', dirs.title));

  // Provenance: every directive that isn't identity, a heading, or part of
  // the performance frame — in the order it was written.
  const perfKeys = new Set(EXPORT_PERFORMANCE.map((p) => p[0]));
  const prov = h('div', 'sr-exp-prov');
  for (const k of Object.keys(dirs)) {
    if (EXPORT_IDENTITY.includes(k) || EXPORT_HEADINGS.includes(k) || perfKeys.has(k)) continue;
    if (!has(k)) continue;
    const item = h('span', 'sr-exp-prov-item');
    item.appendChild(h('span', 'sr-exp-prov-label', prettyKey(k)));
    item.appendChild(h('span', 'sr-exp-prov-value', String(dirs[k])));
    prov.appendChild(item);
  }
  if (prov.children.length > 0) left.appendChild(prov);
  head.appendChild(left);

  const meta = h('div', 'sr-exp-meta');
  for (const [key, label] of EXPORT_PERFORMANCE) {
    if (!has(key)) continue;
    let value = dirs[key];
    if (key === 'sa') value = prettyPitch(value);
    if (key === 'tempo') value = `${value} bpm`;
    meta.appendChild(metaRow(label, value));
  }
  head.appendChild(meta);
  page.appendChild(head);

  // The notation is the same engine output as the preview — no cursor, so
  // no landing reports; no second typographic implementation to drift.
  page.appendChild(renderDocument(doc, opts));
  return page;
}

function renderSection(section, sectionIndex, opts) {
  const el = h('section', 'sr-section');
  if (section.label !== null && section.label !== undefined) {
    el.appendChild(h('div', 'sr-section-label', section.label));
  }
  const tal = section.tal !== 'free' ? getTal(section.tal) : null;
  for (let li = 0; li < section.lines.length; li++) {
    el.appendChild(renderLine(section.lines[li], tal, { sectionIndex, lineIndex: li, ...opts }));
  }
  return el;
}

// ---------------------------------------------------------------------------
// One music line → line block (grid row + landing reports)
// ---------------------------------------------------------------------------

function renderLine(line, tal, ctx) {
  const block = h('div', 'sr-line-block');
  // click-to-position seam: the shell maps clicks back to the source line
  if (line.sourceLine !== undefined) {
    block.setAttribute('data-source-line', String(line.sourceLine));
  }
  const row = h('div', 'sr-row' + (tal ? '' : ' sr-free'));
  block.appendChild(row);

  // --- column plan: [repeat-open?] cells with bar columns interleaved
  //     [repeat-close?] [passthrough...]
  const cols = [];
  const colOf = []; // grid column (1-based) of each matra cell
  if (line.lineRepeat) cols.push('max-content');
  for (let k = 0; k < line.matras.length; k++) {
    colOf[k] = cols.length + 1;
    cols.push(tal ? 'minmax(2.6em, max-content)' : 'max-content');
    if (tal && k < line.matras.length - 1 && boundaryAfter(line, k, tal)) {
      cols.push('max-content'); // barline column
    }
  }
  if (line.lineRepeat) cols.push('max-content');
  if (line.passthrough.length > 0) {
    for (let i = 0; i < line.passthrough.length; i++) cols.push('max-content');
  }
  row.style.gridTemplateColumns = cols.join(' ');

  // --- over-arc lane (grid row 1)
  for (const span of line.spans) {
    const fromCol = colOf[span.from.matraIndex];
    const toCol = colOf[span.to.matraIndex];
    if (fromCol === undefined || toCol === undefined) continue;
    const wrap = h(
      'div',
      span.type === 'meend'
        ? 'sr-arc sr-arc-meend'
        : span.type === 'kan'
          ? 'sr-arc sr-arc-kan'
          : 'sr-arc sr-arc-krintan'
    );
    wrap.setAttribute('data-from-matra', String(span.from.matraIndex));
    wrap.setAttribute('data-to-matra', String(span.to.matraIndex));
    wrap.style.gridRow = '1';
    wrap.style.gridColumn = `${fromCol} / ${toCol + 1}`; // into the destination
    wrap.appendChild(span.type === 'krintan' ? krintanSvg() : meendSvg());
    row.appendChild(wrap);
  }

  // --- repeat-open glyph
  if (line.lineRepeat) {
    const open = h('div', 'sr-repeat-open sr-glyphcol', '||:');
    open.style.gridRow = '2';
    open.style.gridColumn = '1';
    row.appendChild(open);
  }

  // --- matra cells + barlines (grid row 2)
  const prefixOf = new Map(); // matraIndex → '(' etc.
  const suffixOf = new Map();
  for (const pr of line.phraseRepeats) {
    prefixOf.set(pr.fromMatra, '(');
    suffixOf.set(pr.toMatra, `)x${pr.times}`);
  }

  for (let k = 0; k < line.matras.length; k++) {
    const cell = renderCell(line, k, tal, prefixOf.get(k), suffixOf.get(k), ctx);
    cell.style.gridRow = '2';
    cell.style.gridColumn = String(colOf[k]);
    row.appendChild(cell);
    if (tal && k < line.matras.length - 1 && boundaryAfter(line, k, tal)) {
      const bar = h('div', 'sr-bar');
      bar.style.gridRow = '2';
      bar.style.gridColumn = String(colOf[k] + 1);
      row.appendChild(bar);
    }
  }

  // --- repeat-close glyph
  if (line.lineRepeat) {
    const close = h('div', 'sr-repeat-close sr-glyphcol', ':||');
    close.style.gridRow = '2';
    close.style.gridColumn = String(cols.length - line.passthrough.length);
    row.appendChild(close);
  }

  // --- passthrough: dimmed literal text (spec: diagnostics render in place)
  let ptCol = cols.length - line.passthrough.length + 1;
  for (const pt of line.passthrough) {
    const el = h('div', 'sr-passthrough sr-dim', pt.text);
    el.style.gridRow = '2';
    el.style.gridColumn = String(ptCol++);
    row.appendChild(el);
  }

  // --- lyric row (grid row 3)
  for (const lyr of line.lyrics) {
    if (colOf[lyr.matraIndex] === undefined) continue;
    const el = h('div', 'sr-lyric', lyr.text);
    el.setAttribute('data-matra', String(lyr.matraIndex));
    el.style.gridRow = '3';
    el.style.gridColumn = String(colOf[lyr.matraIndex]);
    row.appendChild(el);
  }

  // --- bol ticks (grid row 4), grouped per matra in event order.
  // Typed as words, rendered as the handwriting's symbols (spec §3.8).
  const BOL_SYMBOL = { da: '|', ra: '—', diri: '^', chikari: 'v' };
  const bolsByMatra = new Map();
  for (const b of line.bols) {
    if (!bolsByMatra.has(b.ref.matraIndex)) bolsByMatra.set(b.ref.matraIndex, []);
    bolsByMatra.get(b.ref.matraIndex).push(b);
  }
  for (const [mi, group] of bolsByMatra) {
    if (colOf[mi] === undefined) continue;
    const el = h('div', 'sr-bol');
    el.setAttribute('data-matra', String(mi));
    el.style.gridRow = '4';
    el.style.gridColumn = String(colOf[mi]);
    for (const b of group) {
      el.appendChild(h('span', 'sr-bol-mark sr-bol-' + b.mark, BOL_SYMBOL[b.mark] ?? b.mark));
    }
    row.appendChild(el);
  }

  // --- landing reports (derived; spec §3.9 wording, §4 cursor scoping).
  // Shown only while the cursor is on this line — it is a check you run,
  // not part of the notation. Scoping is line-level (spec says "inside a
  // repeat"; column→matra mapping isn't plumbed, and a line is the unit
  // the writer is thinking in).
  if (tal && ctx.activeLine !== undefined && ctx.activeLine === line.sourceLine) {
    for (const pr of line.phraseRepeats) {
      const startAbs = wrapMatra(tal, line.startMatra + pr.fromMatra);
      const l = landing(tal, startAbs, pr.toMatra - pr.fromMatra + 1, pr.times);
      const where = l.isSam ? 'sam' : l.isKhali ? 'khali' : l.marker ? `marker ${l.marker}` : null;
      const note = lastStruckNote(line, pr);
      const subject = note ? `${ordinal(pr.times)} ${note}` : `${ordinal(pr.times)} repetition`;
      const text = `${subject} lands on matra ${l.matra}${where ? ` (${where})` : ''}`;
      block.appendChild(h('div', 'sr-landing', text));
    }
  }

  // --- playback cursor (M3 seam)
  const c = ctx.activeCursor;
  if (
    c &&
    c.sectionIndex === ctx.sectionIndex &&
    c.lineIndex === ctx.lineIndex &&
    colOf[c.matraIndex] !== undefined
  ) {
    const cells = row.querySelectorAll('.sr-cell');
    cells[c.matraIndex]?.classList.add('sr-active');
  }

  return block;
}

/** True if a barline falls after 0-based matra index k (derived from tal). */
function boundaryAfter(line, k, tal) {
  return markerAtMatra(tal, line.startMatra + k + 1) !== null;
}

/** 1 → '1st', 2 → '2nd', 3 → '3rd', 11 → '11th' … */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Typed form of a note event: octave prefix + letter ('.d', "'S", 'P'). */
function noteAtom(ev) {
  const o = ev.octave || 0;
  const prefix = o < 0 ? '.'.repeat(-o) : o > 0 ? "'".repeat(o) : '';
  return prefix + ev.ch;
}

/** The last struck note of a phrase repeat — the note the report names. */
function lastStruckNote(line, pr) {
  for (let m = Math.min(pr.toMatra, line.matras.length - 1); m >= pr.fromMatra; m--) {
    const evs = line.matras[m]?.events || [];
    for (let e = evs.length - 1; e >= 0; e--) {
      if (evs[e].type === 'note') return noteAtom(evs[e]);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// One matra → cell
// ---------------------------------------------------------------------------

function renderCell(line, k, tal, prefix, suffix, ctx) {
  const matra = line.matras[k];
  const evs = matra.events;
  const allSustain = evs.every((e) => e.type === 'sustain');
  const cell = h(
    'div',
    'sr-cell' + (allSustain ? ' sr-dim' : '') + (evs[0]?.holdToVibhag ? ' sr-hold' : '')
  );
  cell.setAttribute('data-matra', String(k));

  // Marker lane: derived from tal + start offset; empty node keeps rows aligned.
  const markerText = tal ? markerAtMatra(tal, wrapMatra(tal, line.startMatra + k)) : null;
  cell.appendChild(h('div', 'sr-marker', markerText ?? ''));

  // Glyphs.
  const glyphs = h('div', 'sr-glyphs');
  if (prefix) glyphs.appendChild(h('span', 'sr-phrase-glyph', prefix));
  for (const e of evs) glyphs.appendChild(renderEvent(e, ctx));
  if (suffix) glyphs.appendChild(h('span', 'sr-phrase-glyph', suffix));
  cell.appendChild(glyphs);

  // Automatic under-arc on subdivided matras (spec principle 2).
  // The LANE is reserved in every cell — an empty slot when the matra
  // isn't subdivided — because cells bottom-align: an optional lane made
  // plain matras shorter, dropping their glyph and their marker below
  // their neighbours' (M, 2026-07-16). Same idiom as the marker lane.
  // Under-arc = rhythmic subdivision of TIMED notes only (M, 2026-07-16);
  // graces never trigger it. {dP}m: curve only. {d}Pm: curve + arc.
  const timedCount = evs.filter((e) => !e.grace).length;
  cell.appendChild(timedCount > 1 ? underarcSvg() : h('div', 'sr-arc-lane sr-arc-slot'));

  return cell;
}

// Every event carries the same three lanes — dots above, character, dots
// below — even when a lane is empty, and rests/sustains share the shape.
// Optional lanes made events different heights; since cells bottom-align,
// a plain madhya note sat lower than a mandra or subdivided neighbour and
// dragged its marker down with it (M, 2026-07-16). Reserved lanes make
// every cell the same height, so glyphs and markers line up across a row.
function renderEvent(e, ctx) {
  const isNote = e.type === 'note';
  const o = isNote ? e.octave || 0 : 0;
  const reg = o < 0 ? ' sr-reg-cool' : o > 0 ? ' sr-reg-warm' : '';
  const cls =
    e.type === 'rest'
      ? 'sr-ev sr-rest sr-dim'
      : e.type === 'sustain'
        ? 'sr-ev sr-sustain sr-dim'
        : 'sr-ev sr-note' + reg + (e.grace ? ' sr-grace' : '');
  const ev = h('span', cls);

  const above = h('span', 'sr-dots sr-dots-above');
  for (let i = 0; i < Math.max(0, o); i++) above.appendChild(h('span', 'sr-dot sr-dot-above', '•'));
  ev.appendChild(above);

  ev.appendChild(
    h('span', 'sr-ch', e.type === 'rest' ? '·' : e.type === 'sustain' ? '—' : chOf(e, ctx))
  );

  const below = h('span', 'sr-dots sr-dots-below');
  for (let i = 0; i < Math.max(0, -o); i++) below.appendChild(h('span', 'sr-dot sr-dot-below', '•'));
  ev.appendChild(below);

  return ev;
}

// ---------------------------------------------------------------------------
// SVG arcs — three distinct styles (spec §4), scaling with their grid spans.
// ---------------------------------------------------------------------------

function svgEl(cls, pathD) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 20');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', cls);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathD);
  path.setAttribute('fill', 'none');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(path);
  return svg;
}

/** Over-arc: rounded slide, drawn into the destination. */
function meendSvg() {
  return svgEl('sr-svg-meend', 'M4,18 Q50,2 96,18');
}

/** Square over-bracket: the krintan mark, crossing barlines when it does. */
function krintanSvg() {
  return svgEl('sr-svg-krintan', 'M4,18 L4,5 L96,5 L96,18');
}

/** Under-arc: automatic on subdivided matras. Shares .sr-arc-lane metrics
 *  with the empty slot so reserved and drawn lanes are the same box. */
function underarcSvg() {
  return svgEl('sr-arc-lane sr-underarc', 'M4,2 Q50,18 96,2');
}

// ---------------------------------------------------------------------------

function h(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
