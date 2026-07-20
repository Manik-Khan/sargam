// src/shell/meter-overlay.js — DOM-only display adapter for meter spans.
// The engine data stays exact fractions; this file measures the already
// rendered notation so a lower arch can follow folded systems and micro-slots.

import { rationalNumber } from '../engine/meter.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function pointX(block, timeValue) {
  const time = rationalNumber(timeValue);
  if (!Number.isFinite(time)) return null;
  const systemFrom = Number(block.getAttribute('data-system-from') || 0);
  const systemTo = Number(block.getAttribute('data-system-to') || systemFrom);
  const blockRect = block.getBoundingClientRect();
  if (Math.abs(time - (systemTo + 1)) < 1e-8) {
    const last = block.querySelector(`.sr-cell[data-matra="${systemTo}"]`);
    if (!last) return null;
    return last.getBoundingClientRect().right - blockRect.left;
  }
  const matra = Math.floor(time + 1e-8);
  if (matra < systemFrom || matra > systemTo) return null;
  const cell = block.querySelector(`.sr-cell[data-matra="${matra}"]`);
  if (!cell) return null;
  const offset = Math.max(0, Math.min(1, time - matra));
  const slots = [...cell.querySelectorAll('.sr-timed-slots > .sr-slot')];
  const cellRect = cell.getBoundingClientRect();
  if (!slots.length) return cellRect.left - blockRect.left + cellRect.width * offset;
  const boundary = Math.max(0, Math.min(slots.length, Math.round(offset * slots.length)));
  if (boundary === slots.length) return slots[slots.length - 1].getBoundingClientRect().right - blockRect.left;
  return slots[boundary].getBoundingClientRect().left - blockRect.left;
}

function makeArch(span, left, right, continuation = false) {
  const el = document.createElement('div');
  el.className = 'sr-meter-span' + (span.valid === false ? ' sr-meter-invalid' : '') + (span.draft ? ' sr-meter-draft' : '');
  el.style.left = `${Math.min(left, right)}px`;
  el.style.width = `${Math.max(12, Math.abs(right - left))}px`;
  el.title = span.message || `${span.label} local meter`;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 18');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('sr-meter-svg');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M2,2 Q50,17 98,2');
  svg.appendChild(path);
  el.appendChild(svg);

  const label = document.createElement('div');
  label.className = 'sr-meter-label';
  label.textContent = `${continuation ? '↳ ' : ''}${span.label}`;
  el.appendChild(label);
  return el;
}

function highlightDraft(block, span, from, to) {
  const start = rationalNumber(from);
  const end = rationalNumber(to);
  for (const cell of block.querySelectorAll('.sr-cell[data-matra]')) {
    const matra = Number(cell.getAttribute('data-matra'));
    const slots = [...cell.querySelectorAll('.sr-timed-slots > .sr-slot')];
    if (!slots.length) {
      if (matra + 1 > start && matra <= end + 1e-8) cell.classList.add('sr-meter-selected');
      continue;
    }
    for (let i = 0; i < slots.length; i++) {
      const slotStart = matra + i / slots.length;
      const slotEnd = matra + (i + 1) / slots.length;
      if (slotEnd > start + 1e-8 && slotStart <= end + 1e-8) slots[i].classList.add('sr-meter-selected');
    }
  }
}

export function mountMeterOverlays(root, spans = [], draft = null) {
  if (!root) return;
  root.querySelectorAll('.sr-meter-lane').forEach((node) => node.remove());
  root.querySelectorAll('.sr-meter-selected').forEach((node) => node.classList.remove('sr-meter-selected'));
  const all = [...(spans || [])];
  if (draft?.ok !== false && draft?.sourceLine) all.push({ ...draft, draft: true });

  for (const group of root.querySelectorAll('.sr-line-group[data-source-line]')) {
    const sourceLine = Number(group.getAttribute('data-source-line'));
    const lineSpans = all.filter((span) => Number(span.sourceLine) === sourceLine);
    if (!lineSpans.length) continue;
    for (const block of group.querySelectorAll('.sr-line-block')) {
      const systemFrom = Number(block.getAttribute('data-system-from') || 0);
      const systemTo = Number(block.getAttribute('data-system-to') || systemFrom);
      const systemStart = systemFrom;
      const systemEnd = systemTo + 1;
      const segments = lineSpans
        .map((span) => {
          const start = rationalNumber(span.start);
          const end = rationalNumber(span.end);
          return { span, start: Math.max(start, systemStart), end: Math.min(end, systemEnd), originalStart: start };
        })
        .filter((segment) => segment.end > segment.start + 1e-8);
      if (!segments.length) continue;
      const lane = document.createElement('div');
      lane.className = 'sr-meter-lane';
      block.appendChild(lane);
      for (const segment of segments) {
        const left = pointX(block, { n: Math.round(segment.start * 1000000), d: 1000000 });
        const right = pointX(block, { n: Math.round(segment.end * 1000000), d: 1000000 });
        if (left === null || right === null) continue;
        lane.appendChild(makeArch(segment.span, left, right, segment.start > segment.originalStart + 1e-8));
        if (segment.span.draft) {
          highlightDraft(block, segment.span, { n: Math.round(segment.start * 1000000), d: 1000000 }, { n: Math.round(segment.end * 1000000), d: 1000000 });
        }
      }
    }
  }
}
