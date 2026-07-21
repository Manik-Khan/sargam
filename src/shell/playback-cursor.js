// src/shell/playback-cursor.js — update playback highlighting without
// replacing the rendered score. Rebuilding the full DOM once per beat made
// browser scroll anchoring walk the page downward and remounted every anchor.

function esc(value) {
  const text = String(value);
  return globalThis.CSS?.escape ? globalThis.CSS.escape(text) : text.replace(/["\\]/g, '\\$&');
}

export function applyPlaybackCursor(root, cursor) {
  if (!root) return null;
  root.querySelectorAll('.sr-cell.sr-active').forEach((node) => node.classList.remove('sr-active'));
  if (!cursor) return null;

  const sourceLine = Number(cursor.sourceLine);
  const matraIndex = Number(cursor.matraIndex);
  let group = null;
  if (Number.isFinite(sourceLine)) {
    group = root.querySelector(`.sr-line-group[data-source-line="${esc(sourceLine)}"]`);
  }
  if (!group) {
    const sectionIndex = Number(cursor.sectionIndex);
    const lineIndex = Number(cursor.lineIndex);
    if (Number.isFinite(sectionIndex) && Number.isFinite(lineIndex)) {
      group = root.querySelector(
        `.sr-line-group[data-section-index="${esc(sectionIndex)}"][data-line-index="${esc(lineIndex)}"]`
      );
    }
  }
  if (!group || !Number.isFinite(matraIndex)) return null;

  const cell = group.querySelector(`.sr-cell[data-matra="${esc(matraIndex)}"]`);
  cell?.classList.add('sr-active');
  return cell || null;
}
