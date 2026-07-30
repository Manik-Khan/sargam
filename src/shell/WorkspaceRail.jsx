import React, { useRef } from 'react';

function displayRaga(value) {
  const name = String(value || '').replace(/^Raga\s+/i, '').trim();
  return name || 'Untitled';
}

export default function WorkspaceRail({ view, raga, onView }) {
  const drag = useRef(null);
  const ignoreNotationClick = useRef(false);

  const beginNotationDrag = (event) => {
    drag.current = { pointerId: event.pointerId, startX: event.clientX };
    ignoreNotationClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveNotationDrag = (event) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    if (event.clientX - drag.current.startX < 28) return;
    ignoreNotationClick.current = true;
    onView('split');
  };

  const endNotationDrag = (event) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    drag.current = null;
  };

  const openNotation = () => {
    if (ignoreNotationClick.current) {
      ignoreNotationClick.current = false;
      return;
    }
    onView('notation');
  };

  return (
    <aside className="workspace-rail" aria-label="Project surfaces">
      <div className="workspace-rail-intro">
        <span className="workspace-rail-number">Views</span>
        <span className="workspace-rail-title">Ali Akbar College of Music</span>
        <span className="workspace-rail-detail">{displayRaga(raga)}</span>
      </div>
      <button
        type="button"
        className={'workspace-rail-tab workspace-rail-notation'
          + (view === 'notation' || view === 'split' ? ' is-active' : '')}
        aria-current={view === 'notation' ? 'page' : undefined}
        aria-expanded={view === 'split'}
        title="Click for notation only, or drag right to open notation beside Music"
        onClick={openNotation}
        onPointerDown={beginNotationDrag}
        onPointerMove={moveNotationDrag}
        onPointerUp={endNotationDrag}
        onPointerCancel={endNotationDrag}
      >
        <span className="workspace-rail-number">01</span>
        <span className="workspace-rail-tab-title">Notation</span>
        <span className="workspace-rail-detail">Click or drag</span>
      </button>
      <button
        type="button"
        className={'workspace-rail-tab workspace-rail-music'
          + (view === 'vilambit' || view === 'split' ? ' is-active' : '')}
        aria-current={view === 'vilambit' ? 'page' : undefined}
        title="Open Music only"
        onClick={() => onView('vilambit')}
      >
        <span className="workspace-rail-number">02</span>
        <span className="workspace-rail-tab-title">Music</span>
        <span className="workspace-rail-detail">Listening</span>
      </button>
    </aside>
  );
}
