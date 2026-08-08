// src/shell/ExportView.jsx — the export overlay (spec §4.1).
// Shows the print artifact on screen first (M asked to *see* the nice
// version), then hands it to the browser's print dialog: Save as PDF for
// the file, a printer for paper. No popup window (blockers, Safari), no
// dependency, no second typographic implementation — renderExport is the
// same engine output as the preview.
// @media print in sargam.css hides everything except .app-export-paper.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { renderExport } from '../engine/render.js';
import { alignTalaMarkers, stampAnchorTargets, mountAnchorOverlays } from './anchor-overlay.js';
import { clearMeasuredLineLayout, setMeasuredLineLayout } from '../engine/layout.js';

const RIGHT_EDGE_BREATH_EM = 0.3;
const SCORE_GUTTER_EM = 2;
const FALLBACK_SYSTEM_EM = 40;

const EXPORT_PAPER_COLORS = [
  { value: '#ffffff', label: 'White' },
  { value: '#fffaf0', label: 'Ivory' },
  { value: '#f5edda', label: 'Warm sand' },
  { value: '#eef3e8', label: 'Soft sage' },
];

const EXPORT_FONTS = [
  { value: 'Charter, Georgia, "Times New Roman", serif', label: 'Traditional serif' },
  { value: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', label: 'Classic book' },
  { value: 'Avenir, "Helvetica Neue", Arial, sans-serif', label: 'Clean sans' },
];

const EXPORT_GRIDS = [
  { value: 'clean', label: 'Clean' },
  { value: 'matra', label: 'Matra cells' },
];

const EXPORT_INKS = [
  { value: 'color', label: 'Color' },
  { value: 'mono', label: 'Printer B&W' },
];

function allMusicLines(doc) {
  return (doc?.sections || []).flatMap((section) => section.lines || []);
}

function contentWidthInEm(el) {
  if (!el || !el.clientWidth) return FALLBACK_SYSTEM_EM;

  const style = getComputedStyle(el);
  const score = el.querySelector('.sr-export') || el;
  const scoreStyle = getComputedStyle(score);
  // Browser measurements below are expressed in the notation row's em
  // units. Use the score's font size here as well so systems do not wrap
  // before they reach the printable right edge.
  const fontSize = Number.parseFloat(scoreStyle.fontSize) || 15;
  const padding =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0);
  const contentWidth = Math.max(0, el.clientWidth - padding);

  return Math.max(18, contentWidth / fontSize - RIGHT_EDGE_BREATH_EM - SCORE_GUTTER_EM);
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

export default function ExportView({ doc, noteNames, onClose, sourceText, anchorMarks = [] }) {
  const mount = useRef(null);
  const [paperColor, setPaperColor] = useState(EXPORT_PAPER_COLORS[0].value);
  const [fontFamily, setFontFamily] = useState(EXPORT_FONTS[0].value);
  const [gridStyle, setGridStyle] = useState(EXPORT_GRIDS[0].value);
  const [inkStyle, setInkStyle] = useState(EXPORT_INKS[0].value);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue('--sr-export-paper');
    root.style.setProperty('--sr-export-paper', paperColor);
    return () => {
      if (previous) root.style.setProperty('--sr-export-paper', previous);
      else root.style.removeProperty('--sr-export-paper');
    };
  }, [paperColor]);

  useLayoutEffect(() => {
    const mountEl = mount.current;
    if (!mountEl) return undefined;

    let frame = 0;
    let observedWidth = -1;
    let disposed = false;
    let printActive = window.matchMedia?.('print')?.matches || false;

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
      // SARGAM_EXPORT_MARKER_ALIGNMENT — align tala numerals to the
      // struck attack (or a true boundary tick) after final print packing.
      alignTalaMarkers(mountEl);
      // SARGAM_EXPORT_ANCHOR_PARITY_2026_07_20 — generated articulations and meter spans are
      // essential notation. Mount them only after the final packed render.
      stampAnchorTargets(mountEl, sourceText);
      mountAnchorOverlays(mountEl, anchorMarks, { readOnly: true });
      } finally {
        // Measurements are only a one-render layout aid. They never become
        // document data and cannot affect editing, playback, or later saves.
        clearMeasurements();
      }
    };

    const scheduleRender = () => {
      if (disposed || printActive) return;
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
        // The export preview is deliberately the same width as a Letter page.
        // Print media briefly reports a different box while Chrome builds its
        // preview. Re-rendering in that transition can replace the DOM after
        // pagination has begun, leaving only the first page in the PDF.
        if (printActive) return;
        const width = entries[0]?.contentRect?.width ?? mountEl.clientWidth;
        if (Math.abs(width - observedWidth) < 0.5) return;
        observedWidth = width;
        scheduleRender();
      });
      observer.observe(mountEl);
    }

    // Freeze the already approved preview DOM for the entire print lifecycle.
    // Mutating it from beforeprint, matchMedia, or ResizeObserver races Chrome's
    // pagination and also changes the preview after the dialog closes.
    const beforePrint = () => {
      printActive = true;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };
    const afterPrint = () => {
      printActive = false;
      observedWidth = mountEl.clientWidth;
    };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);

    const printMedia = window.matchMedia?.('print');
    const mediaChange = (event) => {
      if (event.matches) beforePrint();
      else afterPrint();
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
  }, [doc, noteNames, sourceText, anchorMarks, fontFamily, gridStyle]);

  useEffect(() => {
    const esc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div
      className={`app-export${gridStyle === 'matra' ? ' app-export-grid' : ''}${inkStyle === 'mono' ? ' app-export-monochrome' : ''}`}
      style={{ '--sr-export-paper': paperColor, '--sr-export-font': fontFamily }}
    >
      <div className="app-export-bar">
        <span className="app-export-title">Export</span>
        <button className="tb-btn" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <div className="app-export-style-controls" aria-label="PDF appearance">
          <label>
            <span>Page</span>
            <select
              aria-label="PDF page color"
              value={paperColor}
              onChange={(event) => setPaperColor(event.target.value)}
            >
              {EXPORT_PAPER_COLORS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Typeface</span>
            <select
              aria-label="PDF typeface"
              value={fontFamily}
              onChange={(event) => setFontFamily(event.target.value)}
            >
              {EXPORT_FONTS.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Grid</span>
            <select
              aria-label="PDF notation grid"
              value={gridStyle}
              onChange={(event) => setGridStyle(event.target.value)}
            >
              {EXPORT_GRIDS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Ink</span>
            <select
              aria-label="PDF ink style"
              value={inkStyle}
              onChange={(event) => setInkStyle(event.target.value)}
            >
              {EXPORT_INKS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
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
