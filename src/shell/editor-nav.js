// src/shell/editor-nav.js — pure source-line addressing for preview → editor
// navigation. Source lines are 1-based everywhere else in the notation
// engine, so the helper keeps that convention and safely clamps bad input.

/**
 * @returns {{start:number, end:number, line:number}}
 * end excludes the newline, making the native textarea selection highlight
 * exactly the requested source line without swallowing the following line.
 */
export function sourceLineRange(text, requestedLine) {
  const value = String(text ?? '');
  const lines = value.split('\n');
  const numeric = Number.isFinite(Number(requestedLine)) ? Math.trunc(Number(requestedLine)) : 1;
  const line = Math.min(Math.max(1, numeric), Math.max(1, lines.length));

  let start = 0;
  for (let i = 1; i < line; i++) start += lines[i - 1].length + 1;
  return { start, end: start + lines[line - 1].length, line };
}

/** A centered scroll target for a fixed-line-height textarea. */
export function centeredLineScrollTop({ line, lineHeight, paddingTop = 0, clientHeight = 0 }) {
  const safeLine = Math.max(1, Number(line) || 1);
  const safeHeight = Math.max(1, Number(lineHeight) || 1);
  const targetY = Number(paddingTop || 0) + (safeLine - 1) * safeHeight;
  return Math.max(0, targetY - Math.max(0, Number(clientHeight || 0) - safeHeight) / 2);
}

/** Center an already-rendered target inside its own scrolling editor pane. */
export function centeredElementScrollTop({
  scrollTop = 0,
  containerTop = 0,
  containerHeight = 0,
  elementTop = 0,
  elementHeight = 0,
}) {
  const current = Number(scrollTop) || 0;
  const offset = (Number(elementTop) || 0) - (Number(containerTop) || 0);
  const viewport = Math.max(0, Number(containerHeight) || 0);
  const target = Math.max(0, Number(elementHeight) || 0);
  return Math.max(0, current + offset - Math.max(0, viewport - target) / 2);
}
