// src/shell/PreviewPane.jsx — mounts the engine's detached DOM in a ref.
// Long semantic lines are re-rendered as readable musical systems rather
// than globally shrunk. Meter spans are measured after render and placed in
// their own lower lane, including across folded systems.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderDocument } from '../engine/render.js';
import { mountMeterOverlays } from './meter-overlay.js';

function widthInEm(el) {
  if (!el || !el.clientWidth) return 56;
  const fontSize = Number.parseFloat(getComputedStyle(el).fontSize) || 16;
  return Math.max(18, Math.floor(el.clientWidth / fontSize) - 2);
}

export default function PreviewPane({
  doc,
  activeLine,
  activeCursor,
  noteNames,
  onSeek,
  meterSpans = [],
  meterDraft = null,
}) {
  const mount = useRef(null);
  const [maxSystemEm, setMaxSystemEm] = useState(56);
  useLayoutEffect(() => {
    if (!mount.current) return;
    const update = () => setMaxSystemEm((old) => {
      const next = widthInEm(mount.current);
      return Math.abs(next - old) >= 1 ? next : old;
    });
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(mount.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!mount.current) return;
    const el = renderDocument(doc, { activeLine, activeCursor, noteNames, maxSystemEm });
    mount.current.replaceChildren(el);
    mountMeterOverlays(mount.current, meterSpans, meterDraft);
  }, [doc, activeLine, activeCursor, noteNames, maxSystemEm, meterSpans, meterDraft]);

  const handleClick = (e) => {
    if (!onSeek) return;
    const cell = e.target.closest('.sr-cell');
    const blockEl = e.target.closest('[data-source-line]');
    if (!blockEl) return;
    const sourceLine = Number(blockEl.getAttribute('data-source-line'));
    const matraIndex = cell ? Number(cell.getAttribute('data-matra')) : 0;
    onSeek(sourceLine, Number.isFinite(matraIndex) ? matraIndex : 0);
  };

  return <div className="app-preview" ref={mount} onClick={handleClick} />;
}
