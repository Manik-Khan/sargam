import React, { useMemo, useState } from 'react';

function durationLabel(value) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  if (!total) return 'Duration unavailable';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function LibraryDrawer({
  items = [],
  queuedLibraryIds = [],
  onPlay,
  onAdd,
  onOpenRecording,
  onClose,
}) {
  const [query, setQuery] = useState('');
  const queued = useMemo(() => new Set(queuedLibraryIds), [queuedLibraryIds]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.name} ${item.libraryId}`.toLowerCase().includes(needle)
    );
  }, [items, query]);

  return (
    <div className="workspace-drawer workspace-library-drawer">
      <div className="workspace-drawer-heading">
        <div>
          <span>Durable catalog</span>
          <strong>Library</strong>
        </div>
        <button type="button" aria-label="Close Library" onClick={onClose}>×</button>
      </div>
      <div className="workspace-library-search">
        <label htmlFor="workspace-library-search">Find a recording</label>
        <input
          id="workspace-library-search"
          type="search"
          value={query}
          placeholder="Name or archive ID"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <div className="workspace-library-empty">
          <p>{items.length ? 'No Library recordings match that search.' : 'No catalog recordings are attached to this project yet.'}</p>
          <button type="button" onClick={onOpenRecording}>Open a local recording…</button>
        </div>
      ) : (
        <div className="workspace-library-list">
          {filtered.map((item, index) => {
            const isQueued = queued.has(item.libraryId);
            const canReopen = item.reopenable && item.sourceUrl;
            return (
              <article key={item.libraryId} className={item.current ? 'is-current' : ''}>
                <span className="workspace-library-index">{String(index + 1).padStart(2, '0')}</span>
                <div className="workspace-library-copy">
                  <strong>{item.name}</strong>
                  <small>{item.libraryId} · {durationLabel(item.duration)}</small>
                  {!canReopen && <em>{item.current ? 'Playing locally · reconnect before queueing' : item.problem}</em>}
                </div>
                <div className="workspace-library-actions">
                  <button
                    type="button"
                    disabled={!canReopen && !item.current}
                    onClick={() => onPlay?.(item)}
                  >
                    {item.current ? 'Current' : 'Play'}
                  </button>
                  <button
                    type="button"
                    disabled={!canReopen || isQueued}
                    onClick={() => onAdd?.(item)}
                  >
                    {isQueued ? 'Queued' : 'Add next'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="workspace-library-footer">
        FileMaker/archive remains authoritative. Library records load only by stable ID and controlled same-origin URL.
      </div>
    </div>
  );
}
