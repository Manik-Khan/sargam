// src/engine/project-media.js — pure Phase 3B contracts for local Sargam
// projects. Binary audio never enters Markdown or these JSON records; manifests
// contain stable identities, source ranges, file paths, and lightweight facts.

import { SOURCE_WORKSPACE_FILE } from './source-workspace.js';

export const MEDIA_MANIFEST_VERSION = 1;
export const PROJECT_MANIFEST_VERSION = 1;
export const MEDIA_MANIFEST_KIND = 'sargam-media';
export const PROJECT_MANIFEST_KIND = 'sargam-project';
export const PROJECT_FILE = 'manifest.json';
export const COMPOSITION_FILE = 'composition.md';
export const MEDIA_FILE = 'media.json';
export const CLIPS_DIRECTORY = 'clips';

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMillis(value) {
  const number = finite(value);
  return number == null ? null : Math.round(number * 1000) / 1000;
}

function nonEmpty(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function safeId(value, prefix) {
  const text = nonEmpty(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!text) return null;
  return text.startsWith(`${prefix}-`) ? text : `${prefix}-${text}`;
}

export function stableAssetId(prefix, seed) {
  const p = nonEmpty(prefix, 'asset').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  return `${p}-${hashText(String(seed ?? ''))}`;
}

export function sourceAssetIdFromReference(reference = {}) {
  const explicit = safeId(reference.id, 'source');
  if (explicit) return explicit;
  const key = nonEmpty(reference.key);
  if (key) return safeId(key, 'source');
  const duration = roundMillis(reference.duration) ?? 0;
  const seed = [reference.kind === 'video' ? 'video' : 'audio', nonEmpty(reference.name), duration,
    Math.max(0, Math.round(finite(reference.size, 0))), Math.max(0, Math.round(finite(reference.lastModified, 0)))].join('\n');
  return stableAssetId('source', seed);
}

export function isSafeProjectPath(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const path = value.replace(/\\/g, '/');
  if (path.startsWith('/') || /^[A-Za-z]:\//.test(path)) return false;
  const parts = path.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..');
}

export function clipPathFor(id, extension = 'wav') {
  const cleanId = safeId(id, 'clip');
  const ext = nonEmpty(extension, 'wav').toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!cleanId || !ext) throw new TypeError('Clip id and extension are required.');
  return `${CLIPS_DIRECTORY}/${cleanId}.${ext}`;
}

export function normalizeSourceAsset(value = {}) {
  const name = nonEmpty(value.name);
  const duration = roundMillis(value.duration);
  if (!name) return { ok: false, problem: 'source asset requires a name' };
  if (duration == null || duration <= 0) return { ok: false, problem: 'source asset requires a positive duration' };
  const id = sourceAssetIdFromReference(value);
  const asset = {
    ...value,
    id,
    name,
    kind: value.kind === 'video' ? 'video' : 'audio',
    duration,
  };
  const size = finite(value.size);
  if (size != null && size >= 0) asset.size = Math.round(size);
  else delete asset.size;
  const lastModified = finite(value.lastModified);
  if (lastModified != null && lastModified >= 0) asset.lastModified = Math.round(lastModified);
  else delete asset.lastModified;
  const fingerprint = nonEmpty(value.fingerprint);
  if (fingerprint) asset.fingerprint = fingerprint;
  else delete asset.fingerprint;
  return { ok: true, asset };
}

export function normalizeClipAsset(value = {}) {
  const id = safeId(value.id, 'clip');
  const sourceAssetId = safeId(value.sourceAssetId, 'source');
  const startTime = roundMillis(value.startTime ?? value.sourceRange?.start);
  const endTime = roundMillis(value.endTime ?? value.sourceRange?.end);
  const path = nonEmpty(value.path);
  const mimeType = nonEmpty(value.mimeType, 'application/octet-stream');
  if (!id) return { ok: false, problem: 'clip asset requires an id' };
  if (!sourceAssetId) return { ok: false, problem: 'clip asset requires a sourceAssetId' };
  if (startTime == null || endTime == null || endTime <= startTime) {
    return { ok: false, problem: 'clip asset requires a valid source range' };
  }
  if (!isSafeProjectPath(path) || !path.startsWith(`${CLIPS_DIRECTORY}/`)) {
    return { ok: false, problem: 'clip asset path must stay inside clips/' };
  }
  const asset = {
    ...value,
    id,
    sourceAssetId,
    startTime,
    endTime,
    path,
    mimeType,
  };
  delete asset.sourceRange;
  const bytes = finite(value.bytes);
  if (bytes != null && bytes >= 0) asset.bytes = Math.round(bytes);
  else delete asset.bytes;

  // Wave 3: the extracted binary may include context outside the practice
  // phrase. These optional values define a non-destructive loop inside it.
  const duration = roundMillis(value.duration);
  if (duration != null && duration > 0) asset.duration = duration;
  else delete asset.duration;
  const loopStart = roundMillis(value.loopStart);
  const loopEnd = roundMillis(value.loopEnd);
  if ((loopStart == null) !== (loopEnd == null)) {
    return { ok: false, problem: 'clip loop requires both loopStart and loopEnd' };
  }
  if (loopStart != null) {
    const fileDuration = duration ?? roundMillis(endTime - startTime);
    if (loopStart < 0 || loopEnd <= loopStart || loopEnd > fileDuration + 0.001) {
      return { ok: false, problem: 'clip loop must stay inside the extracted file' };
    }
    asset.loopStart = loopStart;
    asset.loopEnd = loopEnd;
  } else {
    delete asset.loopStart;
    delete asset.loopEnd;
  }
  const defaultLoopStart = roundMillis(value.defaultLoopStart);
  const defaultLoopEnd = roundMillis(value.defaultLoopEnd);
  if ((defaultLoopStart == null) !== (defaultLoopEnd == null)) {
    return { ok: false, problem: 'clip default loop requires both endpoints' };
  }
  if (defaultLoopStart != null) {
    const fileDuration = duration ?? roundMillis(endTime - startTime);
    if (defaultLoopStart < 0 || defaultLoopEnd <= defaultLoopStart || defaultLoopEnd > fileDuration + 0.001) {
      return { ok: false, problem: 'clip default loop must stay inside the extracted file' };
    }
    asset.defaultLoopStart = defaultLoopStart;
    asset.defaultLoopEnd = defaultLoopEnd;
  } else {
    delete asset.defaultLoopStart;
    delete asset.defaultLoopEnd;
  }
  const paddingBefore = roundMillis(value.paddingBefore);
  const paddingAfter = roundMillis(value.paddingAfter);
  if (paddingBefore != null && paddingBefore >= 0) asset.paddingBefore = paddingBefore;
  else delete asset.paddingBefore;
  if (paddingAfter != null && paddingAfter >= 0) asset.paddingAfter = paddingAfter;
  else delete asset.paddingAfter;
  const crossfadeMs = finite(value.crossfadeMs);
  if (crossfadeMs != null) asset.crossfadeMs = Math.min(50, Math.max(0, Math.round(crossfadeMs)));
  else delete asset.crossfadeMs;
  const loopUpdatedAt = nonEmpty(value.loopUpdatedAt);
  if (loopUpdatedAt) asset.loopUpdatedAt = loopUpdatedAt;
  else delete asset.loopUpdatedAt;

  const createdAt = nonEmpty(value.createdAt);
  if (createdAt) asset.createdAt = createdAt;
  else delete asset.createdAt;
  const contentHash = nonEmpty(value.contentHash);
  if (contentHash) asset.contentHash = contentHash;
  else delete asset.contentHash;
  return { ok: true, asset };
}

export function createEmptyMediaManifest() {
  return {
    kind: MEDIA_MANIFEST_KIND,
    version: MEDIA_MANIFEST_VERSION,
    sources: [],
    clips: [],
  };
}

export function normalizeMediaManifest(value = {}) {
  const problems = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { manifest: createEmptyMediaManifest(), problems: ['media manifest must be an object'] };
  }
  if (value.version != null && value.version !== MEDIA_MANIFEST_VERSION) {
    problems.push(`unsupported media manifest version: ${value.version}`);
  }
  if (value.kind != null && value.kind !== MEDIA_MANIFEST_KIND) {
    problems.push(`unsupported media manifest kind: ${value.kind}`);
  }
  const sources = [];
  for (const item of Array.isArray(value.sources) ? value.sources : []) {
    const normalized = normalizeSourceAsset(item);
    if (!normalized.ok) problems.push(normalized.problem);
    else if (!sources.some((source) => source.id === normalized.asset.id)) sources.push(normalized.asset);
  }
  const sourceIds = new Set(sources.map((source) => source.id));
  const clips = [];
  for (const item of Array.isArray(value.clips) ? value.clips : []) {
    const normalized = normalizeClipAsset(item);
    if (!normalized.ok) {
      problems.push(normalized.problem);
      continue;
    }
    if (!sourceIds.has(normalized.asset.sourceAssetId)) {
      problems.push(`clip ${normalized.asset.id} references missing source ${normalized.asset.sourceAssetId}`);
    }
    if (!clips.some((clip) => clip.id === normalized.asset.id)) clips.push(normalized.asset);
  }
  return {
    manifest: {
      ...value,
      kind: MEDIA_MANIFEST_KIND,
      version: MEDIA_MANIFEST_VERSION,
      sources,
      clips,
    },
    problems,
  };
}

export function parseMediaManifest(text) {
  if (text == null || String(text).trim() === '') {
    return { ok: true, manifest: createEmptyMediaManifest(), problems: [] };
  }
  try {
    const normalized = normalizeMediaManifest(JSON.parse(String(text)));
    return { ok: normalized.problems.length === 0, ...normalized };
  } catch (error) {
    return {
      ok: false,
      manifest: createEmptyMediaManifest(),
      problems: [`media.json is not valid JSON: ${error.message}`],
    };
  }
}

export function serializeMediaManifest(value) {
  const { manifest, problems } = normalizeMediaManifest(value);
  if (problems.some((problem) => problem.startsWith('unsupported media manifest'))) {
    throw new TypeError(problems[0]);
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function upsertSourceAsset(manifest, source) {
  const normalizedManifest = normalizeMediaManifest(manifest).manifest;
  const normalized = normalizeSourceAsset(source);
  if (!normalized.ok) throw new TypeError(normalized.problem);
  return {
    ...normalizedManifest,
    sources: [
      ...normalizedManifest.sources.filter((item) => item.id !== normalized.asset.id),
      normalized.asset,
    ],
  };
}

export function upsertClipAsset(manifest, clip) {
  const normalizedManifest = normalizeMediaManifest(manifest).manifest;
  const normalized = normalizeClipAsset(clip);
  if (!normalized.ok) throw new TypeError(normalized.problem);
  return {
    ...normalizedManifest,
    clips: [
      ...normalizedManifest.clips.filter((item) => item.id !== normalized.asset.id),
      normalized.asset,
    ],
  };
}

export function removeClipAsset(manifest, id) {
  const normalized = normalizeMediaManifest(manifest).manifest;
  return { ...normalized, clips: normalized.clips.filter((clip) => clip.id !== id) };
}

export function nextClipId(manifest) {
  let max = 0;
  for (const clip of normalizeMediaManifest(manifest).manifest.clips) {
    const match = String(clip.id || '').match(/^clip-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `clip-${String(max + 1).padStart(4, '0')}`;
}

export function createProjectManifest({ id, name, createdAt, modifiedAt } = {}) {
  const projectId = safeId(id, 'project') || stableAssetId('project', `${name || ''}\n${createdAt || ''}`);
  return {
    kind: PROJECT_MANIFEST_KIND,
    version: PROJECT_MANIFEST_VERSION,
    id: projectId,
    name: nonEmpty(name, 'Untitled Sargam Project'),
    composition: COMPOSITION_FILE,
    media: MEDIA_FILE,
    workspace: SOURCE_WORKSPACE_FILE,
    clips: CLIPS_DIRECTORY,
    ...(createdAt ? { createdAt } : {}),
    ...(modifiedAt ? { modifiedAt } : {}),
  };
}

export function normalizeProjectManifest(value = {}) {
  const problems = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { manifest: createProjectManifest(), problems: ['project manifest must be an object'] };
  }
  if (value.version != null && value.version !== PROJECT_MANIFEST_VERSION) {
    problems.push(`unsupported project manifest version: ${value.version}`);
  }
  if (value.kind != null && value.kind !== PROJECT_MANIFEST_KIND) {
    problems.push(`unsupported project manifest kind: ${value.kind}`);
  }
  const manifest = {
    ...value,
    ...createProjectManifest(value),
    composition: isSafeProjectPath(value.composition || COMPOSITION_FILE) ? (value.composition || COMPOSITION_FILE) : COMPOSITION_FILE,
    media: isSafeProjectPath(value.media || MEDIA_FILE) ? (value.media || MEDIA_FILE) : MEDIA_FILE,
    workspace: isSafeProjectPath(value.workspace || SOURCE_WORKSPACE_FILE)
      ? (value.workspace || SOURCE_WORKSPACE_FILE)
      : SOURCE_WORKSPACE_FILE,
    clips: isSafeProjectPath(value.clips || CLIPS_DIRECTORY) ? (value.clips || CLIPS_DIRECTORY) : CLIPS_DIRECTORY,
  };
  if (manifest.composition !== (value.composition || COMPOSITION_FILE)) problems.push('unsafe project composition path');
  if (manifest.media !== (value.media || MEDIA_FILE)) problems.push('unsafe project media path');
  if (manifest.workspace !== (value.workspace || SOURCE_WORKSPACE_FILE)) problems.push('unsafe project workspace path');
  if (manifest.clips !== (value.clips || CLIPS_DIRECTORY)) problems.push('unsafe project clips path');
  return { manifest, problems };
}

export function parseProjectManifest(text) {
  try {
    const normalized = normalizeProjectManifest(JSON.parse(String(text)));
    return { ok: normalized.problems.length === 0, ...normalized };
  } catch (error) {
    return { ok: false, manifest: createProjectManifest(), problems: [`manifest.json is not valid JSON: ${error.message}`] };
  }
}

export function serializeProjectManifest(value) {
  const { manifest, problems } = normalizeProjectManifest(value);
  if (problems.some((problem) => problem.startsWith('unsupported project manifest'))) {
    throw new TypeError(problems[0]);
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
