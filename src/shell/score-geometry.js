// src/shell/score-geometry.js — browser adapter for render-stamped notation
// geometry. All x coordinates are measured against the lane that will contain
// the glyph, never against a differently padded ancestor.

import { formatRational, rational, rationalNumber } from '../engine/meter.js';

function rectCenter(rect) {
  return rect.left + rect.width / 2;
}

export function xInContainer(container, node, edge = 'center') {
  if (!container || !node) return null;
  const cr = container.getBoundingClientRect();
  const nr = node.getBoundingClientRect();
  const x = edge === 'left' ? nr.left : edge === 'right' ? nr.right : rectCenter(nr);
  return x - cr.left;
}

export function attackCenterX(container, slot) {
  const note = slot?.querySelector?.('.sr-approach-destination, .sr-ch') || slot;
  return xInContainer(container, note, 'center');
}

export function endpointEdgeX(container, node, side) {
  if (!node) return null;
  if (node.getAttribute('data-anchor-kind') === 'boundary') {
    return xInContainer(container, node, 'center');
  }
  return xInContainer(container, node, side === 'start' ? 'left' : 'right');
}

function rationalLabel(value) {
  if (typeof value === 'string') return value;
  if (value && Number.isFinite(value.n) && Number.isFinite(value.d)) {
    return formatRational(rational(value.n, value.d));
  }
  const number = rationalNumber(value);
  if (!Number.isFinite(number)) return null;
  const scaled = Math.round(number * 1000000);
  return formatRational(rational(scaled, 1000000));
}

export function boundaryForTime(block, value) {
  const label = rationalLabel(value);
  if (label == null) return null;
  return [...block.querySelectorAll('[data-anchor-kind="boundary"]')]
    .find((node) => node.getAttribute('data-anchor-time') === label) || null;
}

/** Resolve an exact metric time to a rendered slot edge or boundary. */
export function xForMetricTime(container, block, value, preference = 'start') {
  const label = rationalLabel(value);
  if (label == null) return null;

  const boundary = boundaryForTime(block, label);
  if (boundary) return xInContainer(container, boundary, 'center');

  const startSlot = [...block.querySelectorAll('.sr-slot[data-geometry-start]')]
    .find((node) => node.getAttribute('data-geometry-start') === label);
  if (startSlot) return xInContainer(container, startSlot, 'left');

  const endSlot = [...block.querySelectorAll('.sr-slot[data-geometry-end]')]
    .find((node) => node.getAttribute('data-geometry-end') === label);
  if (endSlot) return xInContainer(container, endSlot, 'right');

  // Compatibility fallback for old rendered DOM. It is deliberately last;
  // new render output always exposes exact slot geometry.
  const time = rationalNumber(value);
  if (!Number.isFinite(time)) return null;
  const cell = [...block.querySelectorAll('.sr-cell[data-matra]')]
    .find((node) => Number(node.getAttribute('data-matra')) === Math.floor(time + 1e-8));
  if (!cell) {
    const last = [...block.querySelectorAll('.sr-cell[data-matra]')].at(-1);
    return last ? xInContainer(container, last, 'right') : null;
  }
  const fraction = Math.max(0, Math.min(1, time - Math.floor(time)));
  const edge = preference === 'end' && fraction >= 1 - 1e-8 ? 'right' : 'left';
  if (fraction <= 1e-8 || fraction >= 1 - 1e-8) return xInContainer(container, cell, edge);
  const cr = container.getBoundingClientRect();
  const nr = cell.getBoundingClientRect();
  return nr.left - cr.left + nr.width * fraction;
}
