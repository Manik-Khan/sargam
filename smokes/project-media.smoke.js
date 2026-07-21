// Vilambit Phase 3B — pure project/media contracts.
import assert from 'node:assert/strict';
import {
  clipPathFor,
  createEmptyMediaManifest,
  createProjectManifest,
  isSafeProjectPath,
  nextClipId,
  normalizeMediaManifest,
  normalizeSourceAsset,
  parseMediaManifest,
  parseProjectManifest,
  serializeMediaManifest,
  serializeProjectManifest,
  sourceAssetIdFromReference,
  upsertClipAsset,
  upsertSourceAsset,
} from '../src/engine/project-media.js';

const source = {
  name: 'Bageshri class.wav',
  kind: 'audio',
  duration: 3600.125,
  size: 912345678,
  lastModified: 1760000000000,
};

export const smokes = [
  {
    name: 'project media: empty manifest is versioned and serializes deterministically',
    fn() {
      const manifest = createEmptyMediaManifest();
      assert.equal(manifest.version, 1);
      assert.equal(manifest.kind, 'sargam-media');
      assert.deepEqual(parseMediaManifest(serializeMediaManifest(manifest)).manifest, manifest);
    },
  },
  {
    name: 'project media: source identity is stable and not filename-only',
    fn() {
      const id = sourceAssetIdFromReference(source);
      assert.equal(id, sourceAssetIdFromReference({ ...source }));
      assert.notEqual(id, sourceAssetIdFromReference({ ...source, duration: source.duration + 1 }));
      assert.match(id, /^source-/);
    },
  },
  {
    name: 'project media: source assets preserve optional size and reconnection facts',
    fn() {
      const result = normalizeSourceAsset(source);
      assert.equal(result.ok, true);
      assert.equal(result.asset.duration, 3600.125);
      assert.equal(result.asset.size, 912345678);
      assert.equal(result.asset.lastModified, 1760000000000);
    },
  },
  {
    name: 'project media: clips stay outside Markdown and inside clips/',
    fn() {
      assert.equal(clipPathFor('clip-0001', 'wav'), 'clips/clip-0001.wav');
      assert.equal(isSafeProjectPath('clips/clip-0001.wav'), true);
      assert.equal(isSafeProjectPath('../outside.wav'), false);
      assert.equal(isSafeProjectPath('/tmp/outside.wav'), false);
    },
  },
  {
    name: 'project media: source and clip records round-trip together',
    fn() {
      let manifest = upsertSourceAsset(createEmptyMediaManifest(), source);
      const sourceId = manifest.sources[0].id;
      manifest = upsertClipAsset(manifest, {
        id: 'clip-0001', sourceAssetId: sourceId,
        startTime: 42.25, endTime: 48.75,
        path: 'clips/clip-0001.wav', mimeType: 'audio/wav', bytes: 1000,
      });
      const parsed = parseMediaManifest(serializeMediaManifest(manifest));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.manifest.clips[0].sourceAssetId, sourceId);
      assert.equal(parsed.manifest.clips[0].path, 'clips/clip-0001.wav');
    },
  },
  {
    name: 'project media: missing source references narrate instead of disappearing',
    fn() {
      const normalized = normalizeMediaManifest({
        version: 1, kind: 'sargam-media', sources: [],
        clips: [{
          id: 'clip-0001', sourceAssetId: 'source-missing', startTime: 1, endTime: 2,
          path: 'clips/clip-0001.wav', mimeType: 'audio/wav',
        }],
      });
      assert.match(normalized.problems.join('\n'), /references missing source/);
      assert.equal(normalized.manifest.clips.length, 1);
    },
  },
  {
    name: 'project media: clip ids advance without reusing deleted numeric slots',
    fn() {
      const manifest = { ...createEmptyMediaManifest(), clips: [
        { id: 'clip-0002', sourceAssetId: 'source-a', startTime: 1, endTime: 2, path: 'clips/clip-0002.wav', mimeType: 'audio/wav' },
        { id: 'clip-0010', sourceAssetId: 'source-a', startTime: 2, endTime: 3, path: 'clips/clip-0010.wav', mimeType: 'audio/wav' },
      ] };
      assert.equal(nextClipId(manifest), 'clip-0011');
    },
  },
  {
    name: 'project manifest: portable paths are explicit and traversal is rejected',
    fn() {
      const manifest = createProjectManifest({ name: 'Raga Bageshri', createdAt: '2026-07-21T00:00:00Z' });
      const parsed = parseProjectManifest(serializeProjectManifest(manifest));
      assert.equal(parsed.ok, true);
      assert.equal(parsed.manifest.composition, 'composition.md');
      const unsafe = parseProjectManifest(JSON.stringify({ ...manifest, composition: '../escape.md' }));
      assert.equal(unsafe.ok, false);
      assert.equal(unsafe.manifest.composition, 'composition.md');
    },
  },
];
