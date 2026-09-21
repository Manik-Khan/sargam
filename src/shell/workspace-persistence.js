import { parseSourceWorkspace, serializeSourceWorkspace } from '../engine/source-workspace.js';

// A fixed checkpoint deadline, not a trailing debounce: playback position
// changes must never starve marker/loop/settings saves. Recovery is keyed by
// project ID and applied only if the folder still matches the saved base.
export function createWorkspacePersistence({ write, storage, onError = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, delay = 1200 }) {
  const records = new Map();
  const key = project => `sargam.workspace.${project.manifest.id}`;
  let recoveryWarning = false;
  const checkpoint = record => {
    try {
      storage.setItem(key(record.project), JSON.stringify({ base: record.base, workspace: record.latest }));
      recoveryWarning = false;
    } catch (error) {
      if (!recoveryWarning) onError(new Error(`Workspace recovery could not be saved. Keep the project open until its folder save completes: ${error.message || error}`));
      recoveryWarning = true;
    }
  };
  const recordFor = (project, workspace) => {
    const id = key(project);
    if (!records.has(id)) records.set(id, { project, base: serializeSourceWorkspace(workspace), json: null, latest: null, version: 0, timer: null });
    const record = records.get(id);
    record.project = project;
    return record;
  };
  const flushRecord = record => {
    if (record.timer !== null) clearTimer(record.timer);
    record.timer = null;
    const json = record.json;
    const version = record.version;
    if (json === null) return Promise.resolve();
    // Clear only the pending snapshot; updates arriving during the write get
    // their own deadline and remain in recovery storage.
    record.json = null;
    return Promise.resolve().then(() => write(record.project, json)).then(() => {
      record.base = json;
      if (record.version !== version) checkpoint(record);
      else {
        try { storage.removeItem(key(record.project)); } catch { /* harmless stale recovery; base check protects reopen */ }
      }
    }, error => {
      if (record.json === null && record.version === version) record.json = json;
      checkpoint(record);
      onError(error);
    });
  };
  return {
    recover(project, workspace) {
      const record = recordFor(project, workspace);
      record.base = serializeSourceWorkspace(workspace);
      try {
        const saved = JSON.parse(storage.getItem(key(project)) || 'null');
        if (saved?.base === record.base && typeof saved.workspace === 'string') {
          const parsed = parseSourceWorkspace(saved.workspace);
          if (!parsed.problems.length) return parsed.workspace;
        }
      } catch { /* corrupt/unavailable recovery never replaces folder data */ }
      return workspace;
    },
    schedule(project, workspace) {
      if (!project?.manifest?.id) return;
      const record = recordFor(project, workspace);
      record.json = serializeSourceWorkspace(workspace);
      record.latest = record.json;
      record.version++;
      checkpoint(record);
      if (record.timer === null) record.timer = setTimer(() => flushRecord(record), delay);
    },
    flush() { return Promise.all([...records.values()].map(flushRecord)); },
    saved(project, workspace) {
      const record = records.get(key(project));
      if (!record) return;
      record.base = serializeSourceWorkspace(workspace);
      if (record.json !== null) checkpoint(record);
    },
  };
}
