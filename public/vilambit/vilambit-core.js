/*
 * Vilambit player core — pure transport/state calculations.
 *
 * This file deliberately has no DOM, media-element, AudioContext, WASM,
 * object-URL, or animation-frame access. The browser player owns those
 * imperative surfaces; this core only decides values and transitions.
 *
 * Loaded as a classic script by public/vilambit.html and exposed as
 * globalThis.VilambitCore so the existing non-module player can consume it.
 */
(function installVilambitCore(root) {
  'use strict';

  const ENGINE_NONE = 'none';
  const ENGINE_BUFFER = 'buffer';

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    const lo = finiteNumber(min, 0);
    const hi = Math.max(lo, finiteNumber(max, lo));
    return Math.min(hi, Math.max(lo, finiteNumber(value, lo)));
  }

  function clampDuration(duration) {
    return Math.max(0, finiteNumber(duration, 0));
  }

  function clampPosition(position, duration) {
    return clamp(position, 0, clampDuration(duration));
  }

  function clampTempo(value) {
    return Math.round(clamp(value, 25, 200));
  }

  function clampSemitones(value) {
    return Math.round(clamp(value, -12, 12));
  }

  function clampCents(value) {
    return Math.round(clamp(value, -100, 100));
  }

  function totalSemitones(semitones, cents) {
    return clampSemitones(semitones) + clampCents(cents) / 100;
  }

  /**
   * Resolve the position store that is authoritative for the active engine.
   *
   * The ENGINE_NONE branch preserves the confirmed seek-before-first-play
   * ruling: a non-zero paused position wins while the engine is unchosen.
   */
  function currentPosition({
    engine = ENGINE_NONE,
    playing = false,
    bufferInputTime = 0,
    pausedPosition = 0,
    mediaTime = 0,
    duration = Number.POSITIVE_INFINITY,
  } = {}) {
    let position;

    if (engine === ENGINE_BUFFER) {
      position = playing ? finiteNumber(bufferInputTime, 0) : finiteNumber(pausedPosition, 0);
    } else if (engine === ENGINE_NONE) {
      const paused = finiteNumber(pausedPosition, 0);
      position = paused || finiteNumber(mediaTime, 0) || 0;
    } else {
      position = finiteNumber(mediaTime, 0);
    }

    return Number.isFinite(duration)
      ? clampPosition(position, duration)
      : Math.max(0, position);
  }

  /**
   * Describe which engine stores must receive a seek.
   *
   * Before first play the future engine is unknown, so both paused-buffer and
   * media stores must be written. This is the core form of M's 2026-07-16 fix.
   */
  function planSeek({ engine = ENGINE_NONE, target = 0, duration = 0 } = {}) {
    const position = clampPosition(target, duration);

    if (engine === ENGINE_NONE) {
      return {
        position,
        writePausedPosition: true,
        writeMediaTime: true,
        scheduleBufferInput: false,
      };
    }

    if (engine === ENGINE_BUFFER) {
      return {
        position,
        writePausedPosition: true,
        writeMediaTime: false,
        scheduleBufferInput: true,
      };
    }

    return {
      position,
      writePausedPosition: false,
      writeMediaTime: true,
      scheduleBufferInput: false,
    };
  }

  /**
   * Reconcile the duplicated pre-play stores immediately after buildGraph()
   * chooses an engine.
   */
  function reconcileFirstPlay({
    engine = ENGINE_NONE,
    pausedPosition = 0,
    mediaTime = 0,
    duration = 0,
  } = {}) {
    let paused = clampPosition(pausedPosition, duration);
    let media = clampPosition(mediaTime, duration);

    if (engine === ENGINE_BUFFER) {
      if (!paused && media) paused = media;
    } else if (engine !== ENGINE_NONE) {
      if (paused && !media) media = paused;
    }

    return { pausedPosition: paused, mediaTime: media };
  }

  function normalizeLoop(loopA, loopB, duration = Number.POSITIVE_INFINITY) {
    const hasA = loopA !== null && loopA !== undefined;
    const hasB = loopB !== null && loopB !== undefined;
    const cap = Number.isFinite(duration) ? clampDuration(duration) : Number.POSITIVE_INFINITY;

    let a = hasA ? Math.max(0, finiteNumber(loopA, 0)) : null;
    let b = hasB ? Math.max(0, finiteNumber(loopB, 0)) : null;

    if (Number.isFinite(cap)) {
      if (a !== null) a = Math.min(cap, a);
      if (b !== null) b = Math.min(cap, b);
    }

    if (a !== null && b !== null && b < a) [a, b] = [b, a];

    return {
      loopA: a,
      loopB: b,
      ready: a !== null && b !== null,
    };
  }

  function setLoopPoint({ loopA = null, loopB = null, point, position, duration = 0 } = {}) {
    const next = point === 'B'
      ? normalizeLoop(loopA, clampPosition(position, duration), duration)
      : normalizeLoop(clampPosition(position, duration), loopB, duration);

    return {
      ...next,
      loopOn: point === 'B' && next.ready,
    };
  }

  function clearLoop() {
    return { loopA: null, loopB: null, loopOn: false, ready: false };
  }

  function normalizeMarker(marker, duration = Number.POSITIVE_INFINITY) {
    const source = marker && typeof marker === 'object' ? marker : {};
    const cap = Number.isFinite(duration) ? clampDuration(duration) : Number.POSITIVE_INFINITY;
    const rawTime = Math.max(0, finiteNumber(source.t, 0));
    return {
      ...source,
      t: Number.isFinite(cap) ? Math.min(cap, rawTime) : rawTime,
      label: typeof source.label === 'string' ? source.label : '',
    };
  }

  function sortMarkers(markers, duration = Number.POSITIVE_INFINITY) {
    if (!Array.isArray(markers)) return [];
    return markers
      .map((marker, index) => ({ marker: normalizeMarker(marker, duration), index }))
      .sort((a, b) => a.marker.t - b.marker.t || a.index - b.index)
      .map(({ marker }) => marker);
  }

  function addMarker(markers, position, duration = Number.POSITIVE_INFINITY, label = '') {
    return sortMarkers([
      ...(Array.isArray(markers) ? markers : []),
      normalizeMarker({ t: position, label }, duration),
    ], duration);
  }

  function moveMarker(markers, index, position, duration = Number.POSITIVE_INFINITY) {
    if (!Array.isArray(markers) || index < 0 || index >= markers.length) {
      return sortMarkers(markers, duration);
    }
    const next = markers.map((marker, markerIndex) => markerIndex === index
      ? normalizeMarker({ ...marker, t: position }, duration)
      : marker);
    return sortMarkers(next, duration);
  }

  function removeMarker(markers, index, duration = Number.POSITIVE_INFINITY) {
    if (!Array.isArray(markers)) return [];
    return sortMarkers(markers.filter((_, markerIndex) => markerIndex !== index), duration);
  }

  /**
   * Build the serializable player-state shape that the iframe bridge can
   * publish without exposing DOM nodes, AudioContext objects, buffers, or WASM.
   */
  function createPublicSnapshot({
    ready = false,
    fileURL = null,
    fileName = '',
    fileSize = null,
    fileLastModified = null,
    isVideo = false,
    duration = 0,
    position = 0,
    playing = false,
    extractable = false,
    tempo = 100,
    semitones = 0,
    cents = 0,
    loopA = null,
    loopB = null,
    loopOn = false,
    markers = [],
    error = null,
  } = {}) {
    const safeDuration = clampDuration(duration);
    const loop = normalizeLoop(loopA, loopB, safeDuration);
    const loaded = Boolean(fileURL);

    return {
      ready: Boolean(ready),
      loaded,
      source: loaded ? {
        name: typeof fileName === 'string' ? fileName : '',
        kind: isVideo ? 'video' : 'audio',
        ...(fileSize != null && Number.isFinite(Number(fileSize)) && Number(fileSize) >= 0
          ? { size: Math.round(Number(fileSize)) } : {}),
        ...(fileLastModified != null && Number.isFinite(Number(fileLastModified)) && Number(fileLastModified) >= 0
          ? { lastModified: Math.round(Number(fileLastModified)) } : {}),
      } : null,
      duration: safeDuration,
      position: clampPosition(position, safeDuration),
      playing: loaded && Boolean(playing),
      extractable: loaded && Boolean(extractable),
      speed: clampTempo(tempo),
      pitch: {
        semitones: clampSemitones(semitones),
        cents: clampCents(cents),
        totalSemitones: totalSemitones(semitones, cents),
      },
      loop: {
        a: loop.loopA,
        b: loop.loopB,
        on: Boolean(loopOn) && loop.ready,
        ready: loop.ready,
      },
      markers: sortMarkers(markers, safeDuration),
      error: typeof error === 'string' && error ? error : null,
    };
  }

  root.VilambitCore = Object.freeze({
    ENGINE_NONE,
    ENGINE_BUFFER,
    finiteNumber,
    clamp,
    clampDuration,
    clampPosition,
    clampTempo,
    clampSemitones,
    clampCents,
    totalSemitones,
    currentPosition,
    planSeek,
    reconcileFirstPlay,
    normalizeLoop,
    setLoopPoint,
    clearLoop,
    normalizeMarker,
    sortMarkers,
    addMarker,
    moveMarker,
    removeMarker,
    createPublicSnapshot,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
