// src/shell/anchor-overlay.js — stamps rendered attacks/boundaries as precise
// musical targets, aligns tala markers to the real boundary attack, and draws
// articulation and meter annotations in separate lower lanes.

import { rationalNumber } from '../engine/meter.js';
import {
  attackCenterX,
  endpointEdgeX,
  xForMetricTime,
} from './score-geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvg(className, width, height) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, width)} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  return svg;
}

export function anchoredMeterBracketPath(width) {
  const right = Math.max(17, Number(width) - 1);
  return `M 1 1 L 1 15 L ${right} 15 L ${right} 1`;
}

function emFromPx(container, px) {
  const fontSize = Number.parseFloat(getComputedStyle(container).fontSize) || 16;
  return Number(px) / fontSize;
}

function setInlineSpanInEm(el, container, leftPx, widthPx = null) {
  el.style.left = `${emFromPx(container, leftPx)}em`;
  if (widthPx != null) el.style.width = `${emFromPx(container, widthPx)}em`;
}

function setInlineSpanInPercent(el, leftPx, widthPx, totalPx) {
  const total = Number(totalPx);
  if (!(total > 0)) return false;
  el.style.left = `${(Number(leftPx) / total) * 100}%`;
  el.style.width = `${(Number(widthPx) / total) * 100}%`;
  return true;
}

function targetPayload(node) {
  if (!node) return null;
  const kind = node.getAttribute('data-anchor-kind');
  if (!kind) return null;
  return {
    anchorKind: kind,
    sourceLine: Number(node.getAttribute('data-anchor-line')),
    time: node.getAttribute('data-anchor-time'),
    ordinal: Number(node.getAttribute('data-anchor-ordinal')),
    note: node.getAttribute('data-anchor-note'),
    octave: Number(node.getAttribute('data-anchor-octave') || 0),
    boundary: node.getAttribute('data-anchor-boundary'),
  };
}

function systemForNode(node) {
  return node?.closest('.sr-line-block');
}

function targetSelector(endpoint) {
  if (!endpoint) return null;
  const line = CSS.escape(String(endpoint.sourceLine));
  if (endpoint.kind === 'boundary') {
    return `[data-anchor-kind="boundary"][data-anchor-line="${line}"][data-anchor-time="${CSS.escape(String(endpoint.time))}"]`;
  }
  return `[data-anchor-kind="attack"][data-anchor-line="${line}"][data-anchor-ordinal="${CSS.escape(String(endpoint.ordinal))}"]`;
}

function findTarget(root, endpoint) {
  const selector = targetSelector(endpoint);
  return selector ? root.querySelector(selector) : null;
}

export function alignTalaMarkers(root) {
  for (const cell of root.querySelectorAll('.sr-cell')) {
    const marker = cell.querySelector(':scope > .sr-marker');
    if (!marker || !marker.textContent.trim()) continue;
    marker.style.removeProperty('--sr-marker-shift');
    marker.classList.remove('sr-marker-on-boundary');
    const firstTimedSlot = cell.querySelector('.sr-timed-slots > .sr-slot');
    const attack = firstTimedSlot?.querySelector('.sr-note:not(.sr-grace)') ? firstTimedSlot : null;
    const cellRect = cell.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    if (attack) {
      const attackRect = (attack.querySelector('.sr-approach-destination, .sr-ch') || attack).getBoundingClientRect();
      const target = attackRect.left + attackRect.width / 2;
      const current = markerRect.left + markerRect.width / 2;
      marker.style.setProperty('--sr-marker-shift', `${target - current}px`);
    } else {
      const target = cellRect.left;
      const current = markerRect.left + markerRect.width / 2;
      marker.style.setProperty('--sr-marker-shift', `${target - current}px`);
      marker.classList.add('sr-marker-on-boundary');
    }
  }
}

function ensureLane(block, className) {
  let lane = block.querySelector(`:scope > .sr-annotation-stack > .${className}`)
    || block.querySelector(`:scope > .${className}`);
  if (!lane) {
    let stack = block.querySelector(':scope > .sr-annotation-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'sr-annotation-stack';
      block.appendChild(stack);
    }
    lane = document.createElement('div');
    lane.className = className;
    stack.appendChild(lane);
  }
  return lane;
}

function pointGlyph(mark, block, node, selected, onSelect) {
  const lane = ensureLane(block, 'sr-articulation-lane');
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `sr-anchor-mark sr-anchor-${mark.kind}${selected ? ' selected' : ''}${mark.status !== 'resolved' ? ` sr-anchor-${mark.status}` : ''}`;
  setInlineSpanInEm(el, lane, attackCenterX(lane, node));
  el.dataset.markId = mark.id;
  el.title = `${mark.kind} annotation`;
  el.textContent = mark.kind === 'da' ? '|' : mark.kind === 'ra' ? '—' : '^';
  el.addEventListener('click', (event) => { event.stopPropagation(); onSelect?.(mark.id); });
  lane.appendChild(el);
}

function addDiriHandles(holder, mark, onHandleStart) {
  for (const side of ['start', 'end']) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'sr-anchor-handle';
    if (side === 'start') handle.style.left = '0';
    else { handle.style.left = 'auto'; handle.style.right = '0'; }
    handle.setAttribute('aria-label', `Move ${side} of diri`);
    handle.addEventListener('pointerdown', (event) => { event.stopPropagation(); onHandleStart?.(event, mark.id, side); });
    holder.appendChild(handle);
  }
}

function inlineDiriGlyph(mark, a, b, selected, onSelect, onHandleStart) {
  const grid = a?.closest('.sr-timed-slots');
  if (!grid || b?.closest('.sr-timed-slots') !== grid) return false;
  const gridRect = grid.getBoundingClientRect();
  const left = attackCenterX(grid, a);
  const right = attackCenterX(grid, b);
  if (left == null || right == null || !(gridRect.width > 0)) return false;

  const holder = document.createElement('div');
  holder.className = `sr-diri-mark sr-diri-inline${selected ? ' selected' : ''}${mark.status !== 'resolved' ? ` sr-anchor-${mark.status}` : ''}`;
  if (!setInlineSpanInPercent(holder, Math.min(left, right), Math.abs(right - left), gridRect.width)) return false;
  holder.dataset.markId = mark.id;
  holder.dataset.diriPlacement = 'slot-grid';

  const svg = createSvg('sr-diri-svg', 100, 10);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M 1 1 L 50 9 L 99 1');
  svg.appendChild(path);
  holder.appendChild(svg);
  holder.addEventListener('click', (event) => { event.stopPropagation(); onSelect?.(mark.id); });
  addDiriHandles(holder, mark, onHandleStart);
  grid.appendChild(holder);
  return true;
}

function diriGlyph(mark, block, a, b, selected, onSelect, onHandleStart) {
  // A normal Diri connects two attacks in one written subdivision grid. Keep
  // the V inside that grid and express its endpoints as percentages, so page
  // scaling and print packing cannot detach it from the two note centers.
  if (inlineDiriGlyph(mark, a, b, selected, onSelect, onHandleStart)) {
    const reserve = document.createElement('span');
    reserve.className = 'sr-lane-reserve';
    reserve.setAttribute('aria-hidden', 'true');
    ensureLane(block, 'sr-articulation-lane').appendChild(reserve);
    return;
  }

  // Cross-matra fallback: retain the existing block-lane geometry.
  const lane = ensureLane(block, 'sr-articulation-lane');
  const left = attackCenterX(lane, a);
  const right = attackCenterX(lane, b);
  if (left == null || right == null) return;
  const holder = document.createElement('div');
  holder.className = `sr-diri-mark sr-diri-fallback${selected ? ' selected' : ''}${mark.status !== 'resolved' ? ` sr-anchor-${mark.status}` : ''}`;
  setInlineSpanInEm(holder, lane, Math.min(left, right), Math.max(12, Math.abs(right - left)));
  holder.dataset.markId = mark.id;
  holder.dataset.diriPlacement = 'line-lane';
  const svg = createSvg('sr-diri-svg', Math.max(12, Math.abs(right - left)), 10);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', `M 1 1 L ${Math.max(6, Math.abs(right - left) / 2)} 9 L ${Math.max(11, Math.abs(right - left) - 1)} 1`);
  svg.appendChild(path);
  holder.appendChild(svg);
  holder.addEventListener('click', (event) => { event.stopPropagation(); onSelect?.(mark.id); });
  addDiriHandles(holder, mark, onHandleStart);
  lane.appendChild(holder);
}

function meterSegments(root, mark, startNode, endNode) {
  const start = rationalNumber(parseFraction(mark.resolvedStart?.time));
  const end = rationalNumber(parseFraction(mark.resolvedEnd?.time));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const group = root.querySelector(`.sr-line-group[data-source-line="${CSS.escape(String(mark.resolvedStart.sourceLine))}"]`);
  if (!group) return [];
  const segments = [];
  for (const block of group.querySelectorAll('.sr-line-block')) {
    const from = Number(block.getAttribute('data-system-from') || 0);
    const to = Number(block.getAttribute('data-system-to') || from) + 1;
    const a = Math.max(start, from);
    const b = Math.min(end, to);
    if (b <= a + 1e-8) continue;
    segments.push({
      block,
      from: a,
      to: b,
      continuation: a > start + 1e-8,
      final: b >= end - 1e-8,
      startNode: a <= start + 1e-8 && systemForNode(startNode) === block ? startNode : null,
      endNode: b >= end - 1e-8 && systemForNode(endNode) === block ? endNode : null,
    });
  }
  return segments;
}

function parseFraction(value) {
  const match = String(value ?? '').match(/^(-?\d+)(?:\/(\d+))?$/);
  if (!match) return null;
  return { n: Number(match[1]), d: Number(match[2] || 1) };
}

function meterGlyph(mark, segment, selected, onSelect, onHandleStart) {
  const { block, from, to, continuation, final, startNode, endNode } = segment;
  const lane = ensureLane(block, 'sr-anchored-meter-lane');
  // Attack spans use the outside edges of the selected written slots—the
  // same geometry that the one-beat under-arc encloses. Fold continuations
  // land on exact core-rendered metric boundaries.
  const left = startNode
    ? endpointEdgeX(lane, startNode, 'start')
    : xForMetricTime(lane, block, from, 'start');
  const right = endNode
    ? endpointEdgeX(lane, endNode, 'end')
    : xForMetricTime(lane, block, to, 'end');
  if (left == null || right == null) return;
  const el = document.createElement('div');
  el.className = `sr-anchored-meter${selected ? ' selected' : ''}${mark.status !== 'resolved' ? ` sr-anchor-${mark.status}` : ''}`;
  setInlineSpanInEm(el, lane, left, Math.max(18, right - left));
  el.dataset.markId = mark.id;
  const svg = createSvg('sr-anchored-meter-svg', Math.max(18, right - left), 18);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', anchoredMeterBracketPath(Math.max(18, right - left)));
  svg.appendChild(path);
  el.appendChild(svg);
  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'sr-anchored-meter-label';
  label.textContent = `${continuation ? '↳ ' : ''}${mark.value}${mark.status !== 'resolved' ? ' ⚠' : ''}`;
  label.addEventListener('click', (event) => { event.stopPropagation(); onSelect?.(mark.id); });
  el.appendChild(label);
  if (!continuation) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'sr-anchor-handle sr-meter-handle';
    handle.style.left = '0px';
    handle.setAttribute('aria-label', 'Move meter start');
    handle.addEventListener('pointerdown', (event) => { event.stopPropagation(); onHandleStart?.(event, mark.id, 'start'); });
    el.appendChild(handle);
  }
  if (final) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'sr-anchor-handle sr-meter-handle';
    handle.style.right = '0px';
    handle.setAttribute('aria-label', 'Move meter end');
    handle.addEventListener('pointerdown', (event) => { event.stopPropagation(); onHandleStart?.(event, mark.id, 'end'); });
    el.appendChild(handle);
  }
  lane.appendChild(el);
}

export function stampAnchorTargets(root, sourceText) {
  // render.js now stamps exact attacks, slot edges, and boundaries directly
  // from the parsed model. Keep this public seam for Preview/Export callers and
  // for static marker alignment; sourceText is intentionally no longer parsed.
  void sourceText;
  alignTalaMarkers(root);
}

export function mountAnchorOverlays(root, marks = [], options = {}) {
  if (!root) return () => {};
  root.querySelectorAll('.sr-diri-inline').forEach((node) => node.remove());
  root.querySelectorAll('.sr-articulation-lane,.sr-anchored-meter-lane').forEach((node) => node.replaceChildren());
  for (const mark of marks) {
    if (!mark.resolvedStart || mark.status === 'missing' || mark.status === 'ambiguous') continue;
    const startNode = findTarget(root, mark.resolvedStart);
    const endNode = mark.resolvedEnd ? findTarget(root, mark.resolvedEnd) : null;
    if (!startNode) continue;
    const block = systemForNode(startNode);
    if (!block) continue;
    const selected = options.selectedMarkId === mark.id;
    if (['da', 'ra', 'chikari'].includes(mark.kind)) {
      pointGlyph(mark, block, startNode, selected, options.onSelectMark);
    } else if (mark.kind === 'diri' && endNode && systemForNode(endNode) === block) {
      diriGlyph(mark, block, startNode, endNode, selected, options.onSelectMark, options.onHandleStart);
    } else if (mark.kind === 'meter' && mark.resolvedEnd) {
      for (const segment of meterSegments(root, mark, startNode, endNode)) {
        meterGlyph(mark, segment, selected, options.onSelectMark, options.onHandleStart);
      }
    }
  }
  return () => {};
}

export function closestAnchorTarget(target) {
  const node = target?.closest?.('[data-anchor-kind="attack"],[data-anchor-kind="boundary"]');
  return node ? { node, payload: targetPayload(node) } : null;
}
