import { execFileSync } from 'node:child_process';
import { repositoryPreflightProblems } from '../src/engine/repository-preflight.js';

function git(args, { optional = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', optional ? 'ignore' : 'pipe'],
    }).trim();
  } catch (error) {
    if (optional) return '';
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
}

const checkRemote = process.argv.includes('--remote');
let state;

try {
  const root = git(['rev-parse', '--show-toplevel']);
  const origin = git(['config', '--get', 'remote.origin.url'], { optional: true });
  const branch = git(['branch', '--show-current']);
  const head = git(['rev-parse', 'HEAD']);
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { optional: true });
  const originMain = git(['rev-parse', '--verify', 'refs/remotes/origin/main'], { optional: true });
  const status = git(['status', '--porcelain']);
  let remoteMain = null;

  if (checkRemote) {
    const result = git(['ls-remote', '--heads', 'origin', 'refs/heads/main']);
    remoteMain = result.split(/\s+/)[0] || null;
  }

  state = {
    root,
    origin,
    branch,
    head,
    upstream,
    originMain,
    remoteMain,
    remoteChecked: checkRemote,
    dirty: Boolean(status),
  };
} catch (error) {
  console.error(`Repository preflight could not run: ${error.message}`);
  process.exit(1);
}

const short = (value) => value ? value.slice(0, 12) : '(missing)';
console.log('Sargam repository preflight');
console.log(`  root:        ${state.root}`);
console.log(`  origin:      ${state.origin || '(missing)'}`);
console.log(`  branch:      ${state.branch || '(detached)'}`);
console.log(`  HEAD:        ${short(state.head)}`);
console.log(`  upstream:    ${state.upstream || '(missing)'}`);
console.log(`  origin/main: ${short(state.originMain)}`);
if (checkRemote) console.log(`  GitHub main: ${short(state.remoteMain)}`);
console.log(`  worktree:    ${state.dirty ? 'has changes' : 'clean'}`);

const problems = repositoryPreflightProblems(state);
if (problems.length) {
  console.error('\nBLOCKED: this is not a safe implementation starting point.');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('\nPASS: this checkout is the current authoritative Sargam starting point.');
