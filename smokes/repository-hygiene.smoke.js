// smokes/repository-hygiene.smoke.js — stale Finder files and conflict copies
// are easy to reintroduce and should never become part of a release again.

import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const ignoredDirectories = new Set([
  '.git',
  '.vite',
  'dist',
  'dist-player',
  'dist-waveform-worker',
  'node_modules',
]);

async function projectFiles(directory = projectRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await projectFiles(path));
    else files.push(relative(projectRoot, path));
  }
  return files;
}

export const smokes = [
  {
    name: 'repository hygiene: generated Finder metadata is absent',
    async fn() {
      const finderMetadata = (await projectFiles())
        .filter((path) => path.split('/').includes('.DS_Store'));
      assert.deepEqual(finderMetadata, []);
    },
  },
  {
    name: 'repository hygiene: numbered conflict copies are absent',
    async fn() {
      const numberedCopies = (await projectFiles())
        .filter((path) => /(^|\/)[^/]+ 2\.[^/]+$/.test(path));
      assert.deepEqual(numberedCopies, []);
    },
  },
];
