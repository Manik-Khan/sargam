// src/shell/ExportView.jsx — the export overlay (spec §4.1).
// Shows the print artifact on screen first (M asked to *see* the nice
// version), then hands it to the browser's print dialog: Save as PDF for
// the file, a printer for paper. No popup window (blockers, Safari), no
// dependency, no second typographic implementation — renderExport is the
// same engine output as the preview.
// @media print in sargam.css hides everything except .app-export-paper.
import React, { useEffect, useRef } from 'react';
import { renderExport } from '../engine/render.js';

export default function ExportView({ doc, noteNames, onClose }) {
  const mount = useRef(null);

  useEffect(() => {
    if (mount.current) mount.current.replaceChildren(renderExport(doc, { noteNames }));
  }, [doc, noteNames]);

  useEffect(() => {
    const esc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="app-export">
      <div className="app-export-bar">
        <span className="app-export-title">Export</span>
        <button className="tb-btn" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <button className="tb-btn app-export-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="app-export-scroll">
        <div className="app-export-paper" ref={mount} />
      </div>
    </div>
  );
}
