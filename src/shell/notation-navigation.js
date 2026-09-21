// Text and rendered notation share parsed musical positions. Scanner offsets
// identify characters only; the parsed geometry owns all timing (including _
// holds, pickups, and Jhampak's implicit final half-beat).
import { scanMusicLine } from '../engine/meter.js';
import { buildLineGeometry } from '../engine/notation-geometry.js';
import { sourceLineRange } from './editor-nav.js';

const value = fraction => fraction.num / fraction.den;
const lineAt = (doc, sourceLine) => doc.sections.flatMap(section => section.lines || [])
  .find(line => line.sourceLine === sourceLine);

function sourceAttacks(text, line) {
  const range = sourceLineRange(text, line.sourceLine);
  const raw = text.slice(range.start, range.end);
  // A vibhag hold creates no attack. Keep its character width while allowing
  // the source scanner to continue; its estimated times are not consumed.
  const scanned = scanMusicLine(raw.replace(/_/g, '-'));
  if (scanned.error) return [];
  const written = scanned.attacks.filter(attack => !attack.grace);
  const attacks = buildLineGeometry(line).attacks;
  if (written.length !== attacks.length || written.some((attack, i) => attack.ch !== attacks[i].note)) return [];
  return written.map((attack, i) => {
    let start = attack.index;
    while (start > 0 && /[.']/.test(raw[start - 1])) start--;
    return { ...attacks[i], from: range.start + start, to: range.start + attack.index + 1 };
  });
}

export function positionFromSource(text, doc, position) {
  if (!Number.isInteger(position) || position < 0 || position >= text.length) return null;
  // Headings, lyrics, bol lanes, and generated structure never seek.
  const sourceLine = text.slice(0, position).split('\n').length;
  const line = lineAt(doc, sourceLine);
  if (!line || !/[SrRgGmMPdDnN.']/.test(text[position])) return null;
  const attacks = sourceAttacks(text, line);
  const attack = attacks.find(item => position >= item.from && position < item.to)
    // Untimed approach/kan notes belong to their following destination.
    || (/^[.']*[SrRgGmMPdDnN]/.test(text.slice(position))
      ? attacks.find(item => item.from > position) : null);
  if (!attack) return null;
  return { sourceLine, matraIndex: attack.matraIndex, metricTime: value(attack.time) };
}

export function sourceRangeForPosition(text, doc, sourceLine, matraIndex, metricTime = null) {
  const line = lineAt(doc, sourceLine);
  if (!line) return null;
  const attacks = sourceAttacks(text, line).filter(attack => attack.matraIndex === matraIndex);
  const attack = metricTime == null ? attacks[0]
    : attacks.find(item => Math.abs(value(item.time) - metricTime) < 1e-8);
  return attack ? { start: attack.from, end: attack.to, line: sourceLine } : null;
}

export function metricOffsetForPosition(doc, sourceLine, matraIndex, metricTime = null) {
  if (metricTime == null || !Number.isFinite(metricTime)) return 0;
  const line = lineAt(doc, sourceLine);
  const cell = line && buildLineGeometry(line).matras[matraIndex];
  if (!cell) return 0;
  return Math.max(0, Math.min(value(cell.end) - value(cell.start), metricTime - value(cell.start)));
}

export function positionFromScore(target) {
  const cell = target?.closest?.('.sr-cell[data-matra]');
  const block = cell?.closest('[data-source-line]');
  if (!block) return null;
  const sourceLine = Number(block.getAttribute('data-source-line'));
  const matraIndex = Number(cell.getAttribute('data-matra'));
  const slot = target.closest('[data-geometry-start]');
  const metric = slot?.getAttribute('data-geometry-start');
  const parts = metric?.split('/').map(Number);
  const metricTime = parts ? parts[0] / (parts[1] || 1) : null;
  if (!Number.isInteger(sourceLine) || !Number.isInteger(matraIndex)) return null;
  return { sourceLine, matraIndex, metricTime };
}

/** Only a plain pointer click seeks. Editing, dragging a selection, modifier
 * clicks, and programmatic source reveals leave playback untouched. */
export function editorClickPosition(event, view) {
  if (event.button !== 0 || event.detail > 1 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey ||
      !view.state.selection.main.empty || !event.target.closest?.('.cm-content')) return null;
  let pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return null;
  const caret = view.coordsAtPos(pos);
  if (caret && caret.left > event.clientX) pos--;
  return pos >= 0 ? pos : null;
}
