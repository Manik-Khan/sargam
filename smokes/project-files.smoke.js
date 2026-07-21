// Vilambit Phase 3B — injected project-folder I/O.
import assert from 'node:assert/strict';
import { createProjectIO } from '../src/engine/project-files.js';
import { createEmptyMediaManifest } from '../src/engine/project-media.js';

function notFound() {
  const error = new Error('not found');
  error.name = 'NotFoundError';
  return error;
}

class MemoryFileHandle {
  constructor(name, value = '') { this.name = name; this.value = value; }
  async getFile() {
    const blob = this.value instanceof Blob ? this.value : new Blob([String(this.value)]);
    return Object.assign(blob, { name: this.name });
  }
  async createWritable() {
    return {
      write: async (value) => { this.value = value; },
      close: async () => {},
    };
  }
}

class MemoryDirectory {
  constructor(name) { this.name = name; this.files = new Map(); this.directories = new Map(); }
  async getFileHandle(name, { create = false } = {}) {
    if (!this.files.has(name)) {
      if (!create) throw notFound();
      this.files.set(name, new MemoryFileHandle(name));
    }
    return this.files.get(name);
  }
  async getDirectoryHandle(name, { create = false } = {}) {
    if (!this.directories.has(name)) {
      if (!create) throw notFound();
      this.directories.set(name, new MemoryDirectory(name));
    }
    return this.directories.get(name);
  }
  async removeEntry(name) {
    if (!this.files.delete(name)) throw notFound();
  }
}

async function textOf(directory, name) {
  return (await (await directory.getFileHandle(name)).getFile()).text();
}

export const smokes = [
  {
    name: 'project files: directory support is explicit and cancel is inert',
    async fn() {
      assert.equal(createProjectIO({}).supportsDirectory, false);
      const io = createProjectIO({ pickDirectory: async () => null });
      assert.equal(io.supportsDirectory, true);
      assert.equal(await io.create({ text: 'S R G' }), null);
    },
  },
  {
    name: 'project files: new folder writes composition, manifest, and clips directory',
    async fn() {
      const directory = new MemoryDirectory('Bageshri');
      const io = createProjectIO({ pickDirectory: async () => directory });
      const result = await io.create({ text: 'GAT\nS R G', media: createEmptyMediaManifest() });
      assert.equal(result.ok, true);
      assert.equal(await textOf(directory, 'composition.md'), 'GAT\nS R G');
      assert.match(await textOf(directory, 'media.json'), /"sargam-media"/);
      assert.equal(directory.directories.has('clips'), true);
    },
  },
  {
    name: 'project files: New refuses to overwrite an existing project',
    async fn() {
      const directory = new MemoryDirectory('Existing');
      directory.files.set('composition.md', new MemoryFileHandle('composition.md', 'old'));
      const io = createProjectIO({ pickDirectory: async () => directory });
      const result = await io.create({ text: 'new' });
      assert.equal(result.ok, false);
      assert.equal(result.conflict, true);
      assert.equal(await textOf(directory, 'composition.md'), 'old');
    },
  },
  {
    name: 'project files: Open restores notation and treats absent media.json as empty',
    async fn() {
      const directory = new MemoryDirectory('Legacy Folder');
      directory.files.set('composition.md', new MemoryFileHandle('composition.md', 'ALAP\nS---'));
      const io = createProjectIO({ pickDirectory: async () => directory });
      const result = await io.open();
      assert.equal(result.text, 'ALAP\nS---');
      assert.deepEqual(result.media.clips, []);
      assert.equal(directory.directories.has('clips'), true);
    },
  },
  {
    name: 'project files: extracted blobs write, read, and delete inside clips only',
    async fn() {
      const directory = new MemoryDirectory('Clips');
      const io = createProjectIO({ pickDirectory: async () => directory });
      const project = { directory, name: directory.name };
      const blob = new Blob(['audio'], { type: 'audio/wav' });
      await io.writeClip(project, 'clips/clip-0001.wav', blob);
      assert.equal((await io.readClip(project, 'clips/clip-0001.wav')).size, 5);
      assert.equal(await io.clipExists(project, 'clips/clip-0001.wav'), true);
      assert.equal(await io.deleteClip(project, 'clips/clip-0001.wav'), true);
      assert.equal(await io.clipExists(project, 'clips/clip-0001.wav'), false);
      await assert.rejects(() => io.writeClip(project, '../escape.wav', blob), /inside clips/);
    },
  },
];
