// src/shell/rhythm-grid.js — small DOM adapter for the graph-paper score
// view. The notation model remains the source of truth; this layer only makes
// rendered matra cells addressable, selectable, and legible to assistive tech.

export function rhythmGridIdentity(cell) {
  if (!cell) return null;
  const group = cell.closest?.('[data-source-line]');
  const sourceLine = Number(group?.getAttribute('data-source-line'));
  const matraIndex = Number(cell.getAttribute?.('data-matra'));
  const cycleMatra = Number(cell.getAttribute?.('data-cycle-matra'));
  const subdivisions = Number(cell.getAttribute?.('data-grid-subdivisions')) || 1;
  if (!Number.isInteger(sourceLine) || !Number.isInteger(matraIndex)) return null;
  return {
    sourceLine,
    matraIndex,
    cycleMatra: Number.isInteger(cycleMatra) ? cycleMatra : null,
    subdivisions: Math.max(1, subdivisions),
  };
}

export function rhythmGridLabel(identity) {
  if (!identity) return '';
  const beat = identity.cycleMatra == null
    ? `written matra ${identity.matraIndex + 1}`
    : `tala matra ${identity.cycleMatra}`;
  const division = identity.subdivisions === 1
    ? 'one beat cell'
    : `${identity.subdivisions} subdivisions`;
  return `${beat}, ${division}, source line ${identity.sourceLine}`;
}

export function decorateRhythmGrid(root, selected = null) {
  if (!root) return null;
  let selectedCell = null;
  for (const cell of root.querySelectorAll('.sr-cell[data-matra]')) {
    const identity = rhythmGridIdentity(cell);
    if (!identity) continue;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', rhythmGridLabel(identity));
    const isSelected = selected &&
      identity.sourceLine === selected.sourceLine &&
      identity.matraIndex === selected.matraIndex;
    cell.classList.toggle('sr-grid-selected', Boolean(isSelected));
    cell.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    if (isSelected) selectedCell = cell;
  }
  return selectedCell;
}
