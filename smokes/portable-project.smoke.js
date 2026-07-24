// Phase 3C — one-file .sargam project contracts and safe ZIP container.
import assert from 'node:assert/strict';
import {
  buildPortableProject,
  createStoredZip,
  crc32Hex,
  parsePortableProject,
  portableProjectName,
  readStoredZip,
} from '../src/engine/portable-project.js';
import {
  createEmptyMediaManifest,
  createProjectManifest,
  upsertClipAsset,
  upsertSourceAsset,
} from '../src/engine/project-media.js';
import {
  createEmptySourceWorkspace,
  upsertSourceWorkspaceEntry,
} from '../src/engine/source-workspace.js';

function fixture() {
  let media = upsertSourceAsset(createEmptyMediaManifest(), {
    id: 'source-class', name: 'class.mp4', kind: 'video', duration: 4000,
  });
  media = upsertClipAsset(media, {
    id: 'clip-0001', sourceAssetId: media.sources[0].id,
    startTime: 100, endTime: 108, duration: 8,
    loopStart: 0.4, loopEnd: 7.5, defaultLoopStart: 0.4, defaultLoopEnd: 7.5,
    path: 'clips/clip-0001.wav', mimeType: 'audio/wav', bytes: 5,
  });
  const workspace = upsertSourceWorkspaceEntry(createEmptySourceWorkspace(), media.sources[0].id, {
    lastPosition: 3041.2,
    loop: { a: 3039, b: 3046.8, on: true },
    tempoPercent: 75,
    waveformView: { start: 3025, end: 3060, followPlayhead: false },
  });
  return {
    manifest: createProjectManifest({ id: 'project-bageshri', name: 'Raga Bageshri' }),
    composition: 'title: Bageshri\n\nGAT\nS R G',
    media,
    workspace,
    files: new Map([
      ['clips/clip-0001.wav', new Uint8Array([1, 2, 3, 4, 5])],
      ['future/teacher-notes.json', '{"note":"preserve me"}\n'],
    ]),
  };
}

export const smokes = [
  {
    name: 'portable project: one ZIP reconstructs notation, media, clips, and refined loops',
    fn() {
      const built = buildPortableProject({ ...fixture(), exportedAt: '2026-07-22T00:00:00Z' });
      const parsed = parsePortableProject(built.bytes);
      assert.equal(parsed.ok, true, parsed.problems.join('; '));
      assert.equal(parsed.composition, fixture().composition);
      assert.equal(parsed.media.clips[0].loopStart, 0.4);
      assert.equal(parsed.workspace.sources['source-class'].lastPosition, 3041.2);
      assert.ok(parsed.entries.has('workspace.json'));
      assert.deepEqual([...parsed.entries.get('clips/clip-0001.wav')], [1, 2, 3, 4, 5]);
      assert.equal(new TextDecoder().decode(parsed.entries.get('future/teacher-notes.json')), '{"note":"preserve me"}\n');
      assert.deepEqual(parsed.manifest.portable.extraFiles, ['future/teacher-notes.json']);
    },
  },
  {
    name: 'portable project: package ordering and checksums are deterministic',
    fn() {
      const args = { ...fixture(), exportedAt: '2026-07-22T00:00:00Z' };
      const one = buildPortableProject(args).bytes;
      const two = buildPortableProject(args).bytes;
      assert.deepEqual(one, two);
      const parsed = parsePortableProject(one);
      const clipRecord = parsed.manifest.portable.files.find((file) => file.path === 'clips/clip-0001.wav');
      assert.equal(clipRecord.crc32, crc32Hex(new Uint8Array([1, 2, 3, 4, 5])));
    },
  },
  {
    name: 'portable project: traversal and duplicate paths are rejected before writing',
    fn() {
      assert.throws(() => createStoredZip({ '../escape.txt': 'bad' }), /Unsafe/);
      assert.throws(() => createStoredZip({ 'clips\\escape.wav': 'bad' }), /Unsafe/);
      assert.throws(() => createStoredZip({ 'clips/A.wav': 'a', 'clips/a.wav': 'b' }), /colliding/);
      assert.throws(() => buildPortableProject({ ...fixture(), files: new Map() }), /missing clip/);
    },
  },
  {
    name: 'portable project: corrupted entry bytes fail CRC validation',
    fn() {
      const bytes = buildPortableProject({ ...fixture(), exportedAt: '2026-07-22T00:00:00Z' }).bytes.slice();
      const entries = readStoredZip(bytes);
      assert.ok(entries.has('composition.md'));
      // Locate a known notation byte in the local body and flip it. The central
      // checksum remains unchanged, so the parser must reject the package.
      const needle = new TextEncoder().encode('title: Bageshri');
      let at = -1;
      outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
        for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
        at = i; break;
      }
      assert.ok(at >= 0);
      bytes[at] ^= 1;
      const parsed = parsePortableProject(bytes);
      assert.equal(parsed.ok, false);
      assert.match(parsed.problems.join(' '), /checksum failed/);
    },
  },
  {
    name: 'portable project: conflicting local headers and trailing bytes are rejected',
    fn() {
      const built = buildPortableProject({ ...fixture(), exportedAt: '2026-07-22T00:00:00Z' });
      const headerMismatch = built.bytes.slice();
      const view = new DataView(headerMismatch.buffer);
      view.setUint32(18, view.getUint32(18, true) + 1, true);
      const headerResult = parsePortableProject(headerMismatch);
      assert.equal(headerResult.ok, false);
      assert.match(headerResult.problems.join(' '), /headers disagree/);

      const trailing = new Uint8Array(built.bytes.length + 1);
      trailing.set(built.bytes);
      const trailingResult = parsePortableProject(trailing);
      assert.equal(trailingResult.ok, false);
      assert.match(trailingResult.problems.join(' '), /trailing ZIP data/);
    },
  },
  {
    name: 'portable project: manifest refuses a package with a missing referenced clip',
    fn() {
      const built = buildPortableProject({ ...fixture(), exportedAt: '2026-07-22T00:00:00Z' });
      const entries = readStoredZip(built.bytes);
      entries.delete('clips/clip-0001.wav');
      // The original manifest still declares the clip, while the rebuilt ZIP
      // does not contain it.
      const parsed = parsePortableProject(createStoredZip(entries));
      assert.equal(parsed.ok, false);
      assert.match(parsed.problems.join(' '), /missing clip|lists missing file/);
    },
  },
  {
    name: 'portable project: user-facing filenames use the single .sargam extension',
    fn() {
      assert.equal(portableProjectName('Raga Bageshri'), 'Raga-Bageshri.sargam');
      assert.equal(portableProjectName('lesson.md'), 'lesson.sargam');
    },
  },
];
