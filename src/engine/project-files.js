// src/engine/project-files.js — injected File System Access operations for
// Phase 3B project folders. The engine names the contract; the shell injects
// showDirectoryPicker. No DOM or global browser APIs live here.

import {
  CLIPS_DIRECTORY,
  COMPOSITION_FILE,
  MEDIA_FILE,
  createEmptyMediaManifest,
  isSafeProjectPath,
  parseMediaManifest,
  serializeMediaManifest,
} from './project-media.js';

function isAbort(error) {
  return error && error.name === 'AbortError';
}

async function readTextFile(directory, name, { required = false } = {}) {
  try {
    const handle = await directory.getFileHandle(name, { create: false });
    const file = await handle.getFile();
    return { text: await file.text(), handle, file };
  } catch (error) {
    if (!required && (error?.name === 'NotFoundError' || error?.name === 'TypeMismatchError')) return null;
    throw error;
  }
}

async function writeFile(directory, name, value) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(value);
  await writable.close();
  return handle;
}

function splitClipPath(path) {
  if (!isSafeProjectPath(path) || !path.startsWith(`${CLIPS_DIRECTORY}/`)) {
    throw new TypeError('Clip path must stay inside clips/.');
  }
  const parts = path.split('/');
  if (parts.length !== 2) throw new TypeError('Nested clip paths are not supported in project v1.');
  return parts[1];
}

export function createProjectIO(env = {}) {
  const pickDirectory = env.pickDirectory || env.fsa?.directory || null;
  const supportsDirectory = typeof pickDirectory === 'function';

  async function choose(mode = 'readwrite') {
    if (!supportsDirectory) return null;
    try {
      return await pickDirectory({ id: 'sargam-project-folder', mode, startIn: 'documents' });
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }

  async function initialize(directory, { text, media = createEmptyMediaManifest(), allowExisting = false } = {}) {
    const existingComposition = await readTextFile(directory, COMPOSITION_FILE);
    const existingMedia = await readTextFile(directory, MEDIA_FILE);
    if (!allowExisting && (existingComposition || existingMedia)) {
      return {
        ok: false,
        conflict: true,
        directory,
        name: directory.name || 'Project Folder',
        message: 'That folder already contains a Sargam project. Use Open Project Folder instead.',
      };
    }
    await writeFile(directory, COMPOSITION_FILE, String(text ?? ''));
    await writeFile(directory, MEDIA_FILE, serializeMediaManifest(media));
    await directory.getDirectoryHandle(CLIPS_DIRECTORY, { create: true });
    return {
      ok: true,
      directory,
      name: directory.name || 'Project Folder',
      text: String(text ?? ''),
      media: parseMediaManifest(serializeMediaManifest(media)).manifest,
    };
  }

  return {
    supportsDirectory,

    async create({ text, media } = {}) {
      const directory = await choose('readwrite');
      if (!directory) return null;
      return initialize(directory, { text, media, allowExisting: false });
    },

    async open() {
      const directory = await choose('readwrite');
      if (!directory) return null;
      const composition = await readTextFile(directory, COMPOSITION_FILE, { required: true });
      const mediaFile = await readTextFile(directory, MEDIA_FILE);
      const parsed = parseMediaManifest(mediaFile?.text || '');
      await directory.getDirectoryHandle(CLIPS_DIRECTORY, { create: true });
      return {
        ok: parsed.ok,
        directory,
        name: directory.name || 'Project Folder',
        text: composition.text,
        media: parsed.manifest,
        problems: parsed.problems,
      };
    },

    async save(project, { text, media } = {}) {
      const directory = project?.directory;
      if (!directory) throw new TypeError('No project folder is open.');
      await writeFile(directory, COMPOSITION_FILE, String(text ?? ''));
      await writeFile(directory, MEDIA_FILE, serializeMediaManifest(media || createEmptyMediaManifest()));
      await directory.getDirectoryHandle(CLIPS_DIRECTORY, { create: true });
      return { ok: true, directory, name: directory.name || project.name || 'Project Folder' };
    },

    async writeClip(project, path, blob) {
      const directory = project?.directory;
      if (!directory) throw new TypeError('No project folder is open.');
      const filename = splitClipPath(path);
      const clips = await directory.getDirectoryHandle(CLIPS_DIRECTORY, { create: true });
      await writeFile(clips, filename, blob);
      return { ok: true, path, bytes: Number(blob?.size) || 0 };
    },

    async readClip(project, path) {
      const directory = project?.directory;
      if (!directory) throw new TypeError('No project folder is open.');
      const filename = splitClipPath(path);
      const clips = await directory.getDirectoryHandle(CLIPS_DIRECTORY, { create: false });
      const handle = await clips.getFileHandle(filename, { create: false });
      return handle.getFile();
    },

    async clipExists(project, path) {
      try {
        await this.readClip(project, path);
        return true;
      } catch (error) {
        if (error?.name === 'NotFoundError' || error?.name === 'TypeMismatchError') return false;
        throw error;
      }
    },

    async deleteClip(project, path) {
      const directory = project?.directory;
      if (!directory) throw new TypeError('No project folder is open.');
      const filename = splitClipPath(path);
      const clips = await directory.getDirectoryHandle(CLIPS_DIRECTORY, { create: false });
      try {
        await clips.removeEntry(filename);
        return true;
      } catch (error) {
        if (error?.name === 'NotFoundError') return false;
        throw error;
      }
    },
  };
}
