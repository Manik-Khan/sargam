// Pure, transient listening-session queue. This state is intentionally not a
// project playlist: it owns the current item, ordered upcoming items, history,
// and repeat behavior for one listening session only.

export const QUEUE_REPEAT_MODES = Object.freeze(['off', 'track', 'queue']);

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeLibraryId(value) {
  const id = text(value);
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id) ? id : null;
}

function safeQueueId(value) {
  const id = text(value);
  return /^queue-[a-z0-9._-]+$/i.test(id) ? id.toLowerCase() : null;
}

function positive(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1000) / 1000 : fallback;
}

export function normalizeQueueItem(value = {}, queueId = null) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const libraryId = safeLibraryId(source.libraryId ?? source.id);
  if (!libraryId) throw new TypeError('Queue items require a stable libraryId.');
  const normalized = {
    queueId: safeQueueId(queueId ?? source.queueId),
    libraryId,
    title: text(source.title ?? source.name, libraryId),
    kind: source.kind === 'video' ? 'video' : 'audio',
    available: source.available !== false,
  };
  const duration = positive(source.duration);
  if (duration != null) normalized.duration = duration;
  const sourceUrl = text(source.sourceUrl ?? source.url);
  if (sourceUrl) normalized.sourceUrl = sourceUrl;
  const eqProfilesUrl = text(source.eqProfilesUrl);
  if (eqProfilesUrl) normalized.eqProfilesUrl = eqProfilesUrl;
  const workspaceSourceId = safeLibraryId(source.workspaceSourceId);
  if (workspaceSourceId) normalized.workspaceSourceId = workspaceSourceId;
  const detail = text(source.detail);
  if (detail) normalized.detail = detail;
  return normalized;
}

function hydrateSession(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  let nextId = Math.max(1, Math.trunc(Number(source.nextId) || 1));
  const seen = new Set();
  const hydrateItem = (item) => {
    let queueId = safeQueueId(item?.queueId);
    if (!queueId || seen.has(queueId)) {
      do queueId = `queue-${nextId++}`; while (seen.has(queueId));
    }
    seen.add(queueId);
    const numeric = Number(queueId.match(/^queue-(\d+)$/)?.[1]);
    if (Number.isInteger(numeric) && numeric >= nextId) nextId = numeric + 1;
    return normalizeQueueItem(item, queueId);
  };
  const current = source.current ? hydrateItem(source.current) : null;
  const upcoming = Array.isArray(source.upcoming) ? source.upcoming.map(hydrateItem) : [];
  const history = Array.isArray(source.history) ? source.history.map(hydrateItem) : [];
  return {
    version: 1,
    current,
    upcoming,
    history,
    repeatMode: QUEUE_REPEAT_MODES.includes(source.repeatMode) ? source.repeatMode : 'off',
    nextId,
  };
}

export function createQueueSession(value = {}) {
  return hydrateSession(value);
}

function withNewItem(session, value) {
  const queueId = `queue-${session.nextId}`;
  return {
    item: normalizeQueueItem(value, queueId),
    nextId: session.nextId + 1,
  };
}

export function addQueueItem(value, item) {
  const session = hydrateSession(value);
  const created = withNewItem(session, item);
  return {
    ...session,
    nextId: created.nextId,
    upcoming: [...session.upcoming, created.item],
  };
}

export function moveQueueItem(value, queueId, toIndex) {
  const session = hydrateSession(value);
  const from = session.upcoming.findIndex((item) => item.queueId === queueId);
  if (from < 0 || session.upcoming.length < 2) return session;
  const target = Math.min(session.upcoming.length - 1, Math.max(0, Math.trunc(Number(toIndex) || 0)));
  if (from === target) return session;
  const upcoming = [...session.upcoming];
  const [item] = upcoming.splice(from, 1);
  upcoming.splice(target, 0, item);
  return { ...session, upcoming };
}

export function removeQueueItem(value, queueId) {
  const session = hydrateSession(value);
  return {
    ...session,
    upcoming: session.upcoming.filter((item) => item.queueId !== queueId),
  };
}

export function clearQueue(value) {
  const session = hydrateSession(value);
  return { ...session, upcoming: [] };
}

export function setQueueRepeatMode(value, repeatMode) {
  const session = hydrateSession(value);
  return {
    ...session,
    repeatMode: QUEUE_REPEAT_MODES.includes(repeatMode) ? repeatMode : 'off',
  };
}

export function playQueueItem(value, itemOrQueueId) {
  const session = hydrateSession(value);
  let selected = null;
  let selectedIndex = -1;
  if (typeof itemOrQueueId === 'string') {
    selectedIndex = session.upcoming.findIndex((item) => item.queueId === itemOrQueueId);
    selected = session.upcoming[selectedIndex] || null;
  } else if (itemOrQueueId) {
    const requested = normalizeQueueItem(itemOrQueueId);
    selectedIndex = session.upcoming.findIndex((item) =>
      item.queueId === requested.queueId || item.libraryId === requested.libraryId
    );
    selected = selectedIndex >= 0 ? session.upcoming[selectedIndex] : null;
    if (!selected) {
      const created = withNewItem(session, requested);
      selected = created.item;
      session.nextId = created.nextId;
    }
  }
  if (!selected) return { session, effect: { type: 'none' } };
  if (session.current?.libraryId === selected.libraryId) {
    return { session, effect: { type: 'play', item: session.current } };
  }
  const upcoming = [...session.upcoming];
  if (selectedIndex >= 0) upcoming.splice(selectedIndex, 1);
  return {
    session: {
      ...session,
      current: selected,
      upcoming,
      history: session.current ? [...session.history, session.current] : session.history,
    },
    effect: { type: 'load', item: selected },
  };
}

export function advanceQueue(value, { reason = 'manual', loopActive = false } = {}) {
  const session = hydrateSession(value);
  if (reason === 'ended' && loopActive) {
    return { session, effect: { type: 'blocked', reason: 'loop' } };
  }
  if (reason === 'ended' && session.repeatMode === 'track' && session.current) {
    return { session, effect: { type: 'restart', item: session.current } };
  }
  if (session.upcoming.length > 0) {
    const [next, ...upcoming] = session.upcoming;
    return {
      session: {
        ...session,
        current: next,
        upcoming,
        history: session.current ? [...session.history, session.current] : session.history,
      },
      effect: { type: 'load', item: next },
    };
  }
  if (session.repeatMode === 'queue' && session.current) {
    const cycle = [...session.history, session.current];
    if (cycle.length === 1) {
      return { session, effect: { type: 'restart', item: session.current } };
    }
    const [next, ...upcoming] = cycle;
    return {
      session: { ...session, current: next, upcoming, history: [] },
      effect: { type: 'load', item: next },
    };
  }
  return { session, effect: { type: 'stop', item: session.current } };
}

export function previousQueueItem(value) {
  const session = hydrateSession(value);
  if (session.history.length === 0) return { session, effect: { type: 'none' } };
  const history = [...session.history];
  const previous = history.pop();
  return {
    session: {
      ...session,
      current: previous,
      history,
      upcoming: session.current ? [session.current, ...session.upcoming] : session.upcoming,
    },
    effect: { type: 'load', item: previous },
  };
}
