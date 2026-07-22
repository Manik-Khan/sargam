// src/shell/clip-audio.js — browser-side decoded clip playback. Extracted
// clips use Web Audio rather than HTMLMediaElement.loop, eliminating the
// element restart gap and allowing exact non-destructive loop boundaries.

import { normalizeClipLoopRegion } from '../engine/clip-loop.js';

function audioContextConstructor() {
  return window.AudioContext || window.webkitAudioContext || null;
}

export function createClipAudioContext() {
  const Constructor = audioContextConstructor();
  if (!Constructor) throw new Error('This browser does not support decoded clip playback.');
  return new Constructor();
}

export async function decodeClipFile(file, context = null) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('A readable clip file is required.');
  const audioContext = context || createClipAudioContext();
  if (audioContext.state === 'suspended') await audioContext.resume();
  const bytes = await file.arrayBuffer();
  const buffer = await audioContext.decodeAudioData(bytes.slice(0));
  return { context: audioContext, buffer, ownsContext: !context };
}

export function mixdownClipBuffer(buffer) {
  if (!buffer || !buffer.length || !buffer.numberOfChannels) return new Float32Array(0);
  const mixed = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < mixed.length; i++) mixed[i] += data[i] / buffer.numberOfChannels;
  }
  return mixed;
}

export function startDecodedClipLoop({ context, buffer, start, end, crossfadeMs = 12, onError } = {}) {
  if (!context || !buffer) throw new TypeError('Decoded audio and its AudioContext are required.');
  const region = normalizeClipLoopRegion({
    duration: buffer.duration,
    loopStart: start,
    loopEnd: end,
    crossfadeMs,
  }, buffer.duration);
  if (!region.ok) throw new TypeError(region.problem);

  const segmentDuration = region.end - region.start;
  const crossfade = Math.min(region.crossfadeMs / 1000, segmentDuration / 4);
  let stopped = false;
  let timer = null;
  let nextAt = context.currentTime + 0.025;
  let scheduled = 0;
  const active = new Set();

  const stopSource = (entry) => {
    active.delete(entry);
    try { entry.source.disconnect(); } catch (_) {}
    try { entry.gain.disconnect(); } catch (_) {}
  };

  const scheduleOne = (at, first) => {
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.connect(gain).connect(context.destination);
    const finish = at + segmentDuration;
    gain.gain.cancelScheduledValues(at);
    if (first || crossfade <= 0) {
      gain.gain.setValueAtTime(1, at);
    } else {
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(1, at + crossfade);
    }
    if (crossfade > 0) {
      gain.gain.setValueAtTime(1, Math.max(at, finish - crossfade));
      gain.gain.linearRampToValueAtTime(0, finish);
    }
    const entry = { source, gain };
    active.add(entry);
    source.addEventListener('ended', () => stopSource(entry), { once: true });
    try {
      source.start(at, region.start, segmentDuration);
      source.stop(finish + 0.03);
    } catch (error) {
      stopSource(entry);
      onError?.(error);
      throw error;
    }
  };

  const period = Math.max(0.01, segmentDuration - crossfade);
  const scheduleAhead = () => {
    if (stopped) return;
    const horizon = context.currentTime + Math.max(1.5, segmentDuration * 1.5);
    try {
      while (nextAt < horizon) {
        scheduleOne(nextAt, scheduled === 0);
        scheduled += 1;
        nextAt += period;
      }
    } catch (error) {
      onError?.(error);
      stop();
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) window.clearInterval(timer);
    timer = null;
    for (const entry of [...active]) {
      try { entry.source.stop(); } catch (_) {}
      stopSource(entry);
    }
  };

  scheduleAhead();
  timer = window.setInterval(scheduleAhead, 250);
  return {
    region,
    stop,
    get playing() { return !stopped; },
  };
}

export async function playClipLoopFile(file, clip, { onError } = {}) {
  const { context, buffer } = await decodeClipFile(file);
  const region = normalizeClipLoopRegion(clip, buffer.duration);
  if (!region.ok) {
    await context.close();
    throw new Error(region.problem);
  }
  const session = startDecodedClipLoop({
    context,
    buffer,
    start: region.start,
    end: region.end,
    crossfadeMs: region.crossfadeMs,
    onError,
  });
  return {
    ...session,
    context,
    buffer,
    async close() {
      session.stop();
      try { await context.close(); } catch (_) {}
    },
  };
}
