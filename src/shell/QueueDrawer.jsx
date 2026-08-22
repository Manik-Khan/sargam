import React from 'react';

export default function QueueDrawer({
  session,
  loopActive = false,
  onMove,
  onRemove,
  onClear,
  onPrevious,
  onNext,
  onRepeatMode,
  onClose,
}) {
  const current = session?.current || null;
  const upcoming = session?.upcoming || [];
  return (
    <div className="workspace-drawer workspace-queue-drawer">
      <div className="workspace-drawer-heading">
        <div>
          <span>This listening session</span>
          <strong>Queue</strong>
        </div>
        <button type="button" aria-label="Close Queue" onClick={onClose}>×</button>
      </div>
      <section className="workspace-queue-current">
        <span className="workspace-drawer-label">Now playing</span>
        <strong>{current?.title || 'No current recording'}</strong>
        <small>{current?.detail || (current ? current.libraryId : 'Choose a recording from Library or open a local file.')}</small>
      </section>
      <div className="workspace-queue-controls">
        <button type="button" disabled={!session?.history?.length} onClick={onPrevious}>Previous</button>
        <button type="button" disabled={!upcoming.length} onClick={onNext}>Next</button>
        <label>
          <span>Repeat</span>
          <select value={session?.repeatMode || 'off'} onChange={(event) => onRepeatMode?.(event.target.value)}>
            <option value="off">Off</option>
            <option value="track">Track</option>
            <option value="queue">Queue</option>
          </select>
        </label>
        <button type="button" disabled={!upcoming.length} onClick={onClear}>Clear</button>
      </div>
      {loopActive && (
        <p className="workspace-queue-loop-policy">
          A–B loop is holding automatic advance. Next exits the loop and advances explicitly.
        </p>
      )}
      <span className="workspace-queue-up-next">Up next</span>
      {upcoming.length === 0 ? (
        <p className="workspace-drawer-empty">Nothing is queued. Add from Library without interrupting the current recording.</p>
      ) : (
        <div className="workspace-session-queue-list">
          {upcoming.map((item, index) => (
            <article key={item.queueId}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><strong>{item.title}</strong><small>{item.detail || item.libraryId}</small></div>
              <div>
                <button type="button" disabled={index === 0} aria-label={`Move ${item.title} up`} onClick={() => onMove?.(item.queueId, index - 1)}>↑</button>
                <button type="button" disabled={index === upcoming.length - 1} aria-label={`Move ${item.title} down`} onClick={() => onMove?.(item.queueId, index + 1)}>↓</button>
                <button type="button" aria-label={`Remove ${item.title}`} onClick={() => onRemove?.(item.queueId)}>×</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
