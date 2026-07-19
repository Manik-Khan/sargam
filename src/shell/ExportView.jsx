// src/shell/ExportView.jsx — the export overlay (spec §4.1).
// Shows the print artifact on screen first (M asked to *see* the nice
// version), then hands it to the browser's print dialog: Save as PDF for
// the file, a printer for paper. No popup window (blockers, Safari), no
// dependency, no second typographic implementation — renderExport is the
// same engine output as the preview.
// @media print in sargam.css hides everything except .app-export-paper.
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { renderExport } from '../engine/render.js';
import { clearMeasuredLineLayout, setMeasuredLineLayout } from '../engine/layout.js';

const RIGHT_EDGE_BREATH_EM = 0.75;
const FALLBACK_SYSTEM_EM = 40;

function allMusicLines(doc) {
  return (doc?.sections || []).flatMap((section) => section.lines || []);
}

function contentWidthInEm(el) {
  if (!el || !el.clientWidth) return FALLBACK_SYSTEM_EM;

  const style = getComputedStyle(el);
  const fontSize = Number.parseFloat(style.fontSize) || 16;
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0);
  const contentWidth = Math.max(0, el.clientWidth - padding);

  return Math.max(18, contentWidth / fontSize - RIGHT_EDGE_BREATH_EM);
}

function measureLine(line, group) {
  const row = group?.querySelector('.sr-row');
  const cells = [...(group?.querySelectorAll('.sr-cell') || [])];
  if (!row || cells.length !== (line?.matras?.length || 0) || cells.length === 0) return null;

  const rowRect = row.getBoundingClientRect();
  const rects = cells.map((cell) => cell.getBoundingClientRect());
  const fontSize = Number.parseFloat(getComputedStyle(row).fontSize) || 16;

  if (rowRect.width <= 0 || rects.some((rect) => rect.width <= 0)) return null;

  const widths = rects.map((rect, index) => {
    if (index === rects.length - 1) return rect.width / fontSize;
    return (rects[index + 1].left - rect.left) / fontSize;
  });

  return {
    widths,
    prefixEm: Math.max(0, (rects[0].left - rowRect.left) / fontSize),
    suffixEm: Math.max(0, (rowRect.right - rects.at(-1).right) / fontSize),
  };
}

function installBrowserMeasurements(doc, mountEl) {
  const lines = allMusicLines(doc);
  const groups = [...mountEl.querySelectorAll('.sr-line-group')];

  lines.forEach((line, index) => {
    const measurement = measureLine(line, groups[index]);
    if (measurement) setMeasuredLineLayout(line, measurement);
  });

  return () => lines.forEach(clearMeasuredLineLayout);
}

export default function ExportView({ doc, noteNames, onClose }) {
  const mount = useRef(null);

  useLayoutEffect(() => {
    const mountEl = mount.current;
    if (!mountEl) return undefined;

    let frame = 0;
    let observedWidth = -1;
    let disposed = false;

    const renderSized = () => {
      if (disposed) return;
      // First render one unbroken source line so the browser can tell us the
      // exact widths of its cells, bars, repeats, cues, lyrics, and ornaments.
      mountEl.replaceChildren(renderExport(doc, { noteNames, maxSystemEm: Infinity }));
      const clearMeasurements = installBrowserMeasurements(doc, mountEl);

      try {
        // This reads the real content width in both the on-screen paper and
        // print media. The print CSS itself remains untouched.
        const maxSystemEm = contentWidthInEm(mountEl);
        mountEl.replaceChildren(renderExport(doc, { noteNames, maxSystemEm }));
      } finally {
        // Measurements are only a one-render layout aid. They never become
        // document data and cannot affect editing, playback, or later saves.
        clearMeasurements();
      }
    };

    const scheduleRender = () => {
      if (disposed) return;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        renderSized();
      });
    };

    renderSized();

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect?.width ?? mountEl.clientWidth;
        if (Math.abs(width - observedWidth) < 0.5) return;
        observedWidth = width;
        scheduleRender();
      });
      observer.observe(mountEl);
    }

    // Browsers apply @media print before producing the print preview. Measure
    // again at that moment so portrait/landscape and the user's paper choice
    // use the actual printable width rather than the old fixed 40em guess.
    const beforePrint = () => renderSized();
    const afterPrint = () => renderSized();
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);

    const printMedia = window.matchMedia?.('print');
    const mediaChange = (event) => {
      if (event.matches) renderSized();
      else scheduleRender();
    };
    printMedia?.addEventListener?.('change', mediaChange);

    const fontsReady = document.fonts?.ready;
    fontsReady?.then(scheduleRender).catch(() => {});

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
      printMedia?.removeEventListener?.('change', mediaChange);
      allMusicLines(doc).forEach(clearMeasuredLineLayout);
    };
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
