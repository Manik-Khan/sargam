// src/engine/project-files.js — injected File System Access operations for
// local Sargam project folders and Phase 3C portable-project imports.
// The engine names the contract; the shell injects showDirectoryPicker.
// No DOM or global browser APIs live here.

import {
  CLIPS_DIRECTORY,
  COMPOSITION_FILE,
  MEDIA_FILE,
  PROJECT_FILE,
  createEmptyMediaManifest,
  createProjectManifest,
  isSafeProjectPath,
  normalizeProjectManifest,
  parseMediaManifest,
  parseProjectManifest,
  serializeMediaManifest,
  serializeProjectManifest,
  stableAssetId,
} from './project-media.js';
import {
  SOURCE_WORKSPACE_FILE,
  createEmptySourceWorkspace,
  parseSourceWorkspace,
  serializeSourceWorkspace,
} from './source-workspace.js';

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

function pathParts(path) {
  if (!isSafeProjectPath(path) || path.includes('\\')) throw new TypeError('Project paths must be safe relative paths.');
  return path.split('/');
}

async function parentForPath(directory, path, { create = false } = {}) {
  const parts = pathParts(path);
  const name = parts.pop();
  let parent = directory;
  for (const part of parts) parent = await parent.getDirectoryHandle(part, { create });
  return { parent, name };
}

async function readPath(directory, path) {
  const { parent, name } = await parentForPath(directory, path, { create: false });
  const handle = await parent.getFileHandle(name, { create: false });
  return handle.getFile();
}

async function writePath(directory, path, value) {
  const { parent, name } = await parentForPath(directory, path, { create: true });
  await writeFile(parent, name, value);
  return { path, bytes: Number(value?.size ?? value?.byteLength) || 0 };
}

async function pathExists(directory, path) {
  try {
    await readPath(directory, path);
    return true;
  } catch (error) {
    if (error?.name === 'NotFoundError') return false;
    if (error?.name === 'TypeMismatchError') return true;
    throw error;
  }
}

function splitClipPath(path) {
  if (!isSafeProjectPath(path) || String(path).includes('\\')) {
    throw new TypeError('Clip path must stay inside clips/.');
  }
  const parts = String(path).split('/');
  if (parts[0] !== CLIPS_DIRECTORY || parts.length !== 2) {
    throw new TypeError('Clip path must stay directly inside clips/.');
  }
  return parts[1];
}

function normalizedProjectManifest(value, name, now = null) {
  const base = value || createProjectManifest({ name });
  return normalizeProjectManifest({
    ...base,
    name: name || base.name,
    ...(now ? { modifiedAt: now } : {}),
  }).manifest;
}

function portableForkManifest(portable, { name, now, packageName } = {}) {
  const sourceManifest = normalizeProjectManifest(portable.manifest).manifest;
  const importedAt = now || sourceManifest.modifiedAt || sourceManifest.createdAt || '';
  const sourcePortable = sourceManifest.portable && typeof sourceManifest.portable === 'object'
    ? sourceManifest.portable
    : null;
  const extraFiles = Array.isArray(sourcePortable?.extraFiles)
    ? sourcePortable.extraFiles.filter((path) => typeof path === 'string' && isSafeProjectPath(path) && !path.includes('\\'))
    : [];
  // Package byte counts/checksums describe the imported archive, not the
  // editable folder after it changes. Keep only the safe extra-file inventory
  // needed for forward-compatible re-export; the next export rebuilds checksums.
  const portableInfo = sourcePortable ? {
    version: sourcePortable.version,
    format: sourcePortable.format,
    ...(extraFiles.length ? { extraFiles } : {}),
  } : undefined;
  return normalizeProjectManifest({
    ...sourceManifest,
    ...(portableInfo ? { portable: portableInfo } : {}),
    id: stableAssetId('project', `${sourceManifest.id}\n${name || ''}\n${importedAt}`),
    name: name || sourceManifest.name,
    createdAt: importedAt || sourceManifest.createdAt,
    modifiedAt: importedAt || sourceManifest.modifiedAt,
    originProjectId: sourceManifest.id,
    importedFrom: {
      ...(sourceManifest.importedFrom && typeof sourceManifest.importedFrom === 'object' ? sourceManifest.importedFrom : {}),
      ...(packageName ? { packageName } : {}),
      ...(importedAt ? { importedAt } : {}),
    },
  }).manifest;
}

function memoryFile(project, path) {
  pathParts(path);
  if (!project?.entries?.has(path)) {
    const error = new Error(`not found: ${path}`);
    error.name = 'NotFoundError';
    throw error;
  }
  const value = project.entries.get(path);
  const blob = value instanceof Blob ? value : new Blob([value]);
  try { Object.defineProperty(blob, 'name', { value: path.split('/').pop(), configurable: true }); } catch { /* optional */ }
  return blob;
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

  async function projectConflict(directory, paths = [PROJECT_FILE, COMPOSITION_FILE, MEDIA_FILE, SOURCE_WORKSPACE_FILE]) {
    for (const path of paths) {
      if (await pathExists(directory, path)) return path;
    }
    return null;
  }

  async function initialize(directory, {
    text,
    media = createEmptyMediaManifest(),
    workspace = createEmptySourceWorkspace(),
    manifest = createProjectManifest({ name: directory.name }),
    allowExisting = false,
  } = {}) {
    const conflictPath = allowExisting ? null : await projectConflict(directory);
    if (conflictPath) {
      return {
        ok: false,
        conflict: true,
        directory,
        name: directory.name || 'Project Folder',
        message: 'That folder already contains a Sargam project. Use Open Project Folder instead.',
      };
    }
    const normalizedManifest = normalizedProjectManifest(manifest, directory.name || 'Project Folder');
    // Write the recognition marker last. If a clip or data write fails, the
    // destination is not left looking like a complete project.
    await writePath(directory, COMPOSITION_FILE, String(text ?? ''));
    await writePath(directory, MEDIA_FILE, serializeMediaManifest(media));
    await writePath(directory, SOURCE_WORKSPACE_FILE, serializeSourceWorkspace(workspace));
    await directory.getDirectoryHandle(CLIPS_DIRECTORY, { create: true });
    await writePath(directory, PROJECT_FILE, serializeProjectManifest(normalizedManifest));
    return {
      ok: true,
      directory,
      name: directory.name || 'Project Folder',
      text: String(text ?? ''),
      media: parseMediaManifest(serializeMediaManifest(media)).manifest,
      workspace: parseSourceWorkspace(serializeSourceWorkspace(workspace)).workspace,
      manifest: normalizedManifest,
    };
  }

  return {
    supportsDirectory,

    async create({ text, media, workspace, manifest } = {}) {
      const directory = await choose('readwrite');
      if (!directory) return null;
      return initialize(directory, { text, media, workspace, manifest, allowExisting: false });
    },

    async open() {
      const directory = await choose('readwrite');
      if (!directory) return null;
      const composition = await readTextFile(directory, COMPOSITION_FILE, { required: true });
      const mediaFile = await readTextFile(directory, MEDIA_FILE);
      const workspaceFile = await readTextFile(directory, SOURCE_WORKSPACE_FILE);
      const projectFile = await readTextFile(directory, PROJECT_FILE);
      const parsedMedia = parseMediaManifest(mediaFile?.text || '');
      const parsedWorkspace = parseSourceWorkspace(workspaceFile?.text || '');
      const parsedProject = projectFile
        ? parseProjectManifest(projectFile.text)
        : { ok: true, manifest: createProjectManifest({ name: directory.name || 'Project Folder' }), problems: [] };
      await directory.getDirectoryHandle(CLIPS_DIRECTORY, { create: true });
      return {
        ok: parsedMedia.ok && parsedWorkspace.ok && parsedProject.ok,
        directory,
        name: directory.name || parsedProject.manifest.name || 'Project Folder',
        text: composition.text,
        media: parsedMedia.manifest,
        workspace: parsedWorkspace.workspace,
        manifest: normalizedProjectManifest(parsedProject.manifest, directory.name || parsedProject.manifest.name),
        problems: [...parsedProject.problems, ...parsedMedia.problems, ...parsedWorkspace.problems],
      };
    },

    async save(project, { text, media, workspace, manifest, now } = {}) {
      const name = project?.directory?.name || project?.name || 'Project Folder';
      const nextManifest = normalizedProjectManifest(manifest || project?.manifest, name, now);
      const nextWorkspace = workspace || createEmptySourceWorkspace();
      if (project?.entries instanceof Map) {
        project.entries.set(COMPOSITION_FILE, String(text ?? ''));
        project.entries.set(MEDIA_FILE, serializeMediaManifest(media || createEmptyMediaManifest()));
        project.entries.set(SOURCE_WORKSPACE_FILE, serializeSourceWorkspace(nextWorkspace));
        project.entries.set(PROJECT_FILE, serializeProjectManifest(nextManifest));
        return {
          ok: true,
          directory: null,
          name,
          manifest: nextManifest,
          workspace: parseSourceWorkspace(serializeSourceWorkspace(nextWorkspace)).workspace,
          memory: true,
          entries: project.entries,
        };
      }
      const directory = project?.directory;
      if (!directory) throw new TypeError('No project folder is open.');
      await writePath(directory, COMPOSITION_FILE, String(text ?? ''));
      await writePath(directory, MEDIA_FILE, serializeMediaManifest(media || createEmptyMediaManifest()));
      await writePath(directory, SOURCE_WORKSPACE_FILE, serializeSourceWorkspace(nextWorkspace));
      await directory.getDirectoryHandle(CLIPS_DIRECTORY, { create: true });
      await writePath(directory, PROJECT_FILE, serializeProjectManifest(nextManifest));
      return {
        ok: true,
        directory,
        name,
        manifest: nextManifest,
        workspace: parseSourceWorkspace(serializeSourceWorkspace(nextWorkspace)).workspace,
      };
    },

    /** Import a validated package into a user-chosen independent folder. */
    async importPortable(portable, { now, packageName } = {}) {
      if (!portable?.ok || !(portable.entries instanceof Map)) throw new TypeError('Portable project must be validated before import.');
      if (!supportsDirectory) {
        const name = String(packageName || portable.manifest.name || 'Portable Project').replace(/\.sargam$/i, '');
        const manifest = portableForkManifest(portable, { name, now, packageName });
        const entries = new Map(portable.entries);
        entries.set(PROJECT_FILE, serializeProjectManifest(manifest));
        return {
          ok: true,
          directory: null,
          memory: true,
          entries,
          name,
          text: portable.composition,
          media: portable.media,
          workspace: portable.workspace || createEmptySourceWorkspace(),
          manifest,
          problems: [...(portable.warnings || []), 'Temporary browser project: export a .sargam copy before closing or refreshing.'],
        };
      }
      const directory = await choose('readwrite');
      if (!directory) return null;
      const paths = [...portable.entries.keys()].filter((path) => path !== PROJECT_FILE);
      const conflict = await projectConflict(directory, [PROJECT_FILE, ...paths]);
      if (conflict) {
        return {
          ok: false,
          conflict: true,
          directory,
          name: directory.name || 'Project Folder',
          message: `The destination already contains ${conflict}. Choose an empty folder so the imported project remains an independent copy.`,
        };
      }

      const manifest = portableForkManifest(portable, {
        name: directory.name || portable.manifest.name,
        now,
        packageName,
      });

      // All entry paths were validated by parsePortableProject. Write the
      // package body first and the forked manifest last, so partial imports do
      // not masquerade as completed projects.
      for (const [path, bytes] of portable.entries) {
        if (path === PROJECT_FILE) continue;
        await writePath(directory, path, bytes);
      }
      await writePath(directory, PROJECT_FILE, serializeProjectManifest(manifest));
      await directory.getDirectoryHandle(CLIPS_DIRECTORY, { create: true });
      return {
        ok: true,
        directory,
        name: directory.name || manifest.name,
        text: portable.composition,
        media: portable.media,
        workspace: portable.workspace || createEmptySourceWorkspace(),
        manifest,
        problems: portable.warnings || [],
      };
    },

    async writeProjectFile(project, path, value) {
      pathParts(path);
      if (project?.entries instanceof Map) {
        project.entries.set(path, value);
        return { path, bytes: Number(value?.size ?? value?.byteLength) || 0 };
      }
      const directory = project?.directory;
      if (!directory) throw new TypeError('No project folder is open.');
      return writePath(directory, path, value);
    },

    async readProjectFile(project, path) {
      if (project?.entries instanceof Map) return memoryFile(project, path);
      const directory = project?.directory;
      if (!directory) throw new TypeError('No project folder is open.');
      return readPath(directory, path);
    },

    async projectFileExists(project, path) {
      if (project?.entries instanceof Map) return project.entries.has(path);
      const directory = project?.directory;
      if (!directory) return false;
      return pathExists(directory, path);
    },

    async writeClip(project, path, blob) {
      splitClipPath(path);
      return this.writeProjectFile(project, path, blob);
    },

    async readClip(project, path) {
      splitClipPath(path);
      return this.readProjectFile(project, path);
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
      const filename = splitClipPath(path);
      if (project?.entries instanceof Map) return project.entries.delete(path);
      const directory = project?.directory;
      if (!directory) throw new TypeError('No project folder is open.');
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
