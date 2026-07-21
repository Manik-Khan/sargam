// src/shell/vilambit-bridge.js — pure v1 contract for Sargam ↔ Vilambit.
// This module deliberately knows nothing about React, audio, DOM nodes, WASM,
// or Vilambit's private player object.

export const VILAMBIT_CHANNEL = 'sargam.vilambit';
export const VILAMBIT_VERSION = 1;

export const VILAMBIT_COMMANDS = Object.freeze([
  'request-state',
  'play',
  'pause',
  'toggle',
  'seek',
  'skip',
  'set-loop',
  'clear-loop',
  'jump-marker',
  'extract-loop',
]);

const COMMAND_SET = new Set(VILAMBIT_COMMANDS);
const EVENT_SET = new Set(['ready', 'state', 'error', 'clip']);

export const EMPTY_VILAMBIT_STATE = Object.freeze({
  ready: false,
  loaded: false,
  source: null,
  duration: 0,
  position: 0,
  playing: false,
  extractable: false,
  speed: 100,
  pitch: Object.freeze({ semitones: 0, cents: 0, totalSemitones: 0 }),
  loop: Object.freeze({ a: null, b: null, on: false, ready: false }),
  markers: Object.freeze([]),
  error: null,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalSecond(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function sanitizeVilambitState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const duration = Math.max(0, finite(value.duration));
  const position = Math.min(duration, Math.max(0, finite(value.position)));
  const source = value.source && typeof value.source === 'object'
    ? {
        name: text(value.source.name),
        kind: value.source.kind === 'video' ? 'video' : 'audio',
        ...(value.source.size != null && Number.isFinite(Number(value.source.size)) && Number(value.source.size) >= 0
          ? { size: Math.round(Number(value.source.size)) } : {}),
        ...(value.source.lastModified != null && Number.isFinite(Number(value.source.lastModified)) && Number(value.source.lastModified) >= 0
          ? { lastModified: Math.round(Number(value.source.lastModified)) } : {}),
      }
    : null;
  const pitch = value.pitch && typeof value.pitch === 'object' ? value.pitch : {};
  const loop = value.loop && typeof value.loop === 'object' ? value.loop : {};
  const markers = Array.isArray(value.markers)
    ? value.markers
        .filter((marker) => marker && typeof marker === 'object')
        .map((marker) => ({
          t: Math.min(duration, Math.max(0, finite(marker.t))),
          label: text(marker.label),
        }))
        .sort((a, b) => a.t - b.t)
    : [];

  return {
    ready: Boolean(value.ready),
    loaded: Boolean(value.loaded) && Boolean(source),
    source,
    duration,
    position,
    playing: Boolean(value.playing) && Boolean(value.loaded),
    extractable: Boolean(value.extractable) && Boolean(value.loaded),
    speed: Math.min(200, Math.max(25, Math.round(finite(value.speed, 100)))),
    pitch: {
      semitones: Math.min(12, Math.max(-12, Math.round(finite(pitch.semitones)))),
      cents: Math.min(100, Math.max(-100, Math.round(finite(pitch.cents)))),
      totalSemitones: finite(pitch.totalSemitones),
    },
    loop: {
      a: optionalSecond(loop.a),
      b: optionalSecond(loop.b),
      on: Boolean(loop.on),
      ready: Boolean(loop.ready),
    },
    markers,
    error: typeof value.error === 'string' && value.error ? value.error : null,
  };
}

export function makeVilambitCommand(type, payload = {}) {
  if (!COMMAND_SET.has(type)) throw new TypeError(`Unknown Vilambit command: ${type}`);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Vilambit command payload must be an object.');
  }
  return {
    channel: VILAMBIT_CHANNEL,
    version: VILAMBIT_VERSION,
    direction: 'command',
    type,
    payload,
  };
}

function sanitizeClipPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const requestId = text(value.requestId);
  const buffer = value.buffer instanceof ArrayBuffer ? value.buffer : null;
  const startTime = optionalSecond(value.startTime);
  const endTime = optionalSecond(value.endTime);
  if (!requestId || !buffer || startTime == null || endTime == null || endTime <= startTime) return null;
  const mimeType = text(value.mimeType, 'application/octet-stream');
  const extension = text(value.extension, 'bin').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'bin';
  return {
    requestId,
    buffer,
    mimeType,
    extension,
    bytes: buffer.byteLength,
    startTime,
    endTime,
    source: value.source && typeof value.source === 'object' ? {
      name: text(value.source.name),
      kind: value.source.kind === 'video' ? 'video' : 'audio',
      ...(value.source.size != null && Number.isFinite(Number(value.source.size)) && Number(value.source.size) >= 0
        ? { size: Math.round(Number(value.source.size)) } : {}),
      ...(value.source.lastModified != null && Number.isFinite(Number(value.source.lastModified)) && Number(value.source.lastModified) >= 0
        ? { lastModified: Math.round(Number(value.source.lastModified)) } : {}),
    } : null,
  };
}

export function readVilambitMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.channel !== VILAMBIT_CHANNEL) return null;
  if (value.version !== VILAMBIT_VERSION) return null;
  if (value.direction !== 'event' || !EVENT_SET.has(value.type)) return null;
  if (value.type === 'clip') {
    const clip = sanitizeClipPayload(value.payload);
    return clip ? { type: 'clip', clip } : null;
  }
  const state = sanitizeVilambitState(value.payload);
  return state ? { type: value.type, state } : null;
}

export function isExpectedVilambitEvent(event, { frameWindow, origin }) {
  if (!event || !frameWindow || event.source !== frameWindow) return false;
  if (origin === 'null') return event.origin === 'null';
  return event.origin === origin;
}

export function postVilambitCommand(frameWindow, type, payload = {}, origin = '', transfer = []) {
  if (!frameWindow || typeof frameWindow.postMessage !== 'function') return false;
  const message = makeVilambitCommand(type, payload);
  frameWindow.postMessage(message, origin === 'null' ? '*' : origin, transfer);
  return true;
}

export function formatVilambitTime(value) {
  const total = Math.max(0, Math.floor(finite(value)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
