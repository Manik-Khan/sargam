// SARGAM_NOTATION_STRUCTURE_WAVE_2026_07_18
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
import { estimateMatraEm, isSafeBreak, planLineSystems } from './layout.js';
import { buildLineGeometry } from './notation-geometry.js';
import { performedOffsetAt } from './performed-time.js';
import { buildBolPlan } from './bol-lane.js';

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
    maxSystemEm: Number.isFinite(Number(opts.maxSystemEm)) ? Number(opts.maxSystemEm) : Infinity,
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
  page.appendChild(renderDocument(doc, { maxSystemEm: 40, ...opts }));
  return page;
}

function renderSection(section, sectionIndex, opts) {
  const el = h('section', 'sr-section');
  if (section.label !== null && section.label !== undefined) {
    if (opts.graphPaper) {
      el.appendChild(renderGraphStructureRow(section.label, opts));
    } else {
      el.appendChild(h('div', 'sr-section-label', section.label));
    }
  }
  const tal = section.tal !== 'free' ? getTal(section.tal) : null;
  for (let li = 0; li < section.lines.length; li++) {
    const line = section.lines[li];
    const next = section.lines[li + 1];
    if (
      line?.lineRepeat &&
      Number.isInteger(line?.firstEndingFrom) &&
      next
    ) {
      el.appendChild(renderAlternateEndingPair(line, next, tal, {
        sectionIndex,
        lineIndex: li,
        ...opts,
      }));
      li++;
      continue;
    }
    const previous = section.lines[li - 1];
    const secondEnding = Boolean(
      previous?.lineRepeat && Number.isInteger(previous?.firstEndingFrom)
    );
    el.appendChild(renderLine(line, tal, {
      sectionIndex,
      lineIndex: li,
      secondEnding,
      ...opts,
    }));
  }
  return el;
}

function renderGraphStructureRow(label, ctx) {
  const columns = Math.max(1, Number(ctx.graphColumns) || 1);
  const row = h('div', 'sr-graph-structure-row');
  row.setAttribute('aria-label', String(label));
  row.setAttribute('data-graph-columns', String(columns));
  row.style.gridTemplateColumns = `repeat(${columns}, var(--sr-graph-cell-width))`;
  for (let column = 0; column < columns; column++) {
    const cell = h('div', 'sr-graph-structure-cell');
    cell.setAttribute('aria-hidden', 'true');
    // The prose label spans the same explicit columns. Pin every background
    // cell to its own track so CSS Grid overlays the two layers instead of
    // auto-placing the cells into new columns beyond the paper edge.
    cell.style.gridColumn = String(column + 1);
    row.appendChild(cell);
  }
  // Prose is not a matra. Keep the graph columns behind it, but let the label
  // occupy one compact inter-row strip instead of masquerading as a full beat.
  row.appendChild(h('span', 'sr-graph-structure-label', label));
  return row;
}

// ---------------------------------------------------------------------------
// One music line → line block (grid row + landing reports)
// ---------------------------------------------------------------------------

function renderLine(line, tal, ctx) {
  const group = h(
    'div',
    'sr-line-group' + (ctx.activeLine === line.sourceLine ? ' sr-source-active' : '')
  );
  if (line.sourceLine !== undefined) group.setAttribute('data-source-line', String(line.sourceLine));
  if (ctx.activeLine === line.sourceLine) group.setAttribute('aria-current', 'true');
  group.setAttribute('data-section-index', String(ctx.sectionIndex));
  group.setAttribute('data-line-index', String(ctx.lineIndex));
  const geometry = buildLineGeometry(line);
  const ranges = planLineSystems(line, tal, {
    maxEm: ctx.maxSystemEm,
    graphColumns: ctx.graphPaper ? ctx.graphColumns : null,
  });
  ranges.forEach((range, systemIndex) => {
    const systemLine = sliceLineForSystem(line, tal, range.from, range.to, systemIndex, ranges.length);
    const block = renderLineBlock(systemLine, tal, { ...ctx, geometry });
    block.setAttribute('data-system-index', String(systemIndex));
    block.setAttribute('data-system-count', String(ranges.length));
    block.setAttribute('data-system-from', String(range.from));
    block.setAttribute('data-system-to', String(range.to));
    block.setAttribute('data-system-break', range.reason);
    group.appendChild(block);
  });
  return group;
}

function estimatedRangeEm(line, tal, from, to) {
  if (to < from) return 0;
  let width = 0;
  for (let index = from; index <= to; index++) {
    width += estimateMatraEm(line.matras[index]);
    if (
      index < to &&
      tal &&
      markerAtMatra(tal, line.startMatra + performedOffsetAt(line, index + 1)) !== null
    ) {
      width += 0.5;
    }
  }
  return width;
}

function maxPlannedRangeEm(line, tal, maxEm) {
  const ranges = planLineSystems(line, tal, { maxEm });
  return Math.max(
    0,
    ...ranges.map((range) => estimatedRangeEm(line, tal, range.from, range.to))
  );
}

function alternateEndingLayout(first, second, tal, ctx) {
  const endingStart = first.firstEndingFrom;
  const maxEm = Number(ctx.maxSystemEm);
  if (!Number.isFinite(maxEm) || maxEm <= 0) {
    return {
      prefixRanges: [],
      finalFrom: 0,
      commonEm: estimatedRangeEm(first, tal, 0, endingStart - 1),
    };
  }

  const firstEndingEm = estimatedRangeEm(first, tal, endingStart, first.matras.length - 1) + 1.1;
  const secondEndingEm = maxPlannedRangeEm(second, tal, maxEm);
  const endingEm = Math.min(maxEm, Math.max(firstEndingEm, secondEndingEm));
  let finalFrom = endingStart;
  let commonEm = 0;

  if (ctx.graphPaper) {
    const totalColumns = Math.max(1, Number(ctx.graphColumns) || 1);
    const firstEndingColumns = first.matras.length - endingStart + 1;
    const secondEndingColumns = Math.min(totalColumns, Math.max(1, second.matras.length));
    const endingColumns = Math.max(firstEndingColumns, secondEndingColumns);
    let availableCommonColumns = Math.max(0, totalColumns - endingColumns);
    while (finalFrom > 0 && availableCommonColumns > 0) {
      const candidate = finalFrom - 1;
      if (candidate > 0 && !isSafeBreak(first, candidate - 1)) break;
      const repeatColumn = candidate === 0 && first.lineRepeat ? 1 : 0;
      if (endingStart - candidate + repeatColumn > availableCommonColumns) break;
      finalFrom = candidate;
    }
    commonEm = (endingStart - finalFrom + (finalFrom === 0 && first.lineRepeat ? 1 : 0)) * 2.6;
  } else {
    const commonBudget = Math.max(0, maxEm - endingEm);
    while (finalFrom > 0) {
      const candidate = finalFrom - 1;
      if (candidate > 0 && !isSafeBreak(first, candidate - 1)) break;
      const candidateEm = estimatedRangeEm(first, tal, candidate, endingStart - 1)
        + (candidate === 0 && first.lineRepeat ? 1.1 : 0);
      if (candidateEm > commonBudget) break;
      finalFrom = candidate;
      commonEm = candidateEm;
    }
  }

  let prefixRanges = [];
  if (finalFrom > 0) {
    const prefix = sliceLineForSystem(first, tal, 0, finalFrom - 1, 0, 1);
    prefix.lineRepeat = false;
    prefix.repeatOpen = Boolean(first.lineRepeat);
    prefix.repeatClose = false;
    prefix.firstEndingFrom = null;
    prefix.returnCue = null;
    prefix.passthrough = [];
    prefixRanges = planLineSystems(prefix, tal, {
      maxEm,
      graphColumns: ctx.graphPaper ? ctx.graphColumns : null,
    });
  }
  return { prefixRanges, finalFrom, commonEm };
}

function stampSystem(block, index, count, from, to, reason) {
  block.setAttribute('data-system-index', String(index));
  block.setAttribute('data-system-count', String(count));
  block.setAttribute('data-system-from', String(from));
  block.setAttribute('data-system-to', String(to));
  block.setAttribute('data-system-break', reason);
}

function renderAlternateEndingPair(first, second, tal, ctx) {
  const group = h(
    'div',
    'sr-line-group sr-alternate-ending-pair' +
      (ctx.activeLine === first.sourceLine ? ' sr-source-active' : '')
  );
  if (first.sourceLine !== undefined) group.setAttribute('data-source-line', String(first.sourceLine));
  if (ctx.activeLine === first.sourceLine) group.setAttribute('aria-current', 'true');
  group.setAttribute('data-section-index', String(ctx.sectionIndex));
  group.setAttribute('data-line-index', String(ctx.lineIndex));
  if (second.sourceLine !== undefined) {
    group.setAttribute('data-second-ending-source-line', String(second.sourceLine));
  }

  const firstGeometry = buildLineGeometry(first);
  const layout = alternateEndingLayout(first, second, tal, ctx);
  const systemCount = layout.prefixRanges.length + 1;
  layout.prefixRanges.forEach((range, systemIndex) => {
    const slice = sliceLineForSystem(first, tal, range.from, range.to, systemIndex, systemCount);
    slice.repeatClose = false;
    slice.firstEndingFrom = null;
    const block = renderLineBlock(slice, tal, { ...ctx, geometry: firstGeometry, secondEnding: false });
    stampSystem(block, systemIndex, systemCount, range.from, range.to, range.reason);
    group.appendChild(block);
  });

  const endingStart = first.firstEndingFrom;
  const finalIndex = systemCount - 1;
  const aligned = h('div', 'sr-alternate-ending-system');
  aligned.setAttribute('data-system-index', String(finalIndex));
  const commonMatraCount = Math.max(0, endingStart - layout.finalFrom);
  const commonGraphColumns = commonMatraCount + (layout.finalFrom === 0 && first.lineRepeat ? 1 : 0);
  const endingGraphColumns = ctx.graphPaper
    ? Math.max(1, Number(ctx.graphColumns || 1) - commonGraphColumns)
    : undefined;

  if (commonMatraCount > 0 || (layout.finalFrom === 0 && first.lineRepeat)) {
    const common = sliceLineForSystem(
      first,
      tal,
      layout.finalFrom,
      endingStart - 1,
      finalIndex,
      systemCount
    );
    common.repeatOpen = Boolean(first.lineRepeat && layout.finalFrom === 0);
    common.repeatClose = false;
    common.firstEndingFrom = null;
    common.returnCue = null;
    common.passthrough = [];
    const commonBlock = renderLineBlock(common, tal, {
      ...ctx,
      geometry: firstGeometry,
      graphColumns: ctx.graphPaper ? commonGraphColumns : ctx.graphColumns,
      secondEnding: false,
    });
    commonBlock.classList.add('sr-alternate-ending-common');
    stampSystem(
      commonBlock,
      finalIndex,
      systemCount,
      layout.finalFrom,
      endingStart - 1,
      'alternate-ending'
    );
    aligned.appendChild(commonBlock);
  } else {
    aligned.classList.add('sr-alternate-ending-no-common');
  }

  const firstEnding = sliceLineForSystem(
    first,
    tal,
    endingStart,
    first.matras.length - 1,
    finalIndex,
    systemCount
  );
  firstEnding.repeatOpen = false;
  firstEnding.repeatClose = Boolean(first.lineRepeat);
  firstEnding.firstEndingFrom = 0;
  const firstBlock = renderLineBlock(firstEnding, tal, {
    ...ctx,
    geometry: firstGeometry,
    graphColumns: endingGraphColumns ?? ctx.graphColumns,
    secondEnding: false,
  });
  firstBlock.classList.add('sr-alternate-ending-first');
  stampSystem(
    firstBlock,
    finalIndex,
    systemCount,
    endingStart,
    first.matras.length - 1,
    'alternate-ending-first'
  );
  aligned.appendChild(firstBlock);

  const endingMaxEm = Number.isFinite(Number(ctx.maxSystemEm))
    ? Math.max(2.6, Number(ctx.maxSystemEm) - layout.commonEm)
    : ctx.maxSystemEm;
  const secondGroup = renderLine(second, tal, {
    ...ctx,
    lineIndex: ctx.lineIndex + 1,
    secondEnding: true,
    maxSystemEm: endingMaxEm,
    graphColumns: endingGraphColumns ?? ctx.graphColumns,
  });
  secondGroup.classList.add('sr-alternate-ending-second');
  aligned.appendChild(secondGroup);
  group.appendChild(aligned);
  return group;
}

function renderLineBlock(line, tal, ctx) {
  const block = h('div', 'sr-line-block');
  // click-to-position seam: the shell maps clicks back to the source line
  if (line.sourceLine !== undefined) {
    block.setAttribute('data-source-line', String(line.sourceLine));
  }
  const graphPaper = Boolean(ctx.graphPaper);
  const row = h('div', 'sr-row' + (tal ? '' : ' sr-free') + (graphPaper ? ' sr-graph-row' : ''));
  block.appendChild(row);

  // --- column plan: [repeat-open?] cells with bar columns interleaved
  //     [repeat-close?] [passthrough...]
  const cols = [];
  const colOf = []; // grid column (1-based) of each matra cell
  const showRepeatOpen = line.repeatOpen ?? line.lineRepeat;
  const showRepeatClose = line.repeatClose ?? line.lineRepeat;
  // Repeats are structural markers, not rhythmic contents. Give each visible
  // repeat its own column so it can never cover or shrink a note cell.
  let repeatOpenCol = null;
  if (showRepeatOpen) {
    cols.push(graphPaper ? 'var(--sr-graph-cell-width)' : 'max-content');
    repeatOpenCol = cols.length;
  }
  for (let k = 0; k < line.matras.length; k++) {
    colOf[k] = cols.length + 1;
    cols.push(graphPaper ? 'var(--sr-graph-cell-width)' : tal ? 'minmax(2.6em, max-content)' : 'max-content');
    if (!graphPaper && tal && k < line.matras.length - 1 && boundaryAfter(line, k, tal)) {
      cols.push('max-content'); // barline column
    }
  }
  let repeatCloseCol = null;
  if (showRepeatClose) {
    cols.push(graphPaper ? 'var(--sr-graph-cell-width)' : 'max-content');
    repeatCloseCol = cols.length;
  }
  let returnCueCol = null;
  if (line.returnCue) {
    cols.push(graphPaper ? 'var(--sr-graph-cell-width)' : 'max-content');
    returnCueCol = cols.length;
  }
  if (line.passthrough.length > 0) {
    for (let i = 0; i < line.passthrough.length; i++) {
      cols.push(graphPaper ? 'var(--sr-graph-cell-width)' : 'max-content');
    }
  }
  const contentColumnCount = cols.length;
  const graphColumnCount = graphPaper
    ? Math.max(contentColumnCount, Math.max(1, Number(ctx.graphColumns) || 1))
    : 0;
  while (graphPaper && cols.length < graphColumnCount) cols.push('var(--sr-graph-cell-width)');
  let paperTailCol = null;
  if (!graphPaper) {
    // The zero-width compatibility tail is inert outside the retired painted
    // paper treatment. Graph Paper now uses real empty cell elements.
    cols.push('var(--sr-paper-tail, 0px)');
    paperTailCol = cols.length;
  }
  if (graphPaper) row.setAttribute('data-graph-columns', String(graphColumnCount));
  row.style.gridTemplateColumns = cols.join(' ');

  // --- over-arc lane (grid row 1)
  for (const span of line.spans) {
    // A krintan nested inside one [ ] beat is drawn directly over its
    // ornament cluster in the destination slot. A row-wide arc would falsely
    // imply that the complete beat is part of the pull-off.
    if (span.type === 'krintan' && span.scoped) continue;
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
    const matraOffset = Number(line._matraOffset) || 0;
    wrap.setAttribute('data-from-matra', String(matraOffset + span.from.matraIndex));
    wrap.setAttribute('data-to-matra', String(matraOffset + span.to.matraIndex));
    wrap.style.gridRow = '1';
    wrap.style.gridColumn = `${fromCol} / ${toCol + 1}`; // into the destination
    wrap.appendChild(span.type === 'krintan' ? krintanSvg() : meendSvg());
    row.appendChild(wrap);
  }

  // --- first-ending (volta) bracket, sharing the over-arc lane.
  if (Number.isInteger(line.firstEndingFrom) && line.firstEndingFrom < line.matras.length) {
    const fromCol = colOf[line.firstEndingFrom];
    const toCol = colOf[line.matras.length - 1];
    if (fromCol !== undefined && toCol !== undefined) {
      const volta = h('div', 'sr-volta sr-volta-first', '1st time');
      volta.setAttribute('data-first-ending', String(line.firstEndingFrom));
      volta.style.gridRow = '1';
      volta.style.gridColumn = `${fromCol} / ${toCol + 1}`;
      volta.style.alignSelf = 'start';
      volta.style.minHeight = '0.78em';
      volta.style.borderTop = '1px solid currentColor';
      volta.style.borderLeft = '1px solid currentColor';
      volta.style.padding = '0.05em 0 0 0.28em';
      volta.style.fontSize = '0.72em';
      volta.style.lineHeight = '1';
      volta.style.opacity = '0.8';
      row.appendChild(volta);
    }
  }

  // The notation line immediately after a repeated line with |1 is its
  // replacement ending on pass two. Scheduling already follows that order;
  // this bracket makes the compact written form equally clear to the reader.
  if (ctx.secondEnding && line.matras.length > 0) {
    const fromCol = colOf[0];
    const toCol = colOf[line.matras.length - 1];
    if (fromCol !== undefined && toCol !== undefined) {
      const firstSystem = (Number(line._matraOffset) || 0) === 0;
      const volta = h('div', 'sr-volta sr-volta-second', firstSystem ? '2nd time' : '');
      volta.setAttribute('data-second-ending', 'true');
      volta.style.gridRow = '1';
      volta.style.gridColumn = `${fromCol} / ${toCol + 1}`;
      volta.style.alignSelf = 'start';
      volta.style.minHeight = '0.78em';
      volta.style.borderTop = '1px solid currentColor';
      if (firstSystem) volta.style.borderLeft = '1px solid currentColor';
      volta.style.padding = '0.05em 0 0 0.28em';
      volta.style.fontSize = '0.72em';
      volta.style.lineHeight = '1';
      volta.style.opacity = '0.8';
      row.appendChild(volta);
    }
  }

  // --- matra cells + barlines (grid row 2)
  const prefixOf = new Map(); // matraIndex → '(' etc.
  const suffixOf = new Map();
  const repeatLandingOf = new Map();
  for (const pr of line.phraseRepeats) {
    prefixOf.set(pr.fromMatra, '(');
    suffixOf.set(pr.toMatra, `)x${pr.times}`);
    if (tal) {
      const next = wrapMatra(
        tal,
        line.startMatra + performedOffsetAt(line, pr.toMatra + 1)
      );
      repeatLandingOf.set(pr.toMatra, {
        matra: next,
        text: markerAtMatra(tal, next) ?? String(next),
      });
    }
  }

  const renderedCells = [];
  for (let k = 0; k < line.matras.length; k++) {
    const cell = renderCell(
      line,
      k,
      tal,
      prefixOf.get(k),
      suffixOf.get(k),
      repeatLandingOf.get(k),
      ctx
    );
    renderedCells.push(cell);
    cell.style.gridRow = '2';
    cell.style.gridColumn = String(colOf[k]);
    row.appendChild(cell);
    if (tal && k < line.matras.length - 1 && boundaryAfter(line, k, tal)) {
      if (graphPaper) {
        cell.classList.add('sr-graph-vibhag-end');
      } else {
        const bar = h('div', 'sr-bar');
        bar.style.gridRow = '2';
        bar.style.gridColumn = String(colOf[k] + 1);
        row.appendChild(bar);
      }
    }
  }

  // Line repeats live in dedicated structural columns outside the first and
  // last matras. They remain full-size siblings and cannot obscure notation.
  if (showRepeatOpen && repeatOpenCol !== null && renderedCells.length) {
    appendLineRepeatMarker(row, 'open', repeatOpenCol);
  }
  if (showRepeatClose && repeatCloseCol !== null && renderedCells.length) {
    appendLineRepeatMarker(row, 'close', repeatCloseCol);
  }

  // --- terminal return cue: visible instruction, zero rhythmic time.
  if (line.returnCue && returnCueCol !== null) {
    const cue = h('div', 'sr-return-cue', returnCueText(line.returnCue));
    cue.setAttribute('data-return-cue', line.returnCue.target);
    cue.style.gridRow = '2';
    cue.style.gridColumn = String(returnCueCol);
    row.appendChild(cue);
  }

  // --- passthrough: dimmed literal text (spec: diagnostics render in place)
  let ptCol = contentColumnCount - line.passthrough.length + 1;
  for (const pt of line.passthrough) {
    const el = h('div', 'sr-passthrough sr-dim', pt.text);
    el.style.gridRow = '2';
    el.style.gridColumn = String(ptCol++);
    row.appendChild(el);
  }

  if (graphPaper) {
    for (let column = contentColumnCount + 1; column <= graphColumnCount; column++) {
      const emptyCell = h('div', 'sr-graph-empty-cell');
      emptyCell.setAttribute('aria-hidden', 'true');
      emptyCell.setAttribute('data-graph-empty', 'true');
      emptyCell.style.gridRow = '2';
      emptyCell.style.gridColumn = String(column);
      row.appendChild(emptyCell);
    }
  } else {
    const paperTail = h('div', 'sr-paper-tail');
    paperTail.setAttribute('aria-hidden', 'true');
    paperTail.style.gridRow = '2';
    paperTail.style.gridColumn = String(paperTailCol);
    row.appendChild(paperTail);
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

  // --- structural bol lane (grid row 4).
  // It mirrors each matra's written microbeat slots. A hold remains a short
  // '-', point strokes sit beneath their exact attack, and Diri either marks
  // two strokes on one note or spans the two attacks joined by `di-ri`.
  const BOL_SYMBOL = { da: '|', ra: '—', diri: 'V', chikari: '^' };
  const bolPlan = buildBolPlan(line);
  const bolAttackOffset = Math.max(0, Number(line._attackOffset) || 0);
  const bolPasses = line._bolPasses?.length
    ? line._bolPasses
    : (line._bolLane || line.bols?.length)
      ? [{ pass: 1, bols: line.bols || [] }]
      : [];
  const bolMatraGeometry = line.matras.map((matra) => {
    const firstSlotOfEvent = new Map();
    let writtenSlots = 0;
    for (let eventIndex = 0; eventIndex < (matra.events || []).length; eventIndex++) {
      const event = matra.events[eventIndex];
      if (event.grace) continue;
      firstSlotOfEvent.set(eventIndex, writtenSlots);
      writtenSlots += Math.max(1, Number(event.writtenSlots) || 1);
    }
    return { firstSlotOfEvent, writtenSlots: Math.max(1, writtenSlots) };
  });
  for (let mi = 0; mi < line.matras.length; mi++) {
    if (!bolPasses.length) continue;
    if (colOf[mi] === undefined) continue;
    const el = h('div', 'sr-bol');
    el.setAttribute('data-matra', String(mi));
    el.setAttribute('data-source-line', String(line.sourceLine));
    el.setAttribute('data-bol-passes', String(bolPasses.length));
    el.style.setProperty('--sr-bol-pass-count', String(bolPasses.length));
    el.style.gridRow = '4';
    el.style.gridColumn = String(colOf[mi]);
    const slots = [];
    const firstSlotOfEvent = new Map();
    for (let eventIndex = 0; eventIndex < line.matras[mi].events.length; eventIndex++) {
      const event = line.matras[mi].events[eventIndex];
      if (event.grace) continue;
      firstSlotOfEvent.set(eventIndex, slots.length);
      const attack = bolPlan.attackByRef.get(`${mi}:${eventIndex}`);
      const count = Math.max(1, Number(event.writtenSlots) || 1);
      for (let partIndex = 0; partIndex < count; partIndex++) {
        slots.push({
          event,
          eventIndex,
          partIndex,
          attackOrdinal: attack ? bolAttackOffset + attack.ordinal : null,
        });
      }
    }
    for (const passLane of bolPasses) {
      const pass = Number(passLane.pass) || 1;
      const allBols = passLane.bols || [];
      const group = allBols.filter((bol) => bol.ref.matraIndex === mi);
      const coveringBolAtEvent = new Map(
        allBols
          .filter((bol) => bol.mark === 'diri' && bol.endRef?.matraIndex === mi)
          .map((bol) => [bol.endRef.eventIndex, bol])
      );
      const passRow = h('span', 'sr-bol-pass');
      passRow.setAttribute('data-bol-pass', String(pass));
      if (bolPasses.length > 1 && mi === 0) {
        passRow.appendChild(h('span', 'sr-bol-pass-label', String(pass)));
      }
      const grid = h('span', 'sr-bol-slots');
      grid.setAttribute('data-written-slots', String(Math.max(1, slots.length)));
      grid.style.setProperty('--sr-bol-written-slots', String(Math.max(1, slots.length)));
      grid.style.gridTemplateColumns = slots.length
        ? slots
            .map((slot) => slot.event?.approachSlide && slot.partIndex === 0
              ? 'minmax(1.55em, max-content)'
              : 'minmax(0.84em, max-content)')
            .join(' ')
        : 'minmax(0.84em, max-content)';
      const bolAtEvent = new Map(
        group.filter((bol) => !bol.gap).map((bol) => [bol.ref.eventIndex, bol])
      );
      const gapBolAtSlot = new Map(
        group
          .filter((bol) => bol.mark === 'chikari' && bol.gap)
          .map((bol) => [`${bol.ref.eventIndex}:${Math.max(0, Number(bol.partIndex) || 0)}`, bol])
      );
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        const slot = slots[slotIndex];
        const gapBol = gapBolAtSlot.get(`${slot.eventIndex}:${slot.partIndex}`);
        if (gapBol) {
          const mark = h('span', 'sr-bol-slot sr-bol-mark sr-bol-chikari sr-bol-gap-chikari', '^');
          mark.style.gridColumn = String(slotIndex + 1);
          mark.setAttribute('data-bol-gap-slot', `${mi}:${slot.eventIndex}:${slot.partIndex}`);
          mark.setAttribute('aria-label', 'Chikari in rhythmic gap');
          mark.title = 'Chikari in this rhythmic gap';
          grid.appendChild(mark);
          continue;
        }
        if (slot.partIndex > 0 || slot.event?.type !== 'note') {
          // Rhythmic holds and empty subdivisions belong to the notation
          // grid, not the bol vocabulary. Preserve the slot so note/bol
          // columns remain exact, but do not paint a dash that can be read as
          // a ra stroke. A gap chikari is handled above and remains visible.
          const blank = h('span', 'sr-bol-slot sr-bol-blank sr-bol-rhythm-gap', '');
          blank.style.gridColumn = String(slotIndex + 1);
          blank.setAttribute('aria-hidden', 'true');
          grid.appendChild(blank);
          continue;
        }
        const bol = bolAtEvent.get(slot.eventIndex);
        if (bol) {
          const rateClass = bol.mark === 'diri' && bol.rate === 2 ? ' sr-bol-diri-fast' : '';
          const endSlot = bol.mark === 'diri' && bol.endRef?.matraIndex === mi
            ? firstSlotOfEvent.get(bol.endRef.eventIndex)
            : null;
          const crossCellSpan = bol.mark === 'diri' && bol.endRef && bol.endRef.matraIndex !== mi;
          if (crossCellSpan) {
            const blank = h('span', 'sr-bol-slot sr-bol-blank sr-bol-covered');
            blank.style.gridColumn = String(slotIndex + 1);
            blank.setAttribute('aria-label', 'First note of a Diri spanning the next note');
            if (Number.isInteger(slot.attackOrdinal)) {
              blank.setAttribute('data-bol-attack-ordinal', String(slot.attackOrdinal));
            }
            grid.appendChild(blank);
            continue;
          }
          const mark = h(
            'span',
            'sr-bol-slot sr-bol-mark sr-bol-' + bol.mark + rateClass + (bol.endRef ? ' sr-bol-diri-span' : ''),
            BOL_SYMBOL[bol.mark] ?? bol.mark
          );
          mark.style.gridColumn = Number.isInteger(endSlot)
            ? `${slotIndex + 1} / ${endSlot + 2}`
            : String(slotIndex + 1);
          mark.setAttribute('data-bol-rate', String(Math.max(1, Number(bol.rate) || 1)));
          if (bol.mark === 'diri') {
            const label = bol.endRef
              ? 'Diri across this and the next note'
              : 'Diri: two strokes on this note';
            mark.setAttribute('aria-label', label);
            mark.title = label;
          }
          if (Number.isInteger(slot.attackOrdinal)) {
            mark.setAttribute('data-bol-attack-ordinal', String(slot.attackOrdinal));
          }
          grid.appendChild(mark);
        } else if (coveringBolAtEvent.has(slot.eventIndex)) {
          const covering = coveringBolAtEvent.get(slot.eventIndex);
          if (covering.ref.matraIndex !== mi) {
            const continuation = h('span', 'sr-bol-slot sr-bol-blank sr-bol-covered');
            continuation.style.gridColumn = String(slotIndex + 1);
            continuation.setAttribute('aria-label', 'Second note of Diri from the previous note');
            if (Number.isInteger(slot.attackOrdinal)) {
              continuation.setAttribute('data-bol-attack-ordinal', String(slot.attackOrdinal));
            }
            grid.appendChild(continuation);
          }
        } else {
          const blank = h('span', 'sr-bol-slot sr-bol-blank', '');
          blank.style.gridColumn = String(slotIndex + 1);
          if (Number.isInteger(slot.attackOrdinal)) {
            blank.setAttribute('data-bol-attack-ordinal', String(slot.attackOrdinal));
          }
          grid.appendChild(blank);
        }
      }
      const layout = h('span', 'sr-bol-layout');
      if (prefixOf.has(mi)) {
        layout.appendChild(h('span', 'sr-phrase-glyph sr-bol-phrase-spacer', prefixOf.get(mi)));
      }
      layout.appendChild(grid);
      if (suffixOf.has(mi)) {
        layout.appendChild(h('span', 'sr-phrase-glyph sr-bol-phrase-spacer', suffixOf.get(mi)));
        const landingMark = repeatLandingOf.get(mi);
        if (landingMark) {
          layout.appendChild(h('span', 'sr-repeat-landing sr-bol-phrase-spacer', `→${landingMark.text}`));
        }
      }
      passRow.appendChild(layout);
      el.appendChild(passRow);
    }
    renderedCells[mi]?.classList.add('sr-has-bol-lane');
    renderedCells[mi]?.style.setProperty('--sr-bol-pass-count', String(bolPasses.length));
    row.appendChild(el);
  }

  // A Diri that crosses a matra boundary is one musical mark, not two point
  // symbols. Draw one V across the row-level grid so its arms land on the
  // exact attack subdivisions in the two cells. The underlying bol slots stay
  // present (and selectable) but visually blank.
  for (let passIndex = 0; passIndex < bolPasses.length; passIndex++) {
    const passLane = bolPasses[passIndex];
    for (const bol of passLane.bols || []) {
      if (bol.mark !== 'diri' || !bol.endRef) continue;
      const fromMatra = Number(bol.ref?.matraIndex);
      const toMatra = Number(bol.endRef?.matraIndex);
      if (!Number.isInteger(fromMatra) || !Number.isInteger(toMatra) || fromMatra === toMatra) continue;
      const fromCol = colOf[fromMatra];
      const toCol = colOf[toMatra];
      const fromGeometry = bolMatraGeometry[fromMatra];
      const toGeometry = bolMatraGeometry[toMatra];
      const fromSlot = fromGeometry?.firstSlotOfEvent.get(bol.ref.eventIndex);
      const toSlot = toGeometry?.firstSlotOfEvent.get(bol.endRef.eventIndex);
      if (
        fromCol === undefined || toCol === undefined ||
        !Number.isInteger(fromSlot) || !Number.isInteger(toSlot)
      ) continue;

      const matraSpan = toMatra - fromMatra + 1;
      const fromX = ((fromSlot + 0.5) / fromGeometry.writtenSlots) * (100 / matraSpan);
      const toX = ((toMatra - fromMatra) + (toSlot + 0.5) / toGeometry.writtenSlots) * (100 / matraSpan);
      const span = h('span', 'sr-bol-cross-span');
      span.setAttribute('data-bol-pass', String(Number(passLane.pass) || 1));
      span.setAttribute('data-from-attack-ordinal', String(bolAttackOffset + (bolPlan.attackByRef.get(`${fromMatra}:${bol.ref.eventIndex}`)?.ordinal ?? 0)));
      span.setAttribute('data-to-attack-ordinal', String(bolAttackOffset + (bolPlan.attackByRef.get(`${toMatra}:${bol.endRef.eventIndex}`)?.ordinal ?? 0)));
      span.setAttribute('aria-label', 'Diri across two notes');
      span.title = 'Diri across these two notes';
      span.style.gridRow = '4';
      span.style.gridColumn = `${fromCol} / ${toCol + 1}`;
      span.style.setProperty('--sr-bol-pass-after', String(Math.max(0, bolPasses.length - passIndex - 1)));
      span.appendChild(diriCrossSvg(fromX, toX));
      row.appendChild(span);
    }
  }

  // SARGAM_SHARED_GEOMETRY_LANES_2026_07_20 — every attachment uses a
  // deterministic lane origin beneath the notation row. Empty lanes collapse,
  // but their order never changes, so a meter span cannot push Diri lower and
  // Preview/Export share the same coordinate space.
  const stack = h('div', 'sr-annotation-stack');
  stack.appendChild(h('div', 'sr-articulation-lane'));
  stack.appendChild(h('div', 'sr-meter-lane'));
  stack.appendChild(h('div', 'sr-anchored-meter-lane'));
  block.appendChild(stack);

  // --- landing reports (derived; spec §3.9 wording, §4 cursor scoping).
  // Shown only while the cursor is on this line — it is a check you run,
  // not part of the notation. Scoping is line-level (spec says "inside a
  // repeat"; column→matra mapping isn't plumbed, and a line is the unit
  // the writer is thinking in).
  if (tal && ctx.activeLine !== undefined && ctx.activeLine === line.sourceLine) {
    for (const pr of line.phraseRepeats) {
      const startAbs = wrapMatra(tal, line.startMatra + performedOffsetAt(line, pr.fromMatra));
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
  if (c && c.sectionIndex === ctx.sectionIndex && c.lineIndex === ctx.lineIndex) {
    const cells = row.querySelectorAll('.sr-cell');
    const localIndex = c.matraIndex - (Number(line._matraOffset) || 0);
    if (colOf[localIndex] !== undefined) cells[localIndex]?.classList.add('sr-active');
  }

  return block;
}

function returnCueText(cue) {
  // The detailed return mode is playback structure. Readers only need the
  // musical instruction; gat@N and gat! therefore render and print as gat.
  return cue?.target || (cue ? 'gat' : '');
}

function sliceLineForSystem(line, tal, from, to, systemIndex, systemCount) {
  if (to < from) return line;
  const offsetRef = (ref) => ({ ...ref, matraIndex: ref.matraIndex - from });
  const sliced = {
    ...line,
    startMatra: tal
      ? wrapMatra(tal, (line.startMatra || 1) + performedOffsetAt(line, from))
      : (line.startMatra || 1) + performedOffsetAt(line, from),
    matras: line.matras.slice(from, to + 1),
    spans: (line.spans || [])
      .filter((span) => span.from.matraIndex >= from && span.to.matraIndex <= to)
      .map((span) => ({ ...span, from: offsetRef(span.from), to: offsetRef(span.to) })),
    phraseRepeats: (line.phraseRepeats || [])
      .filter((repeat) => repeat.fromMatra >= from && repeat.toMatra <= to)
      .map((repeat) => ({
        ...repeat,
        fromMatra: repeat.fromMatra - from,
        toMatra: repeat.toMatra - from,
      })),
    lyrics: (line.lyrics || [])
      .filter((lyric) => lyric.matraIndex >= from && lyric.matraIndex <= to)
      .map((lyric) => ({ ...lyric, matraIndex: lyric.matraIndex - from })),
    bols: (line.bols || [])
      .filter((bol) => bol.ref.matraIndex >= from && bol.ref.matraIndex <= to)
      .map((bol) => ({
        ...bol,
        ref: offsetRef(bol.ref),
        endRef: bol.endRef ? offsetRef(bol.endRef) : undefined,
      })),
    firstEndingFrom:
      Number.isInteger(line.firstEndingFrom) && line.firstEndingFrom >= from && line.firstEndingFrom <= to
        ? line.firstEndingFrom - from
        : null,
    repeatOpen: Boolean(line.lineRepeat && systemIndex === 0),
    repeatClose: Boolean(line.lineRepeat && systemIndex === systemCount - 1),
    returnCue: systemIndex === systemCount - 1 ? line.returnCue : null,
    passthrough: systemIndex === systemCount - 1 ? line.passthrough : [],
    _matraOffset: from,
    _attackOffset: line.matras
      .slice(0, from)
      .flatMap((matra) => matra.events || [])
      .filter((event) => event.type === 'note' && !event.grace)
      .length,
    _isLastSystem: systemIndex === systemCount - 1,
  };
  Object.defineProperty(sliced, '_bars', {
    value: (line._bars || []).filter((bar) => bar > from && bar <= to + 1).map((bar) => bar - from),
    enumerable: false,
  });
  Object.defineProperty(sliced, '_bolLane', {
    value: line._bolLane,
    writable: true,
    enumerable: false,
  });
  Object.defineProperty(sliced, '_bolPasses', {
    value: (line._bolPasses || []).map((lane) => ({
      ...lane,
      bols: (lane.bols || [])
        .filter((bol) => bol.ref.matraIndex >= from && bol.ref.matraIndex <= to)
        .map((bol) => ({
          ...bol,
          ref: offsetRef(bol.ref),
          endRef: bol.endRef ? offsetRef(bol.endRef) : undefined,
        })),
    })),
    writable: true,
    enumerable: false,
  });
  return sliced;
}

/** True if a structural or derived barline falls after 0-based matra k. */
function boundaryAfter(line, k, tal) {
  if (line.firstEndingFrom === k + 1) return true;
  return markerAtMatra(tal, line.startMatra + performedOffsetAt(line, k + 1)) !== null;
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

function renderCell(line, k, tal, prefix, suffix, repeatLanding, ctx) {
  const matra = line.matras[k];
  const evs = matra.events;
  const allSustain = evs.every((e) => e.type === 'sustain');
  const cell = h(
    'div',
    'sr-cell' + (allSustain ? ' sr-dim' : '') + (evs[0]?.holdToVibhag ? ' sr-hold' : '')
  );
  const globalMatraIndex = (Number(line._matraOffset) || 0) + k;
  const geometryMatra = ctx.geometry?.matras?.[globalMatraIndex] || null;
  cell.setAttribute('data-matra', String(globalMatraIndex));
  if (tal) {
    cell.setAttribute(
      'data-cycle-matra',
      String(wrapMatra(tal, line.startMatra + performedOffsetAt(line, k)))
    );
  }

  // Build timed slots before the upper lanes. Repeated local approaches need
  // the same slot columns twice: once for their ordinary kan arcs above the
  // tala marker, and once for the written destinations below it. Keeping both
  // grids in flow prevents print reflow from putting an arc through a marker.
  const visualSlots = [];
  let geometrySlotIndex = 0;
  let pendingInBeatGraces = [];
  for (let eventIndex = 0; eventIndex < evs.length; eventIndex++) {
    const e = evs[eventIndex];
    if (e.grace) {
      if (!e.preBeat) pendingInBeatGraces.push({ event: e, eventIndex });
      continue;
    }
    visualSlots.push({
      event: e,
      eventIndex,
      graces: pendingInBeatGraces,
      hold: false,
      geometry: geometryMatra?.slots?.[geometrySlotIndex++] || null,
    });
    pendingInBeatGraces = [];
    const writtenSlots = Math.max(1, Number(e.writtenSlots) || 1);
    for (let slot = 1; slot < writtenSlots; slot++) {
      visualSlots.push({ event: { type: 'sustain' }, hold: true, geometry: geometryMatra?.slots?.[geometrySlotIndex++] || null });
    }
  }
  const hasLocalApproach = visualSlots.some((item) => item.event?.approachSlide && !item.hold);
  const longestGraceRun = visualSlots.reduce(
    (longest, item) => Math.max(longest, item.graces?.length || 0),
    0
  );
  // A regular matra occupies one grid unit. Dense rhythmic clusters, kan
  // ornaments, approach slides, and repeat endings reserve more horizontal
  // units instead of making their notation progressively microscopic. Cell
  // mode uses the same hint for a modest expansion; true graph-paper mode
  // maps the hint to two or three exact squares.
  let gridSpan = visualSlots.length >= 7 ? 3 : visualSlots.length >= 4 ? 2 : 1;
  if (longestGraceRun > 0 || hasLocalApproach || suffix || repeatLanding) {
    gridSpan = Math.max(gridSpan, 2);
  }
  if (
    longestGraceRun >= 4 ||
    (visualSlots.length >= 4 && (suffix || repeatLanding))
  ) {
    gridSpan = 3;
  }
  cell.setAttribute('data-grid-span', String(gridSpan));
  const slotColumns = hasLocalApproach
    ? visualSlots
        .map((item) => item.event?.approachSlide && !item.hold
          ? 'minmax(1.55em, max-content)'
          : 'minmax(0.84em, max-content)')
        .join(' ')
    : `repeat(${visualSlots.length}, minmax(0.84em, max-content))`;

  if (hasLocalApproach) {
    const approachLane = h('div', 'sr-local-approach-lane');
    approachLane.style.gridTemplateColumns = slotColumns;
    for (const item of visualSlots) {
      const arcSlot = h('span', 'sr-local-approach-arc-slot');
      if (item.event?.approachSlide && !item.hold) {
        const arc = h('span', 'sr-local-approach-arc sr-arc-kan');
        arc.appendChild(meendSvg());
        arcSlot.appendChild(arc);
      }
      approachLane.appendChild(arcSlot);
    }
    cell.appendChild(approachLane);
  }

  // Marker lane: derived from tal + start offset; empty node keeps rows aligned.
  const markerText = tal
    ? markerAtMatra(tal, wrapMatra(tal, line.startMatra + performedOffsetAt(line, k)))
    : null;
  cell.appendChild(h('div', 'sr-marker', markerText ?? ''));

  // Glyphs. Cross-beat graces remain before the metric grid. Same-beat
  // ornaments sit inside their destination's slot, which keeps a scoped
  // krintan such as [-[[RS]]-.n] over the S position rather than before the
  // beat's leading hold.
  const glyphs = h('div', 'sr-glyphs');
  if (prefix) glyphs.appendChild(h('span', 'sr-phrase-glyph sr-phrase-prefix', prefix));
  for (const e of evs.filter((event) => event.grace && event.preBeat)) {
    glyphs.appendChild(renderEvent(e, ctx));
  }

  if (visualSlots.length > 0) {
    const slots = h('span', 'sr-timed-slots');
    slots.setAttribute('data-written-slots', String(visualSlots.length));
    slots.style.setProperty('--sr-written-slots', String(visualSlots.length));
    // Every written microbeat is a real, discrete column. Do not use `1fr`
    // in an intrinsic-width inline grid: browsers can collapse those tracks
    // until adjacent em dashes read as one stretched line. Fixed minimum
    // slot widths plus a visible gap make DnS- and g--- unambiguously four
    // written positions while still allowing wide Western spellings to grow.
    slots.style.gridTemplateColumns = slotColumns;
    for (let slotIndex = 0; slotIndex < visualSlots.length; slotIndex++) {
      const item = visualSlots[slotIndex];
      const slot = h('span', 'sr-slot' + (item.hold ? ' sr-hold-slot' : ''));
      slot.setAttribute('data-slot-index', String(slotIndex));
      slot.setAttribute('data-slot-kind', item.hold ? 'hold' : 'attack');
      if (item.geometry) {
        slot.setAttribute('data-geometry-start', item.geometry.startLabel);
        slot.setAttribute('data-geometry-end', item.geometry.endLabel);
        slot.setAttribute('data-geometry-event', String(item.geometry.eventIndex));
      }
      if (item.geometry?.kind === 'attack') {
        slot.classList.add('sr-anchor-target');
        slot.setAttribute('data-anchor-kind', 'attack');
        slot.setAttribute('data-anchor-line', String(item.geometry.sourceLine));
        slot.setAttribute('data-anchor-time', item.geometry.startLabel);
        slot.setAttribute('data-anchor-ordinal', String(item.geometry.attackOrdinal));
        slot.setAttribute('data-anchor-note', item.geometry.note || '');
        slot.setAttribute('data-anchor-octave', String(item.geometry.octave || 0));
      }
      if (!item.hold && item.graces?.length) {
        const scopedKrintan = line.spans.some((span) =>
          span.type === 'krintan' &&
          span.scoped &&
          span.from.matraIndex === k &&
          span.to.matraIndex === k &&
          span.to.eventIndex === item.eventIndex &&
          item.graces.some((grace) => grace.eventIndex === span.from.eventIndex)
        );
        const ornament = h(
          'span',
          'sr-slot-ornament' + (scopedKrintan ? ' sr-scoped-krintan' : '')
        );
        const graceRun = h('span', 'sr-ornament-graces');
        for (const grace of item.graces) graceRun.appendChild(renderEvent(grace.event, ctx));
        ornament.appendChild(graceRun);
        ornament.appendChild(renderEvent(item.event, ctx));
        slot.appendChild(ornament);
      } else {
        slot.appendChild(renderEvent(item.event, ctx, item.hold));
      }
      slots.appendChild(slot);
    }
    glyphs.appendChild(slots);
  }
  if (suffix) {
    const report = h('span', 'sr-phrase-report');
    report.appendChild(h('span', 'sr-phrase-glyph sr-phrase-suffix', suffix));
    if (repeatLanding) {
      const landingMark = h('span', 'sr-repeat-landing', `→${repeatLanding.text}`);
      landingMark.title = `The repeated phrase continues at tala matra ${repeatLanding.matra}`;
      report.appendChild(landingMark);
    }
    glyphs.appendChild(report);
  }
  cell.appendChild(glyphs);

  // Automatic under-arc on subdivided matras (spec principle 2).
  // The LANE is reserved in every cell — an empty slot when the matra
  // isn't subdivided — because cells bottom-align: an optional lane made
  // plain matras shorter, dropping their glyph and their marker below
  // their neighbours' (M, 2026-07-16). Same idiom as the marker lane.
  // Under-arc = rhythmic subdivision of TIMED notes only (M, 2026-07-16);
  // graces never trigger it. {dP}m: curve only. {d}Pm: curve + arc.
  const writtenSlotCount = visualSlots.length;
  cell.setAttribute('data-grid-subdivisions', String(Math.max(1, writtenSlotCount)));
  cell.appendChild(writtenSlotCount > 1 ? underarcSvg() : h('div', 'sr-arc-lane sr-arc-slot'));

  // Exact metric boundaries are part of the core render geometry. The left
  // edge exists on every matra; the final right edge exists once, on the last
  // source-line cell. Anchor handles and folded meter continuations snap here.
  const startBoundary = h('span', 'sr-boundary-target sr-boundary-start');
  stampBoundary(startBoundary, line.sourceLine, geometryMatra?.startLabel ?? String(globalMatraIndex));
  glyphs.appendChild(startBoundary);
  if (globalMatraIndex === (ctx.geometry?.matras?.length || 0) - 1) {
    const endBoundary = h('span', 'sr-boundary-target sr-boundary-end');
    stampBoundary(endBoundary, line.sourceLine, geometryMatra?.endLabel ?? String(globalMatraIndex + 1));
    glyphs.appendChild(endBoundary);
  }

  return cell;
}

function stampBoundary(node, sourceLine, time) {
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('data-anchor-kind', 'boundary');
  node.setAttribute('data-anchor-line', String(sourceLine));
  node.setAttribute('data-anchor-time', String(time));
  node.setAttribute('data-anchor-boundary', String(time));
}

// Every event carries the same three lanes — dots above, character, dots
// below — even when a lane is empty, and rests/sustains share the shape.
// Optional lanes made events different heights; since cells bottom-align,
// a plain madhya note sat lower than a mandra or subdivided neighbour and
// dragged its marker down with it (M, 2026-07-16). Reserved lanes make
// every cell the same height, so glyphs and markers line up across a row.
// SARGAM_APPROACH_SLIDE_RENDER_2026_07_20 — one untimed source pitch bends into one timed
// destination. It is not a separate strike and not a whole-span meend.
function renderApproachSlideEvent(e, ctx) {
  const o = e.octave || 0;
  const reg = o < 0 ? ' sr-reg-cool' : o > 0 ? ' sr-reg-warm' : '';
  const ev = h('span', 'sr-ev sr-note sr-approach-slide' + reg);
  const above = h('span', 'sr-dots sr-dots-above');
  for (let i = 0; i < Math.max(0, o); i++) above.appendChild(h('span', 'sr-dot sr-dot-above', '•'));
  ev.appendChild(above);
  const body = h('span', 'sr-approach-slide-body');
  const approach = { type: 'note', ch: e.approachSlide.ch, octave: e.approachSlide.octave || 0 };
  body.appendChild(h('span', 'sr-approach-source', chOf(approach, ctx)));
  body.appendChild(h('span', 'sr-ch sr-approach-destination', chOf(e, ctx)));
  ev.appendChild(body);
  const below = h('span', 'sr-dots sr-dots-below');
  for (let i = 0; i < Math.max(0, -o); i++) below.appendChild(h('span', 'sr-dot sr-dot-below', '•'));
  ev.appendChild(below);
  return ev;
}

function renderEvent(e, ctx, microHold = false) {
  if (!microHold && e.type === 'note' && e.approachSlide) return renderApproachSlideEvent(e, ctx);
  const isNote = e.type === 'note';
  const o = isNote ? e.octave || 0 : 0;
  const reg = o < 0 ? ' sr-reg-cool' : o > 0 ? ' sr-reg-warm' : '';
  const cls =
    e.type === 'rest'
      ? 'sr-ev sr-rest sr-dim'
      : e.type === 'sustain'
        ? 'sr-ev sr-sustain sr-dim' + (microHold ? ' sr-micro-hold' : '')
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

function appendLineRepeatMarker(row, kind, column) {
  const marker = h(
    'span',
    `sr-line-repeat-marker sr-line-repeat-${kind}`,
    kind === 'open' ? '||:' : ':||'
  );
  marker.setAttribute('aria-label', kind === 'open' ? 'Repeat begins' : 'Repeat ends');
  marker.setAttribute('data-repeat-boundary', kind);
  marker.style.gridRow = '2';
  marker.style.gridColumn = String(column);
  row.appendChild(marker);
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

/** A cross-cell Diri uses the same compact V as an in-cell Diri. The rule
 * beneath it carries that one symbol between the two attack positions; the V
 * itself does not stretch wider just because the notes are farther apart. */
function diriCrossSvg(fromX, toX) {
  const middle = (fromX + toX) / 2;
  const halfWidth = Math.min(8, Math.max(6, (toX - fromX) * 0.15));
  return svgEl(
    'sr-bol-cross-svg',
    `M${fromX},19 L${toX},19 M${middle - halfWidth},2 L${middle},17 L${middle + halfWidth},2`
  );
}

// ---------------------------------------------------------------------------

function h(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
