// Pure catalog adapter for project media and future FileMaker/archive records.
// A stable record id is mandatory; filenames and raw filesystem paths are not
// accepted as durable identity or remotely loadable media.

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeId(value) {
  const id = text(value);
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id) ? id : null;
}

function duration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1000) / 1000 : null;
}

function controlledUrl(value, baseUrl, label) {
  const raw = text(value);
  if (!raw) return { url: null, problem: null };
  try {
    const base = new URL(baseUrl);
    const url = new URL(raw, base);
    if (!/^https?:$/.test(url.protocol)) {
      return { url: null, problem: `${label} must use HTTP or HTTPS.` };
    }
    if (url.origin !== base.origin) {
      return { url: null, problem: `${label} must come from the same archive host.` };
    }
    return { url: url.href, problem: null };
  } catch {
    return { url: null, problem: `${label} is not a valid controlled URL.` };
  }
}

export function normalizeLibraryRecord(value = {}, { baseUrl, currentId = null } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const libraryId = safeId(source.libraryId ?? source.id);
  if (!libraryId) {
    return { ok: false, problem: 'Library records require a stable record id; filename alone is not identity.' };
  }
  const name = text(source.name ?? source.title);
  if (!name) return { ok: false, problem: `Library record ${libraryId} requires a name.` };
  const isCurrent = libraryId === currentId;
  const mediaUrl = controlledUrl(source.sourceUrl ?? source.url, baseUrl, 'Library media');
  const eqUrl = controlledUrl(source.eqProfilesUrl, baseUrl, 'Archive EQ manifest');
  const reopenable = Boolean(mediaUrl.url);
  const problem = mediaUrl.problem || eqUrl.problem || (!reopenable
    ? 'Reconnect this recording before it can be queued or reopened.'
    : null);
  const item = {
    libraryId,
    workspaceSourceId: safeId(source.workspaceSourceId) || libraryId,
    name,
    kind: source.kind === 'video' ? 'video' : 'audio',
    duration: duration(source.duration),
    current: isCurrent,
    reopenable,
    available: reopenable || isCurrent,
    ...(mediaUrl.url ? { sourceUrl: mediaUrl.url } : {}),
    ...(eqUrl.url ? { eqProfilesUrl: eqUrl.url } : {}),
    ...(problem ? { problem } : {}),
  };
  return { ok: true, item };
}

export function buildLibraryCatalog(records, { baseUrl, current = null } = {}) {
  const currentId = safeId(current?.libraryId ?? current?.id);
  const combined = Array.isArray(records) ? [...records] : [];
  if (currentId && !combined.some((record) => safeId(record?.libraryId ?? record?.id) === currentId)) {
    combined.unshift({ ...current, id: currentId });
  }
  const catalog = [];
  for (const record of combined) {
    const normalized = normalizeLibraryRecord(record, { baseUrl, currentId });
    if (!normalized.ok) continue;
    const existing = catalog.findIndex((item) => item.libraryId === normalized.item.libraryId);
    if (existing >= 0) catalog[existing] = normalized.item;
    else catalog.push(normalized.item);
  }
  return catalog.sort((a, b) => Number(b.current) - Number(a.current));
}

export function libraryQueueItem(value = {}) {
  const libraryId = safeId(value.libraryId ?? value.id);
  if (!libraryId) throw new TypeError('A stable libraryId is required to queue a recording.');
  return {
    libraryId,
    workspaceSourceId: safeId(value.workspaceSourceId) || libraryId,
    title: text(value.name ?? value.title, libraryId),
    kind: value.kind === 'video' ? 'video' : 'audio',
    ...(duration(value.duration) != null ? { duration: duration(value.duration) } : {}),
    ...(text(value.sourceUrl) ? { sourceUrl: text(value.sourceUrl) } : {}),
    ...(text(value.eqProfilesUrl) ? { eqProfilesUrl: text(value.eqProfilesUrl) } : {}),
    available: Boolean(value.reopenable && value.sourceUrl),
    detail: value.reopenable ? 'Archive source' : 'Needs reconnection',
  };
}
