const CANONICAL_REPOSITORY = 'github.com/manik-khan/sargam';
const MIRROR_MARKER = '/.codex/.chatgpt-projects/';

function normalizedPath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/\/+$/, '');
}

function normalizedRemote(value) {
  const raw = String(value || '').trim();
  const ssh = raw.match(/^git@([^:]+):(.+)$/i);
  const normalized = ssh
    ? `${ssh[1]}/${ssh[2]}`
    : raw.replace(/^[a-z]+:\/\//i, '').replace(/^[^@]+@/i, '').replace(/^ssh\//i, '');
  return normalized.replace(/\.git$/i, '').replace(/\/+$/, '').toLowerCase();
}

export function repositoryPreflightProblems(value = {}) {
  const state = value && typeof value === 'object' ? value : {};
  const problems = [];
  const root = normalizedPath(state.root);

  if (!root) problems.push('Git did not report a repository root.');
  else if (root.toLowerCase().includes(MIRROR_MARKER)) {
    problems.push('This checkout is inside a Codex project mirror; open the GitHub clone instead.');
  }

  if (normalizedRemote(state.origin) !== CANONICAL_REPOSITORY) {
    problems.push('origin is not the canonical github.com/Manik-Khan/sargam repository.');
  }
  if (state.branch !== 'main') {
    problems.push(`start from main, not ${state.branch || 'a detached HEAD'}.`);
  }
  if (state.upstream !== 'origin/main') {
    problems.push('main is not tracking origin/main.');
  }
  if (!state.originMain) {
    problems.push('origin/main is unavailable; fetch the repository before starting.');
  } else if (state.head !== state.originMain) {
    problems.push('local HEAD does not match the fetched origin/main commit.');
  }
  if (state.remoteChecked) {
    if (!state.remoteMain) problems.push('the live GitHub main commit could not be read.');
    else if (state.head !== state.remoteMain) {
      problems.push('local HEAD does not match live GitHub main.');
    }
  }
  if (state.dirty) {
    problems.push('the working tree already has changes; preserve and review them before editing.');
  }

  return problems;
}
