// src/shell/anchor-overlay.js — stamps rendered attacks/boundaries as precise
// musical targets, aligns tala markers to the real boundary attack, and draws
// articulation and meter annotations in separate lower lanes.

import { formatRational, rationalNumber, scanMusicLine } from '../engine/meter.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvg(className, width, height) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', `0 0 ${Math.max(1, width)} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  return svg;
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
    boundary: node.getAttribute('data-anchor-boundary'),
  };
}

function xWithin(block, node) {
  const br = block.getBoundingClientRect();
  const nr = node.getBoundingClientRect();
  return nr.left + nr.width / 2 - br.left;
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

function stampLine(group, sourceText) {
  const sourceLine = Number(group.getAttribute('data-source-line'));
  const line = String(sourceText ?? '').split(/\r?\n/)[sourceLine - 1] ?? '';
  // Repeat glyphs are structural wrappers, not attack syntax. Strip them
  // before using the meter scanner so repeated lines expose anchors too.
  const scanLine = line.replace(/\|\|:|:\|\|/g, ' ');
  const scanned = scanMusicLine(scanLine);
  if (scanned.error) return;
  const slots = [...group.querySelectorAll('.sr-slot[data-slot-kind="attack"]')]
    .filter((slot) => slot.querySelector('.sr-note:not(.sr-grace)'));
  const count = Math.min(slots.length, scanned.attacks.length);
  for (let i = 0; i < count; i++) {
    const slot = slots[i];
    const attack = scanned.attacks[i];
    slot.classList.add('sr-anchor-target');
    slot.setAttribute('data-anchor-kind', 'attack');
    slot.setAttribute('data-anchor-line', String(sourceLine));
    slot.setAttribute('data-anchor-time', formatRational(attack.time));
    slot.setAttribute('data-anchor-ordinal', String(i));
    slot.setAttribute('data-anchor-note', attack.ch || '');
  }
  for (const cell of group.querySelectorAll('.sr-cell[data-matra]')) {
    const time = String(cell.getAttribute('data-matra') || 0);
    let target = cell.querySelector(':scope > .sr-boundary-target');
    if (!target) {
      target = document.createElement('span');
      target.className = 'sr-boundary-target';
      target.setAttribute('aria-hidden', 'true');
      cell.appendChild(target);
    }
    target.setAttribute('data-anchor-kind', 'boundary');
    target.setAttribute('data-anchor-line', String(sourceLine));
    target.setAttribute('data-anchor-time', time);
    target.setAttribute('data-anchor-boundary', time);
  }
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
      const attackRect = attack.getBoundingClientRect();
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
  let lane = block.querySelector(`:scope > .${className}`);
  if (!lane) {
    lane = document.createElement('div');
    lane.className = className;
    block.appendChild(lane);
  }
  return lane;
}

function pointGlyph(mark, block, node, selected, onSelect) {
  const lane = ensureLane(block, 'sr-articulation-lane');
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `sr-anchor-mark sr-anchor-${mark.kind}${selected ? ' selected' : ''}${mark.status !== 'resolved' ? ` sr-anchor-${mark.status}` : ''}`;
  el.style.left = `${xWithin(block, node)}px`;
  el.dataset.markId = mark.id;
  el.title = `${mark.kind} annotation`;
  el.textContent = mark.kind === 'da' ? '|' : mark.kind === 'ra' ? '—' : '^';
  el.addEventListener('click', (event) => { event.stopPropagation(); onSelect?.(mark.id); });
  lane.appendChild(el);
}

function diriGlyph(mark, block, a, b, selected, onSelect, onHandleStart) {
  const lane = ensureLane(block, 'sr-articulation-lane');
  const left = xWithin(block, a);
  const right = xWithin(block, b);
  const holder = document.createElement('div');
  holder.className = `sr-diri-mark${selected ? ' selected' : ''}${mark.status !== 'resolved' ? ` sr-anchor-${mark.status}` : ''}`;
  holder.style.left = `${Math.min(left, right)}px`;
  holder.style.width = `${Math.max(12, Math.abs(right - left))}px`;
  holder.dataset.markId = mark.id;
  const svg = createSvg('sr-diri-svg', Math.max(12, Math.abs(right - left)), 20);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', `M 1 1 L ${Math.max(6, Math.abs(right - left) / 2)} 17 L ${Math.max(11, Math.abs(right - left) - 1)} 1`);
  svg.appendChild(path);
  holder.appendChild(svg);
  holder.addEventListener('click', (event) => { event.stopPropagation(); onSelect?.(mark.id); });
  for (const [side, x] of [['start', 0], ['end', Math.max(12, Math.abs(right - left))]]) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'sr-anchor-handle';
    handle.style.left = `${x}px`;
    handle.setAttribute('aria-label', `Move ${side} of diri`);
    handle.addEventListener('pointerdown', (event) => { event.stopPropagation(); onHandleStart?.(event, mark.id, side); });
    holder.appendChild(handle);
  }
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

function xForTime(block, time) {
  const cell = [...block.querySelectorAll('.sr-cell[data-matra]')]
    .find((node) => Number(node.getAttribute('data-matra')) === Math.floor(time + 1e-8));
  if (!cell) {
    const cells = [...block.querySelectorAll('.sr-cell[data-matra]')];
    const last = cells[cells.length - 1];
    if (!last) return null;
    const br = block.getBoundingClientRect();
    const lr = last.getBoundingClientRect();
    return lr.right - br.left;
  }
  const br = block.getBoundingClientRect();
  const cr = cell.getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, time - Math.floor(time)));
  return cr.left - br.left + cr.width * fraction;
}

function meterGlyph(mark, segment, selected, onSelect, onHandleStart) {
  const { block, from, to, continuation, final, startNode, endNode } = segment;
  const lane = ensureLane(block, 'sr-anchored-meter-lane');
  const left = startNode ? xWithin(block, startNode) : xForTime(block, from);
  const right = endNode ? xWithin(block, endNode) : xForTime(block, to);
  if (left == null || right == null) return;
  const el = document.createElement('div');
  el.className = `sr-anchored-meter${selected ? ' selected' : ''}${mark.status !== 'resolved' ? ` sr-anchor-${mark.status}` : ''}`;
  el.style.left = `${left}px`;
  el.style.width = `${Math.max(18, right - left)}px`;
  el.dataset.markId = mark.id;
  const svg = createSvg('sr-anchored-meter-svg', Math.max(18, right - left), 18);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', `M 1 1 Q ${Math.max(9, (right - left) / 2)} 15 ${Math.max(17, right - left - 1)} 1`);
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
  for (const group of root.querySelectorAll('.sr-line-group[data-source-line]')) stampLine(group, sourceText);
  alignTalaMarkers(root);
}

export function mountAnchorOverlays(root, marks = [], options = {}) {
  if (!root) return () => {};
  root.querySelectorAll('.sr-articulation-lane,.sr-anchored-meter-lane').forEach((node) => node.remove());
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
