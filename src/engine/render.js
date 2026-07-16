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

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {Document} doc  parsed model (parse.js)
 * @param {{activeCursor?: {sectionIndex:number, lineIndex:number, matraIndex:number}}} [opts]
 * @returns {HTMLElement} detached element; the caller mounts it
 */
export function renderDocument(doc, opts = {}) {
  const el = h('div', 'sargam-render');
  for (let si = 0; si < (doc.sections || []).length; si++) {
    el.appendChild(renderSection(doc.sections[si], si, opts));
  }
  return el;
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
    const wrap = h('div', span.type === 'meend' ? 'sr-arc sr-arc-meend' : 'sr-arc sr-arc-krintan');
    wrap.setAttribute('data-from-matra', String(span.from.matraIndex));
    wrap.setAttribute('data-to-matra', String(span.to.matraIndex));
    wrap.style.gridRow = '1';
    wrap.style.gridColumn = `${fromCol} / ${toCol + 1}`; // into the destination
    wrap.appendChild(span.type === 'meend' ? meendSvg() : krintanSvg());
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
    const cell = renderCell(line, k, tal, prefixOf.get(k), suffixOf.get(k));
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

  // --- landing reports (derived; spec §3.6)
  if (tal) {
    for (const pr of line.phraseRepeats) {
      const startAbs = wrapMatra(tal, line.startMatra + pr.fromMatra);
      const l = landing(tal, startAbs, pr.toMatra - pr.fromMatra + 1, pr.times);
      const where = l.isSam ? 'sam' : l.isKhali ? 'khali' : l.marker ? `marker ${l.marker}` : null;
      const text = `x${pr.times} lands on matra ${l.matra}${where ? ` (${where})` : ''}`;
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

// ---------------------------------------------------------------------------
// One matra → cell
// ---------------------------------------------------------------------------

function renderCell(line, k, tal, prefix, suffix) {
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
  for (const e of evs) glyphs.appendChild(renderEvent(e));
  if (suffix) glyphs.appendChild(h('span', 'sr-phrase-glyph', suffix));
  cell.appendChild(glyphs);

  // Automatic under-arc on subdivided matras (spec principle 2).
  if (evs.length > 1) {
    cell.appendChild(underarcSvg());
  }

  return cell;
}

function renderEvent(e) {
  if (e.type === 'rest') return h('span', 'sr-ev sr-rest sr-dim', '·');
  if (e.type === 'sustain') return h('span', 'sr-ev sr-sustain sr-dim', '—');

  const o = e.octave || 0;
  const reg = o < 0 ? ' sr-reg-cool' : o > 0 ? ' sr-reg-warm' : '';
  const ev = h('span', 'sr-ev sr-note' + reg);
  const above = h('span', 'sr-dots sr-dots-above');
  for (let i = 0; i < Math.max(0, o); i++) above.appendChild(h('span', 'sr-dot sr-dot-above', '•'));
  const below = h('span', 'sr-dots sr-dots-below');
  for (let i = 0; i < Math.max(0, -o); i++) below.appendChild(h('span', 'sr-dot sr-dot-below', '•'));
  if (o > 0) ev.appendChild(above);
  ev.appendChild(h('span', 'sr-ch', e.ch));
  if (o < 0) ev.appendChild(below);
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

/** Under-arc: automatic on subdivided matras. */
function underarcSvg() {
  return svgEl('sr-underarc', 'M4,2 Q50,18 96,2');
}

// ---------------------------------------------------------------------------

function h(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
