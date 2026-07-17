// src/shell/PreviewPane.jsx — mounts the engine's detached DOM in a ref
// and swaps it per parse (plan Wave 3). React never reaches inside;
// render.js owns everything below the mount point.

import React, { useEffect, useRef } from 'react';
import { renderDocument } from '../engine/render.js';

// Shrink each notation line to fit the pane: notation is a fixed-metric
// grid (arcs span cells by column, so cells can't reflow to a second row
// without a real system-breaking engine — backlogged). Scale is applied
// via `zoom`, which reflows layout so heights stay correct; below the
// floor the line scrolls horizontally instead of vanishing (the CSS
// overflow rule is the no-JS safety net).
const MIN_FIT = 0.55;
function fitLines(root) {
  if (!root) return;
  const paneWidth = root.clientWidth;
  if (!paneWidth) return; // jsdom / not laid out yet
  for (const block of root.querySelectorAll('.sr-line-block')) {
    block.style.zoom = '';
    const need = block.scrollWidth;
    if (need > paneWidth) {
      block.style.zoom = String(Math.max(MIN_FIT, paneWidth / need));
    }
  }
}

export default function PreviewPane({ doc, activeLine, activeCursor, noteNames, onSeek }) {
  const mount = useRef(null);

  useEffect(() => {
    if (!mount.current) return;
    const el = renderDocument(doc, { activeLine, activeCursor, noteNames });
    mount.current.replaceChildren(el);
    fitLines(mount.current);
  }, [doc, activeLine, activeCursor, noteNames]);

  // Refit when the window/pane resizes (M, 2026-07-16: half-width browser
  // cut lines off invisibly).
  useEffect(() => {
    if (!mount.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fitLines(mount.current));
    ro.observe(mount.current);
    return () => ro.disconnect();
  }, []);

  // Click a matra in the notation to put the playhead there (M,
  // 2026-07-16). Delegated, so the per-keystroke re-render stays cheap.
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
