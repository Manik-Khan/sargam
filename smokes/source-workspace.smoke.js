// smokes/source-workspace.smoke.js — project-native per-source Vilambit state.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SOURCE_WORKSPACE_FILE,
  createEmptySourceWorkspace,
  normalizeSourceWorkspace,
  parseSourceWorkspace,
  serializeSourceWorkspace,
  sourceWorkspaceEntry,
  sourceWorkspaceEntryFromPlayer,
  upsertSourceWorkspaceEntry,
} from '../src/engine/source-workspace.js';

export const smokes = [
  {
    name: 'source workspace: empty v1 contract is a dedicated project file',
    fn() {
      assert.equal(SOURCE_WORKSPACE_FILE, 'workspace.json');
      assert.deepEqual(createEmptySourceWorkspace(), {
        kind: 'sargam-source-workspace',
        version: 1,
        sources: {},
      });
    },
  },
  {
    name: 'source workspace: player snapshots become canonical per-source entries',
    fn() {
      const entry = sourceWorkspaceEntryFromPlayer({
        position: 3041.23456,
        speed: 75,
        pitch: { semitones: 0, cents: -8 },
        loop: { a: 3046.8, b: 3039, on: true },
        markers: [{ t: 3050, label: 'taan' }, { t: 3020, label: 'start' }],
        bpm: { bpm: 120, period: 0.5, phaseAbs: 3025, confidence: 0.8 },
        speedRegions: [{ start: 3030, end: 3040, pct: 65 }],
        waveformView: { start: 3025, end: 3060, followPlayhead: false },
      });
      assert.equal(entry.lastPosition, 3041.235);
      assert.deepEqual(entry.loop, { a: 3039, b: 3046.8, on: true });
      assert.deepEqual(entry.markers.map((marker) => marker.label), ['start', 'taan']);
      assert.deepEqual(entry.waveformView, { start: 3025, end: 3060, followPlayhead: false });
    },
  },
  {
    name: 'source workspace: upsert isolates recordings and preserves safe future fields',
    fn() {
      const initial = {
        ...createEmptySourceWorkspace(),
        futureTopLevel: { retained: true },
      };
      const first = upsertSourceWorkspaceEntry(initial, 'source-alpha', {
        lastPosition: 12,
        futureSourceField: 'kept',
      });
      const second = upsertSourceWorkspaceEntry(first, 'source-beta', { lastPosition: 44 });
      assert.equal(sourceWorkspaceEntry(second, 'source-alpha').lastPosition, 12);
      assert.equal(sourceWorkspaceEntry(second, 'source-alpha').futureSourceField, 'kept');
      assert.equal(sourceWorkspaceEntry(second, 'source-beta').lastPosition, 44);
      assert.deepEqual(second.futureTopLevel, { retained: true });
    },
  },
  {
    name: 'source workspace: shell binds by stable source identity and debounces project writes',
    async fn() {
      const app = await readFile(new URL('../src/shell/App.jsx', import.meta.url), 'utf8');
      assert.match(app, /sourceAssetIdFromReference\(\{/);
      assert.match(app, /sendVilambit\('apply-workspace', savedEntry\)/);
      assert.match(app, /SOURCE_WORKSPACE_FILE/);
      assert.match(app, /window\.setTimeout\(\(\) => \{/);
      assert.match(app, /\}, 1200\)/);
      assert.doesNotMatch(app, /sourceAssetIdFromReference\(\{\s*name:/);
    },
  },
  {
    name: 'source workspace: parse is backward-compatible and rejects unsupported contracts',
    fn() {
      assert.deepEqual(parseSourceWorkspace('').workspace, createEmptySourceWorkspace());
      const invalid = normalizeSourceWorkspace({
        kind: 'other',
        version: 9,
        sources: { '../escape': {} },
      });
      assert.equal(invalid.problems.length, 3);
      assert.throws(() => serializeSourceWorkspace({ version: 9, sources: {} }), /unsupported/);
    },
  },
];
