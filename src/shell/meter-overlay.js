// src/shell/meter-overlay.js — DOM-only display adapter for meter spans.
// The engine data stays exact fractions; this file measures the already
// rendered notation so a lower arch can follow folded systems and micro-slots.

import { rationalNumber } from '../engine/meter.js';
import { xForMetricTime } from './score-geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function emFromPx(container, px) {
  const fontSize = Number.parseFloat(getComputedStyle(container).fontSize) || 16;
  return Number(px) / fontSize;
}

function makeArch(span, lane, left, right, continuation = false) {
  const el = document.createElement('div');
  el.className = 'sr-meter-span' + (span.valid === false ? ' sr-meter-invalid' : '') + (span.draft ? ' sr-meter-draft' : '');
  el.style.left = `${emFromPx(lane, Math.min(left, right))}em`;
  el.style.width = `${emFromPx(lane, Math.max(12, Math.abs(right - left)))}em`;
  el.title = span.message || `${span.label} local meter`;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 18');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('sr-meter-svg');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M2,2 L2,16 L98,16 L98,2');
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
  root.querySelectorAll('.sr-meter-lane').forEach((node) => node.replaceChildren());
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
      let lane = block.querySelector(':scope > .sr-annotation-stack > .sr-meter-lane')
        || block.querySelector(':scope > .sr-meter-lane');
      if (!lane) {
        lane = document.createElement('div');
        lane.className = 'sr-meter-lane';
        block.appendChild(lane);
      }
      for (const segment of segments) {
        const startValue = { n: Math.round(segment.start * 1000000), d: 1000000 };
        const endValue = { n: Math.round(segment.end * 1000000), d: 1000000 };
        const left = xForMetricTime(lane, block, startValue, 'start');
        const right = xForMetricTime(lane, block, endValue, 'end');
        if (left === null || right === null) continue;
        lane.appendChild(makeArch(segment.span, lane, left, right, segment.start > segment.originalStart + 1e-8));
        if (segment.span.draft) {
          highlightDraft(block, segment.span, startValue, endValue);
        }
      }
    }
  }
}
