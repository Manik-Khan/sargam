// src/engine/portable-project.js — Phase 3C portable .sargam package.
//
// The user-facing file is a ZIP-compatible container, but Sargam writes
// entries with the ZIP "store" method because notation/JSON are tiny and the
// audio clips are already compressed (or WAV data that should not silently be
// transcoded). This module is browser-safe, imports no DOM/React APIs, and is
// fully smoke-testable in Node.

import {
  COMPOSITION_FILE,
  MEDIA_FILE,
  PROJECT_FILE,
  createProjectManifest,
  isSafeProjectPath,
  normalizeMediaManifest,
  normalizeProjectManifest,
  serializeMediaManifest,
} from './project-media.js';
import {
  SOURCE_WORKSPACE_FILE,
  createEmptySourceWorkspace,
  normalizeSourceWorkspace,
  parseSourceWorkspace,
  serializeSourceWorkspace,
} from './source-workspace.js';

export const PORTABLE_EXTENSION = '.sargam';
export const PORTABLE_MIME = 'application/vnd.sargam+zip';
export const PORTABLE_PACKAGE_VERSION = 1;
export const PORTABLE_SOFT_LIMIT_BYTES = 250 * 1024 * 1024;
export const PORTABLE_HARD_LIMIT_BYTES = 1024 * 1024 * 1024;
export const PORTABLE_MAX_FILES = 10000;
export const PORTABLE_MAX_TEXT_BYTES = 10 * 1024 * 1024;

const MANIFEST_FILE = PROJECT_FILE;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_END = 0x06054b50;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'string') return encoder.encode(value);
  throw new TypeError('Portable package entries must be text or byte arrays.');
}

function uint32(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 0xffffffff) {
    throw new RangeError('Portable ZIP v1 supports files smaller than 4 GiB.');
  }
  return number >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(value) {
  const bytes = asBytes(value);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function crc32Hex(value) {
  return crc32(value).toString(16).padStart(8, '0');
}

function safePortablePath(path) {
  if (typeof path !== 'string' || path.length > 1024 || /[\u0000-\u001f\u007f]/.test(path)
      || path.includes('\\') || !isSafeProjectPath(path)) {
    throw new TypeError(`Unsafe portable-project path: ${String(path)}`);
  }
  if (path.endsWith('/')) throw new TypeError(`Directory entries are not allowed in portable project v1: ${path}`);
  return path;
}

function portablePathKey(path) {
  return path.normalize('NFC').toLowerCase();
}

function normalizeEntries(entries) {
  const list = entries instanceof Map ? [...entries.entries()] : Object.entries(entries || {});
  if (list.length > PORTABLE_MAX_FILES) throw new RangeError(`Portable project contains more than ${PORTABLE_MAX_FILES} files.`);
  const normalized = [];
  const names = new Set();
  const pathKeys = new Set();
  let total = 0;
  for (const [rawName, value] of list) {
    const name = safePortablePath(rawName);
    if (names.has(name)) throw new TypeError(`Duplicate portable-project path: ${name}`);
    const pathKey = portablePathKey(name);
    if (pathKeys.has(pathKey)) throw new TypeError(`Case or Unicode-colliding portable-project path: ${name}`);
    names.add(name);
    pathKeys.add(pathKey);
    const bytes = asBytes(value);
    total += bytes.byteLength;
    if (total > PORTABLE_HARD_LIMIT_BYTES) throw new RangeError('Portable project exceeds the 1 GiB safety limit.');
    normalized.push({ name, nameBytes: encoder.encode(name), bytes, crc: crc32(bytes) });
  }
  return normalized.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function writeU16(view, offset, value) { view.setUint16(offset, value, true); }
function writeU32(view, offset, value) { view.setUint32(offset, uint32(value), true); }

/** Build a deterministic, uncompressed ZIP from safe relative paths. */
export function createStoredZip(entries) {
  const files = normalizeEntries(entries);
  const localSize = files.reduce((sum, file) => sum + 30 + file.nameBytes.length + file.bytes.length, 0);
  const centralSize = files.reduce((sum, file) => sum + 46 + file.nameBytes.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let cursor = 0;

  for (const file of files) {
    file.localOffset = cursor;
    writeU32(view, cursor, ZIP_LOCAL);
    writeU16(view, cursor + 4, 20);
    writeU16(view, cursor + 6, UTF8_FLAG);
    writeU16(view, cursor + 8, STORE_METHOD);
    writeU16(view, cursor + 10, 0); // deterministic DOS time
    writeU16(view, cursor + 12, 33); // deterministic 1980-01-01 DOS date
    writeU32(view, cursor + 14, file.crc);
    writeU32(view, cursor + 18, file.bytes.length);
    writeU32(view, cursor + 22, file.bytes.length);
    writeU16(view, cursor + 26, file.nameBytes.length);
    writeU16(view, cursor + 28, 0);
    output.set(file.nameBytes, cursor + 30);
    output.set(file.bytes, cursor + 30 + file.nameBytes.length);
    cursor += 30 + file.nameBytes.length + file.bytes.length;
  }

  const centralOffset = cursor;
  for (const file of files) {
    writeU32(view, cursor, ZIP_CENTRAL);
    writeU16(view, cursor + 4, 20);
    writeU16(view, cursor + 6, 20);
    writeU16(view, cursor + 8, UTF8_FLAG);
    writeU16(view, cursor + 10, STORE_METHOD);
    writeU16(view, cursor + 12, 0);
    writeU16(view, cursor + 14, 33);
    writeU32(view, cursor + 16, file.crc);
    writeU32(view, cursor + 20, file.bytes.length);
    writeU32(view, cursor + 24, file.bytes.length);
    writeU16(view, cursor + 28, file.nameBytes.length);
    writeU16(view, cursor + 30, 0);
    writeU16(view, cursor + 32, 0);
    writeU16(view, cursor + 34, 0);
    writeU16(view, cursor + 36, 0);
    writeU32(view, cursor + 38, 0);
    writeU32(view, cursor + 42, file.localOffset);
    output.set(file.nameBytes, cursor + 46);
    cursor += 46 + file.nameBytes.length;
  }

  writeU32(view, cursor, ZIP_END);
  writeU16(view, cursor + 4, 0);
  writeU16(view, cursor + 6, 0);
  writeU16(view, cursor + 8, files.length);
  writeU16(view, cursor + 10, files.length);
  writeU32(view, cursor + 12, centralSize);
  writeU32(view, cursor + 16, centralOffset);
  writeU16(view, cursor + 20, 0);
  return output;
}

function findEndRecord(bytes) {
  const minimum = Math.max(0, bytes.length - 22 - 0xffff);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= minimum; offset--) {
    if (view.getUint32(offset, true) === ZIP_END) return offset;
  }
  return -1;
}

/** Parse Sargam's stored ZIP subset with CRC, path, count, and size checks. */
export function readStoredZip(value, options = {}) {
  const bytes = asBytes(value);
  const hardLimit = Math.min(PORTABLE_HARD_LIMIT_BYTES, options.maxBytes || PORTABLE_HARD_LIMIT_BYTES);
  if (bytes.byteLength > hardLimit) throw new RangeError('Portable project exceeds the configured package-size limit.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndRecord(bytes);
  if (endOffset < 0) throw new TypeError('This file is not a valid .sargam ZIP package.');
  const disk = view.getUint16(endOffset + 4, true);
  const centralDisk = view.getUint16(endOffset + 6, true);
  const countDisk = view.getUint16(endOffset + 8, true);
  const count = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  const commentLength = view.getUint16(endOffset + 20, true);
  if (endOffset + 22 + commentLength !== bytes.length) throw new TypeError('Portable project has invalid trailing ZIP data.');
  if (disk !== 0 || centralDisk !== 0 || countDisk !== count) throw new TypeError('Multi-disk .sargam packages are not supported.');
  if (count > PORTABLE_MAX_FILES) throw new RangeError(`Portable project contains more than ${PORTABLE_MAX_FILES} files.`);
  if (centralOffset + centralSize !== endOffset || centralOffset > bytes.length) throw new TypeError('Portable project central directory is corrupt.');

  const entries = new Map();
  const pathKeys = new Set();
  const localRanges = [];
  let cursor = centralOffset;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== ZIP_CENTRAL) {
      throw new TypeError('Portable project central directory entry is corrupt.');
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (flags & 0x0001) throw new TypeError('Encrypted .sargam packages are not supported.');
    if (flags & 0x0008) throw new TypeError('Streaming ZIP data descriptors are not supported in .sargam v1.');
    if (method !== STORE_METHOD || compressedSize !== size) {
      throw new TypeError('This .sargam package uses unsupported ZIP compression. Re-export it from Sargam.');
    }
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > bytes.length) throw new TypeError('Portable project filename is truncated.');
    let name;
    try { name = decoder.decode(bytes.subarray(nameStart, nameEnd)); }
    catch { throw new TypeError('Portable project contains an invalid UTF-8 filename.'); }
    safePortablePath(name);
    if (entries.has(name)) throw new TypeError(`Duplicate portable-project path: ${name}`);
    const pathKey = portablePathKey(name);
    if (pathKeys.has(pathKey)) throw new TypeError(`Case or Unicode-colliding portable-project path: ${name}`);
    pathKeys.add(pathKey);

    if (localOffset >= centralOffset || localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== ZIP_LOCAL) {
      throw new TypeError(`Portable project local header is missing for ${name}.`);
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localCrc = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localSize = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    if (localFlags !== flags || localMethod !== method || localCrc !== expectedCrc
        || localCompressedSize !== compressedSize || localSize !== size) {
      throw new TypeError(`Portable project headers disagree for ${name}.`);
    }
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + size;
    if (localNameEnd > centralOffset || dataEnd > centralOffset) throw new TypeError(`Portable project entry is truncated: ${name}.`);
    const localName = decoder.decode(bytes.subarray(localNameStart, localNameEnd));
    if (localName !== name) throw new TypeError(`Portable project headers disagree on filename: ${name}.`);
    const data = bytes.slice(dataStart, dataEnd);
    if (crc32(data) !== expectedCrc) throw new TypeError(`Portable project checksum failed: ${name}.`);
    total += size;
    if (total > hardLimit) throw new RangeError('Portable project expands beyond the configured safety limit.');
    localRanges.push({ start: localOffset, end: dataEnd, name });
    entries.set(name, data);
    cursor = nameEnd + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) throw new TypeError('Portable project central directory size does not match its entries.');
  localRanges.sort((a, b) => a.start - b.start);
  for (let index = 1; index < localRanges.length; index++) {
    if (localRanges[index].start < localRanges[index - 1].end) {
      throw new TypeError(`Portable project entries overlap: ${localRanges[index - 1].name} and ${localRanges[index].name}.`);
    }
  }
  return entries;
}

function decodeText(entries, path) {
  const bytes = entries.get(path);
  if (!bytes) throw new TypeError(`Portable project is missing ${path}.`);
  if (bytes.byteLength > PORTABLE_MAX_TEXT_BYTES) throw new RangeError(`${path} is unexpectedly large.`);
  try { return decoder.decode(bytes); }
  catch { throw new TypeError(`${path} is not valid UTF-8 text.`); }
}

function fileRecord(path, bytes) {
  return { path, bytes: bytes.byteLength, crc32: crc32Hex(bytes) };
}

/**
 * Build one self-contained .sargam package.
 * `files` may contain extra safe future files; required text and current media
 * always replace same-named entries without rewriting the notation itself.
 */
export function buildPortableProject({
  manifest,
  composition,
  media,
  workspace = createEmptySourceWorkspace(),
  files = new Map(),
  exportedAt,
} = {}) {
  const normalizedMedia = normalizeMediaManifest(media);
  if (normalizedMedia.problems.length) throw new TypeError(`Cannot export media.json: ${normalizedMedia.problems.join('; ')}`);
  const normalizedWorkspace = normalizeSourceWorkspace(workspace);
  if (normalizedWorkspace.problems.length) {
    throw new TypeError(`Cannot export workspace.json: ${normalizedWorkspace.problems.join('; ')}`);
  }
  const compositionBytes = asBytes(String(composition ?? ''));
  const mediaBytes = asBytes(serializeMediaManifest(normalizedMedia.manifest));
  const workspaceBytes = asBytes(serializeSourceWorkspace(normalizedWorkspace.workspace));
  const payload = new Map(files instanceof Map ? files : Object.entries(files || {}));
  payload.delete(MANIFEST_FILE);
  payload.set(COMPOSITION_FILE, compositionBytes);
  payload.set(MEDIA_FILE, mediaBytes);
  payload.set(SOURCE_WORKSPACE_FILE, workspaceBytes);

  for (const clip of normalizedMedia.manifest.clips) {
    if (!payload.has(clip.path)) throw new TypeError(`Portable export is missing clip file ${clip.path}.`);
  }

  const knownPaths = new Set([
    COMPOSITION_FILE,
    MEDIA_FILE,
    SOURCE_WORKSPACE_FILE,
    ...normalizedMedia.manifest.clips.map((clip) => clip.path),
  ]);
  for (const path of payload.keys()) safePortablePath(path);
  const fileList = [...payload.entries()]
    .map(([path, value]) => fileRecord(path, asBytes(value)))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const extraFiles = fileList.filter((file) => !knownPaths.has(file.path)).map((file) => file.path);
  const base = normalizeProjectManifest(manifest || createProjectManifest()).manifest;
  const portableManifest = {
    ...base,
    composition: COMPOSITION_FILE,
    media: MEDIA_FILE,
    clips: 'clips',
    portable: {
      ...(base.portable && typeof base.portable === 'object' ? base.portable : {}),
      version: PORTABLE_PACKAGE_VERSION,
      format: 'zip-store',
      ...(exportedAt ? { exportedAt } : {}),
      files: fileList,
      ...(extraFiles.length ? { extraFiles } : {}),
    },
  };
  payload.set(MANIFEST_FILE, `${JSON.stringify(portableManifest, null, 2)}\n`);
  return {
    bytes: createStoredZip(payload),
    manifest: portableManifest,
    media: normalizedMedia.manifest,
    workspace: normalizedWorkspace.workspace,
  };
}

/** Validate and unpack one .sargam package without touching the filesystem. */
export function parsePortableProject(value, options = {}) {
  const problems = [];
  const warnings = [];
  let entries;
  try { entries = readStoredZip(value, options); }
  catch (error) { return { ok: false, problems: [error.message], warnings, entries: new Map() }; }

  let manifestText;
  let composition;
  let mediaText;
  let workspaceText = '';
  try {
    manifestText = decodeText(entries, MANIFEST_FILE);
    composition = decodeText(entries, COMPOSITION_FILE);
    mediaText = decodeText(entries, MEDIA_FILE);
    if (entries.has(SOURCE_WORKSPACE_FILE)) workspaceText = decodeText(entries, SOURCE_WORKSPACE_FILE);
  } catch (error) {
    return { ok: false, problems: [error.message], warnings, entries };
  }

  let rawManifest;
  try { rawManifest = JSON.parse(manifestText); }
  catch (error) { return { ok: false, problems: [`manifest.json is not valid JSON: ${error.message}`], warnings, entries }; }
  const projectResult = normalizeProjectManifest(rawManifest);
  problems.push(...projectResult.problems);
  const portable = rawManifest?.portable;
  if (!portable || portable.version !== PORTABLE_PACKAGE_VERSION) {
    problems.push(`unsupported portable package version: ${portable?.version ?? 'missing'}`);
  }
  if (portable?.format !== 'zip-store') problems.push(`unsupported portable package format: ${portable?.format ?? 'missing'}`);
  if (projectResult.manifest.composition !== COMPOSITION_FILE) problems.push('portable project composition path must be composition.md');
  if (projectResult.manifest.media !== MEDIA_FILE) problems.push('portable project media path must be media.json');
  if (projectResult.manifest.workspace !== SOURCE_WORKSPACE_FILE) {
    problems.push('portable project workspace path must be workspace.json');
  }

  let mediaValue;
  try { mediaValue = JSON.parse(mediaText); }
  catch (error) { problems.push(`media.json is not valid JSON: ${error.message}`); mediaValue = {}; }
  const mediaResult = normalizeMediaManifest(mediaValue);
  problems.push(...mediaResult.problems);
  for (const clip of mediaResult.manifest.clips) {
    if (!entries.has(clip.path)) problems.push(`portable project is missing clip ${clip.path}`);
  }
  const workspaceResult = parseSourceWorkspace(workspaceText);
  problems.push(...workspaceResult.problems);

  const declaredFiles = Array.isArray(portable?.files) ? portable.files : [];
  if (!Array.isArray(portable?.files)) problems.push('portable manifest requires a files list');
  const declaredPaths = new Set();
  for (const record of declaredFiles) {
    try {
      const path = safePortablePath(record?.path);
      if (declaredPaths.has(path)) problems.push(`portable manifest repeats file ${path}`);
      declaredPaths.add(path);
      const bytes = entries.get(path);
      if (!bytes) problems.push(`portable manifest lists missing file ${path}`);
      else {
        if (Number(record.bytes) !== bytes.byteLength) problems.push(`portable manifest byte count differs for ${path}`);
        if (String(record.crc32 || '').toLowerCase() !== crc32Hex(bytes)) problems.push(`portable manifest checksum differs for ${path}`);
      }
    } catch (error) { problems.push(error.message); }
  }
  for (const path of entries.keys()) {
    if (path === MANIFEST_FILE) continue;
    if (!declaredPaths.has(path)) warnings.push(`undeclared safe file preserved: ${path}`);
  }
  // Canonicalize the in-memory file inventory to the bytes we actually
  // validated. This means safe future files remain discoverable after import
  // and can be re-exported even when an older manifest forgot to declare them.
  const actualFiles = [...entries.entries()]
    .filter(([path]) => path !== MANIFEST_FILE)
    .map(([path, bytes]) => fileRecord(path, bytes))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const knownPaths = new Set([
    COMPOSITION_FILE,
    MEDIA_FILE,
    SOURCE_WORKSPACE_FILE,
    ...mediaResult.manifest.clips.map((clip) => clip.path),
  ]);
  const actualExtras = actualFiles.filter((file) => !knownPaths.has(file.path)).map((file) => file.path);
  const validatedManifest = {
    ...projectResult.manifest,
    portable: {
      ...(portable && typeof portable === 'object' ? portable : {}),
      version: PORTABLE_PACKAGE_VERSION,
      format: 'zip-store',
      files: actualFiles,
      ...(actualExtras.length ? { extraFiles: actualExtras } : {}),
    },
  };
  if (!actualExtras.length) delete validatedManifest.portable.extraFiles;

  return {
    ok: problems.length === 0,
    manifest: validatedManifest,
    media: mediaResult.manifest,
    workspace: workspaceResult.workspace,
    composition,
    entries,
    problems,
    warnings,
    bytes: asBytes(value).byteLength,
  };
}

export function portableProjectName(value, fallback = 'untitled') {
  const base = String(value || fallback)
    .replace(/\.(sargam|md|txt)$/i, '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || fallback;
  return `${base}${PORTABLE_EXTENSION}`;
}

export { MANIFEST_FILE as PROJECT_MANIFEST_FILE };
