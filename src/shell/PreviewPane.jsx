// src/shell/PreviewPane.jsx — rendered notation plus the shared musical anchor
// surface. Pointer gestures place point articulations or span annotations on
// attacks/boundaries; the iframe/audio and notation renderer remain separate.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderDocument } from '../engine/render.js';
import { mountMeterOverlays } from './meter-overlay.js';
import { applyPlaybackCursor } from './playback-cursor.js';
import { mountAudioLinkOverlays } from './audio-link-overlay.js';
import {
  lineAnchoredScrollTop,
  previewAnchorElement,
  previewAnchorIdentity,
  previewSourceLine,
  restorePreviewAnchor,
} from './preview-scroll.js';
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
  bolCapture = null,
  selectedMarkId = null,
  onAnchorGesture,
  onSelectMark,
  onMoveMark,
  audioLinks = [],
  selectedAudioLinkId = null,
  onActivateAudioLink,
  rhythmGrid = false,
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

  useLayoutEffect(() => {
    if (!mount.current) return undefined;
    const scroller = mount.current;
    const sourceLine = previewSourceLine(doc, activeLine, bolCapture);
    const beforeAnchor = previewAnchorElement(scroller, sourceLine, bolCapture);
    const anchorIdentity = previewAnchorIdentity(beforeAnchor);
    const scrollerRect = scroller.getBoundingClientRect();
    const beforeRect = beforeAnchor?.getBoundingClientRect();
    const rail = scrollerRect.top + Math.min(96, Math.max(24, scroller.clientHeight * 0.28));
    const beforeVisible = beforeRect &&
      beforeRect.bottom >= scrollerRect.top &&
      beforeRect.top <= scrollerRect.bottom;
    const beforeTop = beforeVisible ? beforeRect.top : rail;
    const beforeScrollTop = scroller.scrollTop;
    const el = renderDocument(doc, { activeLine, noteNames, maxSystemEm });
    scroller.replaceChildren(el);
    stampAnchorTargets(scroller, sourceText);
    // Keep legacy >> spans visible while new work is stored in anchor metadata.
    mountMeterOverlays(scroller, meterSpans, meterDraft, { rhythmGrid });
    const cleanupAnchors = mountAnchorOverlays(scroller, anchorMarks, {
      selectedMarkId,
      bolCapture,
      onSelectMark,
      onHandleStart(event, markId, side) {
        handleDrag.current = { markId, side };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
    });
    const cleanupAudio = mountAudioLinkOverlays(scroller, audioLinks, {
      selectedLinkId: selectedAudioLinkId,
      onActivate: onActivateAudioLink,
    });
    applyPlaybackCursor(scroller, activeCursorRef.current);
    const afterAnchor = restorePreviewAnchor(scroller, anchorIdentity)
      || previewAnchorElement(scroller, sourceLine, bolCapture);
    scroller.scrollTop = lineAnchoredScrollTop({
      scrollTop: beforeScrollTop,
      beforeTop,
      afterTop: afterAnchor?.getBoundingClientRect().top,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    });
    return () => { cleanupAudio?.(); cleanupAnchors?.(); };
  }, [doc, sourceText, activeLine, noteNames, maxSystemEm, meterSpans, meterDraft, anchorMarks, bolCapture, selectedMarkId, onSelectMark, audioLinks, selectedAudioLinkId, onActivateAudioLink, rhythmGrid]);

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
    const marked = event.target.closest('[data-mark-id],[data-audio-link-id]');
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
      className={`app-preview${anchorTool ? ' app-preview-anchoring' : ''}${rhythmGrid ? ' app-rhythm-grid' : ''}`}
      ref={mount}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    />
  );
}
