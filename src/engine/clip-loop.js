// src/engine/clip-loop.js — pure contracts for extracted-clip boundaries.
// Source timestamps remain the archival truth. These helpers describe a
// non-destructive loop inside the extracted file and leave the binary intact.

export const CLIP_EXTRACTION_PADDING_SECONDS = 0.4;
export const MIN_CLIP_LOOP_SECONDS = 0.05;
export const DEFAULT_CLIP_CROSSFADE_MS = 12;
export const ZERO_CROSSING_WINDOW_SECONDS = 0.02;

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMillis(value) {
  const number = finite(value);
  return number == null ? null : Math.round(number * 1000) / 1000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function extractionRangeForLink(link, sourceDuration, padding = CLIP_EXTRACTION_PADDING_SECONDS) {
  const sourceStart = finite(link?.sourceRange?.start ?? link?.startTime);
  const sourceEnd = finite(link?.sourceRange?.end ?? link?.endTime);
  if (sourceStart == null || sourceEnd == null || sourceEnd <= sourceStart) {
    return { ok: false, problem: 'linked phrase requires a valid source range' };
  }
  const safePadding = Math.max(0, finite(padding, CLIP_EXTRACTION_PADDING_SECONDS));
  const duration = finite(sourceDuration ?? link?.recording?.duration);
  const extractionStart = Math.max(0, sourceStart - safePadding);
  const extractionEnd = duration != null && duration > 0
    ? Math.min(duration, sourceEnd + safePadding)
    : sourceEnd + safePadding;
  const loopStart = sourceStart - extractionStart;
  const loopEnd = sourceEnd - extractionStart;
  return {
    ok: true,
    sourceStart: roundMillis(sourceStart),
    sourceEnd: roundMillis(sourceEnd),
    extractionStart: roundMillis(extractionStart),
    extractionEnd: roundMillis(extractionEnd),
    loopStart: roundMillis(loopStart),
    loopEnd: roundMillis(loopEnd),
    paddingBefore: roundMillis(loopStart),
    paddingAfter: roundMillis(extractionEnd - sourceEnd),
  };
}

export function clipFileDuration(clip, decodedDuration = null) {
  const decoded = finite(decodedDuration);
  if (decoded != null && decoded > 0) return decoded;
  const stored = finite(clip?.duration);
  if (stored != null && stored > 0) return stored;
  const start = finite(clip?.startTime);
  const end = finite(clip?.endTime);
  return start != null && end != null && end > start ? end - start : 0;
}

export function normalizeClipLoopRegion(clip, decodedDuration = null) {
  const duration = clipFileDuration(clip, decodedDuration);
  if (!(duration > 0)) {
    return { ok: false, problem: 'clip duration is unavailable', start: 0, end: 0, duration: 0 };
  }
  const proposedStart = finite(clip?.loopStart, 0);
  const proposedEnd = finite(clip?.loopEnd, duration);
  const start = clamp(proposedStart, 0, Math.max(0, duration - MIN_CLIP_LOOP_SECONDS));
  const end = clamp(proposedEnd, start + MIN_CLIP_LOOP_SECONDS, duration);
  if (end - start < MIN_CLIP_LOOP_SECONDS) {
    return { ok: false, problem: 'clip loop must be at least 50 ms', start: 0, end: duration, duration };
  }
  return {
    ok: true,
    start: roundMillis(start),
    end: roundMillis(end),
    duration: roundMillis(duration),
    crossfadeMs: clamp(Math.round(finite(clip?.crossfadeMs, DEFAULT_CLIP_CROSSFADE_MS)), 0, 50),
  };
}

export function originalClipLoopRegion(clip, decodedDuration = null) {
  const duration = clipFileDuration(clip, decodedDuration);
  if (!(duration > 0)) return { ok: false, start: 0, end: 0, duration: 0 };
  const start = clamp(finite(clip?.defaultLoopStart, 0), 0, Math.max(0, duration - MIN_CLIP_LOOP_SECONDS));
  const end = clamp(finite(clip?.defaultLoopEnd, duration), start + MIN_CLIP_LOOP_SECONDS, duration);
  return { ok: true, start: roundMillis(start), end: roundMillis(end), duration: roundMillis(duration) };
}

export function updateClipLoopAsset(clip, { start, end, duration, crossfadeMs, updatedAt } = {}) {
  const fileDuration = clipFileDuration(clip, duration);
  const normalized = normalizeClipLoopRegion({
    ...clip,
    duration: fileDuration,
    loopStart: start,
    loopEnd: end,
    crossfadeMs,
  }, fileDuration);
  if (!normalized.ok) throw new TypeError(normalized.problem);
  const original = originalClipLoopRegion(clip, fileDuration);
  return {
    ...clip,
    duration: normalized.duration,
    loopStart: normalized.start,
    loopEnd: normalized.end,
    defaultLoopStart: original.ok ? original.start : 0,
    defaultLoopEnd: original.ok ? original.end : normalized.duration,
    crossfadeMs: normalized.crossfadeMs,
    ...(updatedAt ? { loopUpdatedAt: updatedAt } : {}),
  };
}

export function nearestZeroCrossing(samples, targetSeconds, sampleRate, windowSeconds = ZERO_CROSSING_WINDOW_SECONDS) {
  if (!samples || !Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length < 2) {
    return finite(targetSeconds, 0);
  }
  const target = clamp(Math.round(finite(targetSeconds, 0) * sampleRate), 1, samples.length - 1);
  const radius = Math.max(1, Math.round(Math.max(0, finite(windowSeconds, ZERO_CROSSING_WINDOW_SECONDS)) * sampleRate));
  const from = Math.max(1, target - radius);
  const to = Math.min(samples.length - 1, target + radius);
  let best = target;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAmplitude = Number.POSITIVE_INFINITY;
  for (let index = from; index <= to; index++) {
    const a = samples[index - 1];
    const b = samples[index];
    const crosses = (a <= 0 && b >= 0) || (a >= 0 && b <= 0);
    if (!crosses) continue;
    const distance = Math.abs(index - target);
    const amplitude = Math.abs(a) + Math.abs(b);
    if (distance < bestDistance || (distance === bestDistance && amplitude < bestAmplitude)) {
      best = index;
      bestDistance = distance;
      bestAmplitude = amplitude;
    }
  }
  return roundMillis(best / sampleRate);
}

export function snapLoopRegionToZeroCrossings(samples, sampleRate, start, end, duration) {
  const safeDuration = Math.max(0, finite(duration, samples?.length / sampleRate || 0));
  let snappedStart = nearestZeroCrossing(samples, start, sampleRate);
  let snappedEnd = nearestZeroCrossing(samples, end, sampleRate);
  snappedStart = clamp(snappedStart, 0, Math.max(0, safeDuration - MIN_CLIP_LOOP_SECONDS));
  snappedEnd = clamp(snappedEnd, snappedStart + MIN_CLIP_LOOP_SECONDS, safeDuration);
  return { start: roundMillis(snappedStart), end: roundMillis(snappedEnd) };
}
