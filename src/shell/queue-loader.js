// A Queue transition is committed only after the requested source is playable
// and its workspace has been acknowledged. Unrelated/late snapshots cannot
// complete another request. The previous session survives load failure.
export function rebaseQueueTransition(before, after, current) {
  const original = new Set(before.upcoming.map(item => item.queueId));
  const remaining = new Set(after.upcoming.map(item => item.queueId));
  const removed = new Set([...original].filter(id => !remaining.has(id)));
  const added = after.upcoming.filter(item => !original.has(item.queueId));
  return { ...after, repeatMode: current.repeatMode, nextId: Math.max(after.nextId, current.nextId),
    upcoming: [...added, ...current.upcoming.filter(item => !removed.has(item.queueId) && !added.some(a => a.queueId === item.queueId))] };
}

export function createQueueLoader({ send, commit, workspace, onError, restored = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = 30000 }) {
  let pending = null;
  let failedRequestId = null;
  const cancel = message => {
    if (!pending) return;
    if (message) failedRequestId = pending.requestId;
    clearTimer(pending.timer);
    pending = null;
    if (message) onError(message);
  };
  const transmit = (type, payload) => { try { return send(type, payload); } catch { return false; } };
  return {
    get pending() { return Boolean(pending); },
    blocksSync(state) { return Boolean(pending || (failedRequestId && state.loadRequestId === failedRequestId)); },
    cancel,
    start(before, result, requestId) {
      if (pending) { onError('The next recording is still loading. Please wait or choose a local recording.'); return; }
      const item = result.effect.item;
      if (!item?.available || !item.sourceUrl) { onError('This recording needs reconnection before it can play.'); return; }
      failedRequestId = null;
      pending = { before, result, requestId, phase: 'load', timer: setTimer(() => cancel('The recording did not become ready. Queue was preserved; try again.'), timeoutMs) };
      if (!transmit('load-library-source', { id: item.libraryId, name: item.title, url: item.sourceUrl, eqProfilesUrl: item.eqProfilesUrl, requestId })) {
        cancel('Sargam Music is not ready to load that recording. Queue was preserved.');
      }
    },
    observe(state) {
      const request = pending;
      if (!request || state.loadRequestId !== request.requestId) return;
      if (state.error) { cancel(`Recording could not load: ${state.error}. Queue was preserved.`); return; }
      if (state.source?.id !== request.result.effect.item.libraryId || !state.readyForPlayback || state.duration <= 0) return;
      if (request.phase === 'load') {
        request.phase = 'restore';
        if (!transmit('apply-workspace', { ...(workspace(state.source.id, request.result.effect.item) || {}), sourceId: state.source.id, requestId: request.requestId })) {
          cancel('The recording settings could not be restored. Queue was preserved.');
        }
      } else if (state.workspaceRequestId === request.requestId) {
        cancel();
        restored(state);
        commit(request.before, request.result.session);
        if (!transmit('play', { sourceId: state.source.id, requestId: request.requestId })) onError('The recording is ready, but Play could not be sent. Press Play to retry.');
      }
    },
  };
}
