// smokes/repository-hygiene.smoke.js — stale Finder files and conflict copies
// are easy to reintroduce and should never become part of a release again.

import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';

const paths = [
  '../.DS_Store',
  '../public/.DS_Store',
  '../public/audio/.DS_Store',
  '../public/audio/tabla/.DS_Store',
  '../src/.DS_Store',
  '../src/shell/PracticeBar 2.jsx',
  '../smokes/vilambit-bridge.smoke 2.js',
];

export const smokes = [
  {
    name: 'repository hygiene: generated Finder metadata is absent',
    async fn() {
      for (const path of paths.filter((value) => value.includes('.DS_Store'))) {
        await assert.rejects(access(new URL(path, import.meta.url)));
      }
    },
  },
  {
    name: 'repository hygiene: abandoned numbered component and smoke copies are absent',
    async fn() {
      for (const path of paths.filter((value) => value.includes(' 2.'))) {
        await assert.rejects(access(new URL(path, import.meta.url)));
      }
    },
  },
];
