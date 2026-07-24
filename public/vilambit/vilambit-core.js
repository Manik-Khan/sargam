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
   * Create a loop from one marker to the next marker at a later time.
   * Duplicate timestamps are skipped so the result never creates a zero-length
   * loop. The caller may seek to loopA after applying the returned state.
   */
  function setLoopBoundaryFromMarker({
    loopA = null,
    loopB = null,
    point = 'A',
    markerTime = 0,
    duration = 0,
    minGap = 0.01,
  } = {}) {
    const safeDuration = clampDuration(duration);
    const gap = Math.min(safeDuration, Math.max(0.001, finiteNumber(minGap, 0.01)));
    const marker = clampPosition(markerTime, safeDuration);
    let a = loopA == null ? null : clampPosition(loopA, safeDuration);
    let b = loopB == null ? null : clampPosition(loopB, safeDuration);

    if (String(point).toUpperCase() === 'B') {
      if (a !== null && marker < a + gap) a = null;
      b = marker;
    } else {
      if (b !== null && marker > b - gap) b = null;
      a = marker;
    }

    return { loopA: a, loopB: b, ready: a !== null && b !== null };
  }

  function loopFromMarkerToNext(markers, index, duration = Number.POSITIVE_INFINITY, minGap = 0.01) {
    const sorted = sortMarkers(markers, duration);
    const markerIndex = Number.isInteger(index) ? index : -1;
    const current = markerIndex >= 0 && markerIndex < sorted.length ? sorted[markerIndex] : null;
    if (!current) {
      return { loopA: null, loopB: null, ready: false, loopOn: false, nextMarkerIndex: -1 };
    }

    const gap = Math.max(0.001, finiteNumber(minGap, 0.01));
    const nextMarkerIndex = sorted.findIndex((marker, candidateIndex) =>
      candidateIndex > markerIndex && marker.t >= current.t + gap);
    if (nextMarkerIndex < 0) {
      return { loopA: current.t, loopB: null, ready: false, loopOn: false, nextMarkerIndex: -1 };
    }

    return {
      loopA: current.t,
      loopB: sorted[nextMarkerIndex].t,
      ready: true,
      loopOn: true,
      nextMarkerIndex,
    };
  }

  function normalizeViewWindow(viewStart, viewEnd, duration, minSpan = 0.25) {
    const safeDuration = clampDuration(duration);
    if (!safeDuration) return { start: 0, end: 0, span: 0, full: true };

    const safeMinSpan = Math.min(safeDuration, Math.max(0.01, finiteNumber(minSpan, 0.25)));
    let start = finiteNumber(viewStart, 0);
    let end = finiteNumber(viewEnd, safeDuration);
    if (end < start) [start, end] = [end, start];

    if (end - start >= safeDuration) {
      return { start: 0, end: safeDuration, span: safeDuration, full: true };
    }

    if (end - start < safeMinSpan) {
      const center = (start + end) / 2;
      start = center - safeMinSpan / 2;
      end = center + safeMinSpan / 2;
    }

    if (start < 0) {
      end -= start;
      start = 0;
    }
    if (end > safeDuration) {
      start -= end - safeDuration;
      end = safeDuration;
    }

    start = Math.max(0, start);
    end = Math.min(safeDuration, end);
    const span = Math.max(0, end - start);
    return {
      start,
      end,
      span,
      full: start <= 1e-6 && end >= safeDuration - 1e-6,
    };
  }

  function zoomViewWindow({
    viewStart = 0,
    viewEnd = 0,
    duration = 0,
    center = null,
    factor = 1,
    minSpan = 0.25,
  } = {}) {
    const current = normalizeViewWindow(viewStart, viewEnd || duration, duration, minSpan);
    if (!current.span) return current;
    const safeFactor = Math.max(0.01, finiteNumber(factor, 1));
    const targetSpan = clamp(current.span * safeFactor, Math.min(current.span, minSpan), duration);
    const pivot = center == null
      ? (current.start + current.end) / 2
      : clampPosition(center, duration);
    return normalizeViewWindow(
      pivot - targetSpan / 2,
      pivot + targetSpan / 2,
      duration,
      minSpan,
    );
  }

  function panViewWindow({
    viewStart = 0,
    viewEnd = 0,
    duration = 0,
    deltaSeconds = 0,
    minSpan = 0.25,
  } = {}) {
    const current = normalizeViewWindow(viewStart, viewEnd || duration, duration, minSpan);
    if (!current.span || current.full) return current;
    const delta = finiteNumber(deltaSeconds, 0);
    return normalizeViewWindow(
      current.start + delta,
      current.end + delta,
      duration,
      minSpan,
    );
  }

  function ensureTimeVisible({
    viewStart = 0,
    viewEnd = 0,
    duration = 0,
    time = 0,
    marginRatio = 0.12,
    minSpan = 0.25,
  } = {}) {
    const current = normalizeViewWindow(viewStart, viewEnd || duration, duration, minSpan);
    if (!current.span || current.full) return current;
    const target = clampPosition(time, duration);
    const ratio = clamp(marginRatio, 0, 0.45);
    const margin = current.span * ratio;
    const low = current.start + margin;
    const high = current.end - margin;
    if (target >= low && target <= high) return current;

    const nextStart = target < low
      ? target - margin
      : target - (current.span - margin);
    return normalizeViewWindow(
      nextStart,
      nextStart + current.span,
      duration,
      minSpan,
    );
  }

  function setLoopBoundary({
    loopA = null,
    loopB = null,
    point = 'A',
    value = 0,
    duration = 0,
    minGap = 0.01,
  } = {}) {
    const safeDuration = clampDuration(duration);
    const gap = Math.min(safeDuration, Math.max(0, finiteNumber(minGap, 0.01)));
    let a = loopA == null ? null : clampPosition(loopA, safeDuration);
    let b = loopB == null ? null : clampPosition(loopB, safeDuration);
    const next = clampPosition(value, safeDuration);

    if (String(point).toUpperCase() === 'B') {
      b = a == null ? next : Math.max(Math.min(safeDuration, a + gap), next);
    } else {
      a = b == null ? next : Math.min(Math.max(0, b - gap), next);
    }

    return { loopA: a, loopB: b, ready: a !== null && b !== null };
  }

  function nudgeLoopBoundary(options = {}) {
    const point = String(options.point || 'A').toUpperCase();
    const current = point === 'B' ? options.loopB : options.loopA;
    if (current == null) {
      return {
        loopA: options.loopA == null ? null : clampPosition(options.loopA, options.duration),
        loopB: options.loopB == null ? null : clampPosition(options.loopB, options.duration),
        ready: options.loopA != null && options.loopB != null,
      };
    }
    return setLoopBoundary({
      ...options,
      point,
      value: finiteNumber(current, 0) + finiteNumber(options.deltaSeconds, 0),
    });
  }

  function parseTimecode(value) {
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
    const text = String(value == null ? '' : value).trim();
    if (!text) return null;
    const parts = text.split(':');
    if (parts.length > 3 || parts.some((part) => part.trim() === '')) return null;
    const numbers = parts.map(Number);
    if (numbers.some((number) => !Number.isFinite(number) || number < 0)) return null;
    if (parts.length > 1 && numbers.slice(1).some((number) => number >= 60)) return null;
    if (parts.length === 1) return numbers[0];
    if (parts.length === 2) return numbers[0] * 60 + numbers[1];
    return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  }

  function normalizeSpeedRegions(regions, duration = Number.POSITIVE_INFINITY) {
    if (!Array.isArray(regions)) return [];
    const cap = Number.isFinite(duration) ? clampDuration(duration) : Number.POSITIVE_INFINITY;
    return regions
      .filter((region) => region && typeof region === 'object')
      .map((region) => {
        const start = Number.isFinite(cap)
          ? clampPosition(region.start, cap)
          : Math.max(0, finiteNumber(region.start, 0));
        const end = Number.isFinite(cap)
          ? clampPosition(region.end, cap)
          : Math.max(0, finiteNumber(region.end, 0));
        if (end <= start) return null;
        return { ...region, start, end, pct: clampTempo(region.pct) };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function normalizeBpm(value, duration = Number.POSITIVE_INFINITY) {
    if (!value || typeof value !== 'object') return null;
    const bpm = finiteNumber(value.bpm, 0);
    const period = finiteNumber(value.period, 0);
    if (bpm <= 0 || period <= 0) return null;
    const phaseAbs = Number.isFinite(duration)
      ? clampPosition(value.phaseAbs, duration)
      : Math.max(0, finiteNumber(value.phaseAbs, 0));
    return {
      ...value,
      bpm,
      period,
      phaseAbs,
      confidence: clamp(value.confidence, 0, 1),
      ...(value.tapped != null ? { tapped: Boolean(value.tapped) } : {}),
    };
  }

  function normalizeWorkspaceState(value = {}, duration = 0) {
    const source = value && typeof value === 'object' ? value : {};
    const safeDuration = clampDuration(duration);
    const loopSource = source.loop && typeof source.loop === 'object' ? source.loop : {};
    const loop = normalizeLoop(loopSource.a, loopSource.b, safeDuration);
    const viewSource = source.waveformView && typeof source.waveformView === 'object'
      ? source.waveformView
      : {};
    const view = normalizeViewWindow(
      viewSource.start,
      viewSource.end || safeDuration,
      safeDuration,
      0.25,
    );
    return {
      lastPosition: clampPosition(source.lastPosition, safeDuration),
      loop: {
        a: loop.loopA,
        b: loop.loopB,
        on: Boolean(loopSource.on) && loop.ready,
        ready: loop.ready,
      },
      tempoPercent: clampTempo(finiteNumber(source.tempoPercent, 100)),
      pitchSemitones: clampSemitones(finiteNumber(source.pitchSemitones, 0)),
      pitchCents: clampCents(finiteNumber(source.pitchCents, 0)),
      markers: sortMarkers(source.markers, safeDuration),
      bpm: normalizeBpm(source.bpm, safeDuration),
      speedRegions: normalizeSpeedRegions(source.speedRegions, safeDuration),
      waveformView: {
        start: view.start,
        end: view.end,
        followPlayhead: Boolean(viewSource.followPlayhead),
      },
    };
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
    bpm = null,
    speedRegions = [],
    viewStart = 0,
    viewEnd = 0,
    followPlayhead = false,
    error = null,
  } = {}) {
    const safeDuration = clampDuration(duration);
    const loop = normalizeLoop(loopA, loopB, safeDuration);
    const view = normalizeViewWindow(viewStart, viewEnd || safeDuration, safeDuration, 0.25);
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
      bpm: normalizeBpm(bpm, safeDuration),
      speedRegions: normalizeSpeedRegions(speedRegions, safeDuration),
      waveformView: {
        start: view.start,
        end: view.end,
        followPlayhead: Boolean(followPlayhead),
      },
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
    setLoopBoundaryFromMarker,
    loopFromMarkerToNext,
    normalizeViewWindow,
    zoomViewWindow,
    panViewWindow,
    ensureTimeVisible,
    setLoopBoundary,
    nudgeLoopBoundary,
    parseTimecode,
    normalizeSpeedRegions,
    normalizeBpm,
    normalizeWorkspaceState,
    createPublicSnapshot,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
