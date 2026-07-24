// src/shell/preview-scroll.js — keep the source line being edited at the same
// visual position when PreviewPane replaces its rendered notation tree.

export function previewLineElement(root, sourceLine) {
  const line = Number(sourceLine);
  if (!root || !Number.isInteger(line) || line < 1) return null;
  return root.querySelector(`.sr-line-group[data-source-line="${line}"]`)
    || root.querySelector(`[data-source-line="${line}"]`);
}

export function previewSourceLine(doc, activeLine, bolCapture = null) {
  const captureLine = Number(bolCapture?.sourceLine);
  if (Number.isInteger(captureLine) && captureLine > 0) return captureLine;
  const requested = Number(activeLine);
  if (!Number.isInteger(requested) || requested < 1) return null;
  const lines = (doc?.sections || [])
    .flatMap((section) => section.lines || [])
    .map((line) => Number(line.sourceLine))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  if (lines.includes(requested)) return requested;
  // Attachment lanes (`>>`, `>1`, `>2`, lyrics) belong to the nearest music
  // line above them. Keeping that relationship here prevents the preview from
  // following the next notation row while a companion lane is being edited.
  return lines.filter((line) => line < requested).at(-1) ?? lines[0] ?? null;
}

function rectDistance(rect, rail) {
  if (!rect) return Number.POSITIVE_INFINITY;
  if (rect.top <= rail && rect.bottom >= rail) return 0;
  return Math.min(Math.abs(rect.top - rail), Math.abs(rect.bottom - rail));
}

export function previewAnchorElement(root, sourceLine, bolCapture = null) {
  if (!root) return null;
  const captureOrdinal = Number(bolCapture?.ordinal);
  if (
    Number(bolCapture?.sourceLine) === Number(sourceLine) &&
    Number.isInteger(captureOrdinal)
  ) {
    const attack = root.querySelector(
      `[data-anchor-kind="attack"][data-anchor-line="${sourceLine}"][data-anchor-ordinal="${captureOrdinal}"]`
    );
    if (attack) return attack;
  }
  const group = previewLineElement(root, sourceLine);
  if (!group) return null;
  const blocks = [...group.querySelectorAll('.sr-line-block')];
  if (!blocks.length) return group;
  const rootRect = root.getBoundingClientRect?.();
  const rail = Number(rootRect?.top || 0) + Math.min(96, Math.max(24, Number(root.clientHeight || 0) * 0.28));
  return blocks.reduce((best, block) => {
    return rectDistance(block.getBoundingClientRect?.(), rail) <
      rectDistance(best.getBoundingClientRect?.(), rail)
      ? block
      : best;
  }, blocks[0]);
}

export function previewAnchorIdentity(element) {
  if (!element) return null;
  const ordinal = Number(element.getAttribute?.('data-anchor-ordinal'));
  const sourceLine = Number(
    element.getAttribute?.('data-anchor-line') ||
    element.closest?.('[data-source-line]')?.getAttribute('data-source-line')
  );
  if (Number.isInteger(ordinal) && Number.isInteger(sourceLine)) {
    return { kind: 'attack', sourceLine, ordinal };
  }
  const block = element.classList?.contains('sr-line-block')
    ? element
    : element.closest?.('.sr-line-block');
  if (block && Number.isInteger(sourceLine)) {
    return {
      kind: 'system',
      sourceLine,
      from: Number(block.getAttribute('data-system-from') || 0),
    };
  }
  return Number.isInteger(sourceLine) ? { kind: 'line', sourceLine } : null;
}

export function restorePreviewAnchor(root, identity) {
  if (!root || !identity) return null;
  if (identity.kind === 'attack') {
    return root.querySelector(
      `[data-anchor-kind="attack"][data-anchor-line="${identity.sourceLine}"][data-anchor-ordinal="${identity.ordinal}"]`
    );
  }
  const group = previewLineElement(root, identity.sourceLine);
  if (!group || identity.kind === 'line') return group;
  const target = Number(identity.from) || 0;
  return [...group.querySelectorAll('.sr-line-block')].find((block) => {
    const from = Number(block.getAttribute('data-system-from') || 0);
    const to = Number(block.getAttribute('data-system-to') || from);
    return from <= target && target <= to;
  }) || group;
}

export function lineAnchoredScrollTop({
  scrollTop = 0,
  beforeTop,
  afterTop,
  scrollHeight = Number.POSITIVE_INFINITY,
  clientHeight = 0,
} = {}) {
  const current = Math.max(0, Number(scrollTop) || 0);
  const before = Number(beforeTop);
  const after = Number(afterTop);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return current;
  const next = current + after - before;
  const height = Number(scrollHeight);
  const viewport = Math.max(0, Number(clientHeight) || 0);
  const max = Number.isFinite(height)
    ? Math.max(0, height - viewport)
    : Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(0, next));
}
