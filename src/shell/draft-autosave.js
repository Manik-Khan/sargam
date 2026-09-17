// Debounced local draft protection, with injected timers for deterministic checks.
export function createDraftAutosave(store, {
  onFailure = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = 500,
} = {}) {
  let timer = null;
  let pending = null;
  const flush = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (pending === null) return true;
    let saved = false;
    try { saved = store.saveCurrent(pending) === true; } catch { /* report below */ }
    if (saved) pending = null;
    else onFailure();
    return saved;
  };
  return {
    schedule(text) {
      pending = String(text ?? '');
      if (timer !== null) clearTimer(timer);
      timer = setTimer(flush, delay);
    },
    flush,
  };
}
