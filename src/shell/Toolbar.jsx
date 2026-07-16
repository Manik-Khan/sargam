// src/shell/Toolbar.jsx — the M2 file strip. Purely presentational:
// every action is injected from App.jsx; this file owns no file logic.
// Design locked 2026-07-16: wordmark · New Open Save Recent▾ · name + dot
// (filled = unsaved, hollow = saved).

import React, { useEffect, useRef, useState } from 'react';

export default function Toolbar({
  fileName,
  dirty,
  recents,
  onNew,
  onOpen,
  onSave,
  onOpenRecent,
  onRemoveRecent,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);

  return (
    <div className="app-header app-toolbar">
      <span className="app-wordmark">Sargam</span>
      <button className="tb-btn" onClick={onNew}>New</button>
      <button className="tb-btn" onClick={onOpen}>Open</button>
      <button className="tb-btn" onClick={onSave} title="Cmd+S">Save</button>
      <span className="tb-recent-wrap" ref={menuRef}>
        <button
          className="tb-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
        >
          Recent ▾
        </button>
        {menuOpen && (
          <div className="tb-menu" role="menu">
            {recents.length === 0 ? (
              <div className="tb-menu-empty">Nothing saved yet</div>
            ) : (
              recents.map((r) => (
                <div className="tb-menu-row" key={r.id}>
                  <button
                    className="tb-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenRecent(r);
                    }}
                    title="Restores the autosaved copy"
                  >
                    {r.title || r.name || r.id.slice(0, 8)}
                  </button>
                  <button
                    className="tb-menu-x"
                    aria-label={`Remove ${r.title || r.name || 'entry'} from recents`}
                    onClick={() => onRemoveRecent(r.id)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </span>
      <span className="tb-file">
        <span
          className={'tb-dot' + (dirty ? ' is-dirty' : '')}
          title={dirty ? 'Unsaved changes' : 'Saved'}
        />
        {fileName || 'untitled'}
      </span>
    </div>
  );
}
