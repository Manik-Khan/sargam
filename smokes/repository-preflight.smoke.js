import assert from 'node:assert/strict';
import { repositoryPreflightProblems } from '../src/engine/repository-preflight.js';

const sha = '42c0280d05a72d6978384229eb7cd24ef08ff376';
const valid = {
  root: '/Users/khansolo/Documents/GitHub/sargam',
  origin: 'https://github.com/Manik-Khan/sargam.git',
  branch: 'main',
  head: sha,
  upstream: 'origin/main',
  originMain: sha,
  remoteMain: sha,
  remoteChecked: true,
  dirty: false,
};

export const smokes = [
  {
    name: 'repository preflight: clean canonical checkout at live GitHub main is accepted',
    fn() {
      assert.deepEqual(repositoryPreflightProblems(valid), []);
      assert.deepEqual(repositoryPreflightProblems({
        ...valid,
        origin: 'git@github.com:Manik-Khan/sargam.git',
      }), []);
    },
  },
  {
    name: 'repository preflight: Codex project mirrors are rejected even with the right remote',
    fn() {
      const problems = repositoryPreflightProblems({
        ...valid,
        root: '/Users/khansolo/.codex/.chatgpt-projects/project/sargam',
      });
      assert.match(problems.join('\n'), /Codex project mirror/);
    },
  },
  {
    name: 'repository preflight: stale, divergent, or dirty main is rejected',
    fn() {
      const problems = repositoryPreflightProblems({
        ...valid,
        head: 'old',
        remoteMain: 'new',
        dirty: true,
      });
      assert.match(problems.join('\n'), /fetched origin\/main/);
      assert.match(problems.join('\n'), /live GitHub main/);
      assert.match(problems.join('\n'), /already has changes/);
    },
  },
  {
    name: 'repository preflight: wrong repository, branch, and upstream are rejected',
    fn() {
      const problems = repositoryPreflightProblems({
        ...valid,
        origin: 'https://github.com/example/other.git',
        branch: 'feature',
        upstream: 'origin/feature',
      });
      assert.match(problems.join('\n'), /canonical/);
      assert.match(problems.join('\n'), /start from main/);
      assert.match(problems.join('\n'), /tracking origin\/main/);
    },
  },
];
