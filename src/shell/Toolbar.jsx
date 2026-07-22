// src/shell/Toolbar.jsx — the M2 file strip. Purely presentational:
// every action is injected from App.jsx; this file owns no file logic.
// Design locked 2026-07-16: wordmark · New Open Save Recent▾ · name + dot
// (filled = unsaved, hollow = saved).

import React, { useEffect, useRef, useState } from 'react';

export default function Toolbar({
  fileName,
  dirty,
  recents,
  layout,
  onNew,
  onOpen,
  onSave,
  projectName,
  projectSupported,
  clipCount = 0,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onClipVault,
  onOpenPortable,
  onExportPortable,
  onExport,
  onExportXML,
  noteNames,
  onToggleNoteNames,
  onDictate,
  onLegend,
  view,
  onView,
  onToggleLayout,
  onOpenRecent,
  onRemoveRecent,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const projectMenuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen && !projectMenuOpen) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target)) setProjectMenuOpen(false);
    };
    const esc = (e) => {
      if (e.key === 'Escape') { setMenuOpen(false); setProjectMenuOpen(false); }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menuOpen, projectMenuOpen]);

  return (
    <div className="app-header app-toolbar">
      <span className="app-wordmark">Sargam</span>
      <button className="tb-btn" onClick={onNew}>New</button>
      <button className="tb-btn" onClick={onOpen}>Open</button>
      <button className="tb-btn" onClick={onSave} title="Cmd+S">Save</button>
      <span className="tb-recent-wrap" ref={projectMenuRef}>
        <button
          className={'tb-btn' + (projectName ? ' tb-on' : '')}
          onClick={() => setProjectMenuOpen((value) => !value)}
          aria-expanded={projectMenuOpen}
          title={projectName ? `Project folder: ${projectName}` : 'Local project folder and extracted clips'}
        >
          Project ▾
        </button>
        {projectMenuOpen && (
          <div className="tb-menu" role="menu">
            {!projectSupported && (
              <div className="tb-menu-empty">Project folders require a browser with directory access.</div>
            )}
            <button className="tb-menu-item" disabled={!projectSupported} onClick={() => { setProjectMenuOpen(false); onNewProject?.(); }}>
              New Project Folder…
            </button>
            <button className="tb-menu-item" disabled={!projectSupported} onClick={() => { setProjectMenuOpen(false); onOpenProject?.(); }}>
              Open Project Folder…
            </button>
            <button className="tb-menu-item" disabled={!projectName} onClick={() => { setProjectMenuOpen(false); onSaveProject?.(); }}>
              Save Project
            </button>
            <button className="tb-menu-item" disabled={!projectName} onClick={() => { setProjectMenuOpen(false); onClipVault?.(); }}>
              Clip Vault ({clipCount})
            </button>
            <div className="tb-menu-separator" role="separator" />
            <button className="tb-menu-item" onClick={() => { setProjectMenuOpen(false); onOpenPortable?.(); }}>
              Open Portable Project…
            </button>
            <button className="tb-menu-item" disabled={!projectName} onClick={() => { setProjectMenuOpen(false); onExportPortable?.(); }}>
              Export Portable .sargam…
            </button>
          </div>
        )}
      </span>
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
      <button className="tb-btn" onClick={onExport}>Export</button>
      <button className="tb-btn" onClick={onExportXML} title="MusicXML — opens in MuseScore, Sibelius, Dorico, Finale">
        Staff ↗
      </button>
      <button
        className="tb-btn tb-icon"
        onClick={onToggleLayout}
        aria-label={
          layout === 'stacked'
            ? 'Layout: notation on top — switch to side by side'
            : 'Layout: side by side — switch to notation on top'
        }
        title={layout === 'stacked' ? 'Notation on top' : 'Side by side'}
      >
        {layout === 'stacked' ? '\u2B13' : '\u25EB'}
      </button>
      <button
        className={'tb-btn' + (noteNames === 'western' ? ' tb-on' : '')}
        onClick={onToggleNoteNames}
        title={noteNames === 'western' ? 'Showing C D E — click for sargam' : 'Showing S R G — click for C D E'}
      >
        {noteNames === 'western' ? 'CDE' : 'SRG'}
      </button>
      <button className="tb-btn" onClick={onDictate} title="Type or say sargam syllables">
        Dictate
      </button>
      <button className="tb-btn" onClick={onLegend} title="What every command means">
        Key
      </button>
      <span className="tb-tabs" role="tablist" aria-label="Workspace">
        {[
          ['notation', 'Notation'],
          ['vilambit', 'Vilambit'],
        ].map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={'tb-btn' + (view === v ? ' tb-on' : '')}
            onClick={() => onView(v)}
            title={v === 'vilambit' ? 'Loop a recording and notate — audio keeps playing on the other tab' : 'The notation editor'}
          >
            {label}
          </button>
        ))}
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
