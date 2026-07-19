// src/engine/layout.js — responsive notation-system planning.
//
// A source music line remains one semantic/playback line, but may be rendered
// as several print systems. Breaks are allowed only between whole matras and
// never through an ornament/repeat span. Written `|` dividers, then derived
// sam/khali/vibhag boundaries, are preferred over an arbitrary beat edge.
import { markerAtMatra, vibhagOfMatra, wrapMatra } from './tala.js';

/** Estimate the horizontal demand of one matra in em. This mirrors the
 * renderer's minimum cell and discrete-slot sizes without measuring pixels. */
export function estimateMatraEm(matra) {
  const events = matra?.events || [];
  let slots = 0;
  let graceChars = 0;
  for (const event of events) {
    if (event.grace) {
      graceChars += 0.5;
      continue;
    }
    slots += Math.max(1, Number(event.writtenSlots) || 1);
  }
  if (slots <= 1) return Math.max(2.6, 1.25 + graceChars);
  // 0.84em minimum per slot + 0.22em gap, plus cell padding/breathing room.
  return Math.max(2.6, slots * 0.84 + Math.max(0, slots - 1) * 0.22 + 0.8 + graceChars);
}

/** True when a system break after `k` would cut a load-bearing span. */
export function isSafeBreak(line, k) {
  for (const span of line?.spans || []) {
    if (span.from.matraIndex <= k && span.to.matraIndex > k) return false;
  }
  for (const repeat of line?.phraseRepeats || []) {
    if (repeat.fromMatra <= k && repeat.toMatra > k) return false;
  }
  return true;
}

function boundaryPriority(line, tal, k) {
  const after = k + 1;
  if ((line?._bars || []).includes(after)) return 4; // author's phrase hint
  if (!tal) return 1;
  const nextMatra = wrapMatra(tal, (line.startMatra || 1) + after);
  const marker = markerAtMatra(tal, nextMatra);
  if (marker === null) return 1;
  const vibhag = vibhagOfMatra(tal, nextMatra);
  if (vibhag === tal.samVibhag || (tal.khaliVibhags || []).includes(vibhag)) return 3;
  return 2;
}

function fixedEdgeEm(line) {
  let em = 0;
  if (line?.lineRepeat) em += 2.2;
  if (line?.returnCue) em += 3.2;
  em += (line?.passthrough?.length || 0) * 2;
  return em;
}

/**
 * Plan contiguous inclusive matra ranges for a visual system.
 * @returns {{from:number,to:number,reason:string}[]}
 */
export function planLineSystems(line, tal, { maxEm = Infinity } = {}) {
  const count = line?.matras?.length || 0;
  if (count === 0) return [{ from: 0, to: -1, reason: 'empty' }];
  if (!Number.isFinite(maxEm) || maxEm <= 0) return [{ from: 0, to: count - 1, reason: 'unbounded' }];

  const widths = line.matras.map(estimateMatraEm);
  const ranges = [];
  let from = 0;

  while (from < count) {
    let used = from === 0 ? (line.lineRepeat ? 1.1 : 0) : 0;
    let overflowAt = count;

    for (let i = from; i < count; i++) {
      used += widths[i];
      if (i < count - 1 && tal && markerAtMatra(tal, (line.startMatra || 1) + i + 1) !== null) used += 0.5;
      if (i === count - 1) used += fixedEdgeEm(line);
      if (used > maxEm) {
        overflowAt = i;
        break;
      }
    }

    if (overflowAt === count) {
      ranges.push({ from, to: count - 1, reason: 'fits' });
      break;
    }

    // Choose the most useful safe break that still keeps the system full.
    // Musical boundaries earn a bonus, but a very early bar cannot create a
    // tiny system when a later whole beat fits naturally.
    let candidate = -1;
    let candidateScore = -Infinity;
    let cumulative = from === 0 ? (line.lineRepeat ? 1.1 : 0) : 0;

    for (let k = from; k < overflowAt; k++) {
      cumulative += widths[k];
      if (!isSafeBreak(line, k)) continue;
      const fill = cumulative / maxEm;
      const priority = boundaryPriority(line, tal, k);
      const earlyPenalty = fill < 0.48 ? (0.48 - fill) * 22 : 0;
      const score = fill * 10 + priority * 1.7 - earlyPenalty;
      if (score > candidateScore) {
        candidate = k;
        candidateScore = score;
      }
    }

    // An ornament may itself be wider than the page. Keep walking until the
    // first legal boundary rather than splitting the musical object.
    if (candidate < from) {
      candidate = overflowAt;
      while (candidate < count - 1 && !isSafeBreak(line, candidate)) candidate++;
      if (candidate >= count) candidate = count - 1;
    }

    ranges.push({
      from,
      to: candidate,
      reason: boundaryPriority(line, tal, candidate) >= 2 ? 'musical-boundary' : 'whole-beat',
    });
    from = candidate + 1;
  }

  return ranges;
}
