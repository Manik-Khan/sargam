// src/engine/source-workspace.js — versioned, pure-data Vilambit workspace
// stored per recording. Browser file handles and audio bytes never enter this
// file; sourceAssetId is the only binding between a workspace and media.json.

export const SOURCE_WORKSPACE_VERSION = 1;
export const SOURCE_WORKSPACE_KIND = 'sargam-source-workspace';
export const SOURCE_WORKSPACE_FILE = 'workspace.json';

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rounded(value, fallback = null) {
  const number = finite(value, fallback);
  return number == null ? null : Math.round(number * 1000) / 1000;
}

function second(value, fallback = 0) {
  return Math.max(0, rounded(value, fallback));
}

function percent(value, fallback = 100) {
  return Math.min(200, Math.max(25, Math.round(finite(value, fallback))));
}

function safeSourceId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return /^source-[a-z0-9._-]+$/i.test(id) ? id.toLowerCase() : null;
}

function normalizeLoop(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  let a = rounded(source.a);
  let b = rounded(source.b);
  if (a != null) a = Math.max(0, a);
  if (b != null) b = Math.max(0, b);
  if (a != null && b != null && b < a) [a, b] = [b, a];
  return {
    ...source,
    a,
    b,
    on: Boolean(source.on) && a != null && b != null,
  };
}

function normalizeMarkers(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((marker) => marker && typeof marker === 'object' && !Array.isArray(marker))
    .map((marker, index) => ({
      marker: {
        ...marker,
        t: second(marker.t),
        label: typeof marker.label === 'string' ? marker.label : '',
      },
      index,
    }))
    .sort((a, b) => a.marker.t - b.marker.t || a.index - b.index)
    .map(({ marker }) => marker);
}

function normalizeBpm(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const bpm = finite(value.bpm);
  const period = finite(value.period);
  const phaseAbs = rounded(value.phaseAbs);
  if (bpm == null || bpm <= 0 || period == null || period <= 0 || phaseAbs == null) return null;
  return {
    ...value,
    bpm: rounded(bpm),
    period: rounded(period),
    phaseAbs: Math.max(0, phaseAbs),
    confidence: Math.min(1, Math.max(0, rounded(value.confidence, 0))),
    ...(value.tapped != null ? { tapped: Boolean(value.tapped) } : {}),
  };
}

function normalizeSpeedRegions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((region) => region && typeof region === 'object' && !Array.isArray(region))
    .map((region) => {
      const start = second(region.start);
      const end = second(region.end);
      if (end <= start) return null;
      return { ...region, start, end, pct: percent(region.pct) };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function normalizeWaveformView(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  let start = second(source.start);
  let end = second(source.end);
  if (end < start) [start, end] = [end, start];
  return {
    ...source,
    start,
    end,
    followPlayhead: Boolean(source.followPlayhead),
  };
}

export function createEmptySourceWorkspace() {
  return {
    kind: SOURCE_WORKSPACE_KIND,
    version: SOURCE_WORKSPACE_VERSION,
    sources: {},
  };
}

export function normalizeSourceWorkspaceEntry(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ...source,
    lastPosition: second(source.lastPosition),
    loop: normalizeLoop(source.loop),
    tempoPercent: percent(source.tempoPercent),
    pitchSemitones: Math.min(12, Math.max(-12, Math.round(finite(source.pitchSemitones, 0)))),
    pitchCents: Math.min(100, Math.max(-100, Math.round(finite(source.pitchCents, 0)))),
    markers: normalizeMarkers(source.markers),
    bpm: normalizeBpm(source.bpm),
    speedRegions: normalizeSpeedRegions(source.speedRegions),
    waveformView: normalizeWaveformView(source.waveformView),
  };
}

export function normalizeSourceWorkspace(value = {}) {
  const problems = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { workspace: createEmptySourceWorkspace(), problems: ['source workspace must be an object'] };
  }
  if (value.version != null && value.version !== SOURCE_WORKSPACE_VERSION) {
    problems.push(`unsupported source workspace version: ${value.version}`);
  }
  if (value.kind != null && value.kind !== SOURCE_WORKSPACE_KIND) {
    problems.push(`unsupported source workspace kind: ${value.kind}`);
  }
  const sources = {};
  const rawSources = value.sources && typeof value.sources === 'object' && !Array.isArray(value.sources)
    ? value.sources
    : {};
  for (const [rawId, entry] of Object.entries(rawSources)) {
    const id = safeSourceId(rawId);
    if (!id) {
      problems.push(`source workspace has an invalid sourceAssetId: ${rawId}`);
      continue;
    }
    sources[id] = normalizeSourceWorkspaceEntry(entry);
  }
  return {
    workspace: {
      ...value,
      kind: SOURCE_WORKSPACE_KIND,
      version: SOURCE_WORKSPACE_VERSION,
      sources,
    },
    problems,
  };
}

export function parseSourceWorkspace(text) {
  if (text == null || String(text).trim() === '') {
    return { ok: true, workspace: createEmptySourceWorkspace(), problems: [] };
  }
  try {
    const normalized = normalizeSourceWorkspace(JSON.parse(String(text)));
    return { ok: normalized.problems.length === 0, ...normalized };
  } catch (error) {
    return {
      ok: false,
      workspace: createEmptySourceWorkspace(),
      problems: [`workspace.json is not valid JSON: ${error.message}`],
    };
  }
}

export function serializeSourceWorkspace(value) {
  const { workspace, problems } = normalizeSourceWorkspace(value);
  if (problems.some((problem) => problem.startsWith('unsupported source workspace'))) {
    throw new TypeError(problems[0]);
  }
  return `${JSON.stringify(workspace, null, 2)}\n`;
}

export function sourceWorkspaceEntry(workspace, sourceAssetId) {
  const id = safeSourceId(sourceAssetId);
  if (!id) return null;
  return normalizeSourceWorkspace(workspace).workspace.sources[id] || null;
}

export function upsertSourceWorkspaceEntry(workspace, sourceAssetId, entry) {
  const id = safeSourceId(sourceAssetId);
  if (!id) throw new TypeError('Source workspace requires a valid sourceAssetId.');
  const normalized = normalizeSourceWorkspace(workspace).workspace;
  return {
    ...normalized,
    sources: {
      ...normalized.sources,
      [id]: normalizeSourceWorkspaceEntry(entry),
    },
  };
}

export function sourceWorkspaceEntryFromPlayer(state = {}) {
  return normalizeSourceWorkspaceEntry({
    lastPosition: state.position,
    loop: state.loop,
    tempoPercent: state.speed,
    pitchSemitones: state.pitch?.semitones,
    pitchCents: state.pitch?.cents,
    markers: state.markers,
    bpm: state.bpm,
    speedRegions: state.speedRegions,
    waveformView: state.waveformView,
  });
}

