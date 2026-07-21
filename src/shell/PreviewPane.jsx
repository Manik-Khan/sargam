// src/shell/PreviewPane.jsx — rendered notation plus the shared musical anchor
// surface. Pointer gestures place point articulations or span annotations on
// attacks/boundaries; the iframe/audio and notation renderer remain separate.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderDocument } from '../engine/render.js';
import { mountMeterOverlays } from './meter-overlay.js';
import { applyPlaybackCursor } from './playback-cursor.js';
import {
  closestAnchorTarget,
  mountAnchorOverlays,
  stampAnchorTargets,
} from './anchor-overlay.js';

function widthInEm(el) {
  if (!el || !el.clientWidth) return 56;
  const fontSize = Number.parseFloat(getComputedStyle(el).fontSize) || 16;
  // SARGAM_REPEAT_GUTTER_WIDTH_2026_07_20 — the semantic planner receives
  // only the shared inner notation width; repeat punctuation lives outside it.
  return Math.max(18, Math.floor(el.clientWidth / fontSize) - 6);
}

export default function PreviewPane({
  doc,
  sourceText,
  activeLine,
  activeCursor,
  noteNames,
  onSeek,
  meterSpans = [],
  meterDraft = null,
  anchorMarks = [],
  anchorTool = null,
  selectedMarkId = null,
  onAnchorGesture,
  onSelectMark,
  onMoveMark,
}) {
  const mount = useRef(null);
  const gesture = useRef(null);
  const handleDrag = useRef(null);
  const activeCursorRef = useRef(activeCursor);
  activeCursorRef.current = activeCursor;
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
    if (!mount.current) return undefined;
    const el = renderDocument(doc, { activeLine, noteNames, maxSystemEm });
    mount.current.replaceChildren(el);
    stampAnchorTargets(mount.current, sourceText);
    // Keep legacy >> spans visible while new work is stored in anchor metadata.
    mountMeterOverlays(mount.current, meterSpans, meterDraft);
    const cleanup = mountAnchorOverlays(mount.current, anchorMarks, {
      selectedMarkId,
      onSelectMark,
      onHandleStart(event, markId, side) {
        handleDrag.current = { markId, side };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
    });
    applyPlaybackCursor(mount.current, activeCursorRef.current);
    return cleanup;
  }, [doc, sourceText, activeLine, noteNames, maxSystemEm, meterSpans, meterDraft, anchorMarks, selectedMarkId, onSelectMark]);

  useEffect(() => {
    applyPlaybackCursor(mount.current, activeCursor);
  }, [activeCursor]);

  useEffect(() => {
    const onPointerUp = (event) => {
      if (!handleDrag.current || !mount.current) return;
      const found = closestAnchorTarget(document.elementFromPoint(event.clientX, event.clientY));
      const drag = handleDrag.current;
      handleDrag.current = null;
      if (found) onMoveMark?.(drag.markId, drag.side, found.payload);
    };
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
  }, [onMoveMark]);

  const handlePointerDown = (event) => {
    if (!anchorTool || handleDrag.current) return;
    const found = closestAnchorTarget(event.target);
    if (!found) return;
    event.preventDefault();
    gesture.current = found.payload;
    found.node.classList.add('sr-anchor-gesture-start');
  };

  const handlePointerUp = (event) => {
    if (!anchorTool || !gesture.current || handleDrag.current) return;
    const start = gesture.current;
    gesture.current = null;
    mount.current?.querySelectorAll('.sr-anchor-gesture-start').forEach((node) => node.classList.remove('sr-anchor-gesture-start'));
    const found = closestAnchorTarget(event.target);
    const end = found?.payload || start;
    onAnchorGesture?.({ start, end });
  };

  const handleClick = (event) => {
    if (anchorTool) return;
    const marked = event.target.closest('[data-mark-id]');
    if (marked) return;
    if (!onSeek) return;
    const cell = event.target.closest('.sr-cell');
    const blockEl = event.target.closest('[data-source-line]');
    if (!blockEl) return;
    const sourceLine = Number(blockEl.getAttribute('data-source-line'));
    const matraIndex = cell ? Number(cell.getAttribute('data-matra')) : 0;
    onSeek(sourceLine, Number.isFinite(matraIndex) ? matraIndex : 0);
  };

  return (
    <div
      className={`app-preview${anchorTool ? ' app-preview-anchoring' : ''}`}
      ref={mount}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    />
  );
}
