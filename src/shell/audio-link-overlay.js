// src/shell/audio-link-overlay.js — preview-only notation affordance for
// persistent Vilambit A–B links. It consumes the exact attack/slot geometry
// already stamped by render.js; it never guesses from source text or prints.

function esc(value) {
  const text = String(value);
  return globalThis.CSS?.escape ? globalThis.CSS.escape(text) : text.replace(/["\\]/g, '\\$&');
}

function numberOfFraction(value) {
  const match = String(value ?? '').match(/^(-?\d+)(?:\/(\d+))?$/);
  if (!match) return NaN;
  return Number(match[1]) / Number(match[2] || 1);
}

function findAttack(root, endpoint) {
  if (!endpoint) return null;
  const selector = [
    '[data-anchor-kind="attack"]',
    `[data-anchor-line="${esc(endpoint.sourceLine)}"]`,
    `[data-anchor-time="${esc(endpoint.time)}"]`,
    endpoint.ordinal != null ? `[data-anchor-ordinal="${esc(endpoint.ordinal)}"]` : '',
  ].join('');
  return root.querySelector(selector);
}

export function mountAudioLinkOverlays(root, links = [], options = {}) {
  if (!root) return () => {};
  root.querySelectorAll('.sr-audio-linked').forEach((node) => {
    node.classList.remove('sr-audio-linked', 'selected');
    delete node.dataset.audioLinkId;
    node.removeAttribute('title');
  });
  root.querySelectorAll('.sr-audio-link-badge').forEach((node) => node.remove());

  const cleanups = [];
  for (const link of links) {
    if (!link.resolvedStart || !link.resolvedEnd || ['missing', 'ambiguous'].includes(link.status)) continue;
    const startNode = findAttack(root, link.resolvedStart);
    const endNode = findAttack(root, link.resolvedEnd);
    if (!startNode || !endNode) continue;
    const group = startNode.closest('.sr-line-group');
    if (!group || endNode.closest('.sr-line-group') !== group) continue;
    const start = numberOfFraction(link.resolvedStart.time);
    const endEdge = numberOfFraction(endNode.getAttribute('data-geometry-end'));
    if (!Number.isFinite(start) || !Number.isFinite(endEdge)) continue;
    const selected = options.selectedLinkId === link.id;
    const label = `${link.recording?.name || 'Vilambit recording'} · ${formatTime(link.startTime)}–${formatTime(link.endTime)}`;
    const slots = [...group.querySelectorAll('.sr-slot[data-geometry-start]')].filter((slot) => {
      const slotStart = numberOfFraction(slot.getAttribute('data-geometry-start'));
      return Number.isFinite(slotStart) && slotStart >= start - 1e-8 && slotStart < endEdge - 1e-8;
    });
    for (const slot of slots) {
      slot.classList.add('sr-audio-linked');
      if (selected) slot.classList.add('selected');
      slot.dataset.audioLinkId = link.id;
      slot.title = `Linked audio: ${label}`;
      const activate = (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onActivate?.(link);
      };
      slot.addEventListener('click', activate);
      cleanups.push(() => slot.removeEventListener('click', activate));
    }
    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = `sr-audio-link-badge${selected ? ' selected' : ''}`;
    badge.dataset.audioLinkId = link.id;
    badge.setAttribute('aria-label', `Load linked Vilambit loop ${formatTime(link.startTime)} to ${formatTime(link.endTime)}`);
    badge.title = label;
    badge.textContent = '♪';
    const activateBadge = (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onActivate?.(link);
    };
    badge.addEventListener('click', activateBadge);
    startNode.appendChild(badge);
    cleanups.push(() => badge.removeEventListener('click', activateBadge));
  }
  return () => cleanups.forEach((cleanup) => cleanup());
}

function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
