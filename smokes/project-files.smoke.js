// Vilambit Phase 3B — injected project-folder I/O.
import assert from 'node:assert/strict';
import { createProjectIO } from '../src/engine/project-files.js';
import {
  createEmptyMediaManifest, createProjectManifest, upsertClipAsset, upsertSourceAsset,
} from '../src/engine/project-media.js';
import { buildPortableProject, parsePortableProject } from '../src/engine/portable-project.js';

function notFound() {
  const error = new Error('not found');
  error.name = 'NotFoundError';
  return error;
}

class MemoryFileHandle {
  constructor(name, value = '') { this.name = name; this.value = value; }
  async getFile() {
    const blob = this.value instanceof Blob ? this.value : new Blob([this.value]);
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
      assert.match(await textOf(directory, 'manifest.json'), /"sargam-project"/);
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

  {
    name: 'project files: portable import writes all safe files and forks project identity',
    async fn() {
      let media = upsertSourceAsset(createEmptyMediaManifest(), {
        id: 'source-a', name: 'class.wav', kind: 'audio', duration: 60,
      });
      media = upsertClipAsset(media, {
        id: 'clip-0001', sourceAssetId: media.sources[0].id,
        startTime: 1, endTime: 2, path: 'clips/clip-0001.wav', mimeType: 'audio/wav', bytes: 3,
      });
      const sourceManifest = createProjectManifest({ id: 'project-original', name: 'Original' });
      const built = buildPortableProject({
        manifest: sourceManifest,
        composition: 'title: Imported\n\nS R G',
        media,
        files: new Map([
          ['clips/clip-0001.wav', new Uint8Array([7, 8, 9])],
          ['future/notes.json', '{"kept":true}'],
        ]),
        exportedAt: '2026-07-22T00:00:00Z',
      });
      const portable = parsePortableProject(built.bytes);
      assert.equal(portable.ok, true, portable.problems.join('; '));
      const directory = new MemoryDirectory('Independent Copy');
      const io = createProjectIO({ pickDirectory: async () => directory });
      const result = await io.importPortable(portable, {
        now: '2026-07-22T01:00:00Z', packageName: 'original.sargam',
      });
      assert.equal(result.ok, true);
      assert.notEqual(result.manifest.id, sourceManifest.id);
      assert.equal(result.manifest.originProjectId, sourceManifest.id);
      assert.equal(result.manifest.portable.files, undefined);
      assert.deepEqual(result.manifest.portable.extraFiles, ['future/notes.json']);
      assert.equal(await textOf(directory, 'composition.md'), 'title: Imported\n\nS R G');
      assert.equal((await io.readProjectFile(result, 'clips/clip-0001.wav')).size, 3);
      assert.equal(await (await io.readProjectFile(result, 'future/notes.json')).text(), '{"kept":true}');
      assert.match(await textOf(directory, 'manifest.json'), /originProjectId/);
    },
  },
  {
    name: 'project files: portable import refuses to overwrite package paths',
    async fn() {
      const directory = new MemoryDirectory('Conflict');
      directory.files.set('composition.md', new MemoryFileHandle('composition.md', 'keep me'));
      const io = createProjectIO({ pickDirectory: async () => directory });
      const packageData = {
        ok: true,
        manifest: createProjectManifest({ name: 'Incoming' }),
        composition: 'incoming',
        media: createEmptyMediaManifest(),
        warnings: [],
        entries: new Map([
          ['manifest.json', new TextEncoder().encode('{}')],
          ['composition.md', new TextEncoder().encode('incoming')],
          ['media.json', new TextEncoder().encode('{}')],
        ]),
      };
      const result = await io.importPortable(packageData, { now: '2026-07-22T00:00:00Z' });
      assert.equal(result.ok, false);
      assert.equal(result.conflict, true);
      assert.equal(await textOf(directory, 'composition.md'), 'keep me');
    },
  },
  {
    name: 'project files: browsers without directory access keep portable clips in a temporary project',
    async fn() {
      let media = upsertSourceAsset(createEmptyMediaManifest(), {
        id: 'source-temp', name: 'temp.wav', kind: 'audio', duration: 30,
      });
      media = upsertClipAsset(media, {
        id: 'clip-0001', sourceAssetId: media.sources[0].id,
        startTime: 2, endTime: 3, path: 'clips/clip-0001.wav', mimeType: 'audio/wav', bytes: 2,
      });
      const built = buildPortableProject({
        manifest: createProjectManifest({ name: 'Temporary' }),
        composition: 'S R', media,
        files: new Map([['clips/clip-0001.wav', new Uint8Array([1, 2])]]),
      });
      const portable = parsePortableProject(built.bytes);
      const io = createProjectIO({});
      const result = await io.importPortable(portable, { now: '2026-07-22T02:00:00Z', packageName: 'temp.sargam' });
      assert.equal(result.memory, true);
      const project = { name: result.name, manifest: result.manifest, entries: result.entries, memory: true };
      assert.equal((await io.readClip(project, 'clips/clip-0001.wav')).size, 2);
      await io.writeClip(project, 'clips/clip-0002.wav', new Blob(['new']));
      assert.equal((await io.readClip(project, 'clips/clip-0002.wav')).size, 3);
      const saved = await io.save(project, { text: 'S R G', media, now: '2026-07-22T03:00:00Z' });
      assert.equal(saved.memory, true);
      assert.equal(await (await io.readProjectFile(project, 'composition.md')).text(), 'S R G');
    },
  },
];
