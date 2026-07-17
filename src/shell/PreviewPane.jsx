// src/shell/PreviewPane.jsx — mounts the engine's detached DOM in a ref
// and swaps it per parse (plan Wave 3). React never reaches inside;
// render.js owns everything below the mount point.

import React, { useEffect, useRef } from 'react';
import { renderDocument } from '../engine/render.js';

export default function PreviewPane({ doc, activeLine, activeCursor, onSeek }) {
  const mount = useRef(null);

  useEffect(() => {
    if (!mount.current) return;
    const el = renderDocument(doc, { activeLine, activeCursor });
    mount.current.replaceChildren(el);
  }, [doc, activeLine, activeCursor]);

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
