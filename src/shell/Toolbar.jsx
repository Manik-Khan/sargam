import React, { useEffect, useRef, useState } from 'react';
import LibraryDrawer from './LibraryDrawer.jsx';
import QueueDrawer from './QueueDrawer.jsx';

export default function Toolbar({
  fileName,
  dirty,
  recents,
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
  view,
  onView,
  onOpenRecent,
  onRemoveRecent,
  sourceName,
  onOpenRecording,
  libraryItems = [],
  queuedLibraryIds = [],
  onLibraryPlay,
  onLibraryAdd,
  linkedPhraseItems = [],
  onLinkedPhrase,
  queueSession,
  queueLoopActive,
  onQueueMove,
  onQueueRemove,
  onQueueClear,
  onQueuePrevious,
  onQueueNext,
  onQueueRepeatMode,
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const sourcesRef = useRef(null);
  const libraryRef = useRef(null);
  const linkedRef = useRef(null);
  const queueRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return undefined;
    const close = (event) => {
      const activeRef = {
        sources: sourcesRef,
        library: libraryRef,
        linked: linkedRef,
        queue: queueRef,
        more: moreRef,
      }[openMenu];
      if (!activeRef?.current?.contains(event.target)) setOpenMenu(null);
    };
    const escape = (event) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [openMenu]);

  const toggleMenu = (name) => {
    setOpenMenu((current) => current === name ? null : name);
  };

  const run = (action) => {
    setOpenMenu(null);
    action?.();
  };

  return (
    <header className="workspace-topbar">
      <a className="workspace-wordmark" href="./" aria-label="Sargam home">
        <span className="workspace-wordmark-logo" aria-hidden="true">
          <img src="/aacm-logo-2015.jpg" alt="" />
        </span>
        <span>Sargam</span>
      </a>

      <nav className="workspace-primary-nav" aria-label="Workspace">
        <button
          type="button"
          className={view === 'notation' ? 'is-active' : ''}
          aria-current={view === 'notation' ? 'page' : undefined}
          onClick={() => onView('notation')}
        >
          Notation
        </button>
        <button
          type="button"
          className={view === 'vilambit' ? 'is-active' : ''}
          aria-current={view === 'vilambit' ? 'page' : undefined}
          onClick={() => onView('vilambit')}
        >
          Music
        </button>
        <button type="button" className={view === 'split' ? 'is-active' : ''}
          aria-current={view === 'split' ? 'page' : undefined} onClick={() => onView('split')}>Split view</button>
      </nav>

      <div className="workspace-top-actions">
        <div className="workspace-menu-wrap" ref={sourcesRef}>
          <button
            type="button"
            className={'workspace-menu-toggle' + (openMenu === 'sources' ? ' is-open' : '')}
            aria-expanded={openMenu === 'sources'}
            onClick={() => toggleMenu('sources')}
          >
            File <span aria-hidden="true">▾</span>
          </button>
          {openMenu === 'sources' && (
            <div className="workspace-drawer workspace-sources-drawer">
              <div className="workspace-drawer-heading">
                <div>
                  <span>Current project</span>
                  <strong>{projectName || fileName || 'Untitled notation'}</strong>
                </div>
                <button type="button" aria-label="Close file menu" onClick={() => setOpenMenu(null)}>×</button>
              </div>

              <section className="workspace-drawer-section">
                <span className="workspace-drawer-label">Notation</span>
                <p>
                  <strong>{fileName || 'Untitled notation'}</strong>
                  <span>{dirty ? 'Unsaved changes' : 'Saved locally'}</span>
                </p>
                <div className="workspace-drawer-actions">
                  <button type="button" onClick={() => run(onNew)}>New</button>
                  <button type="button" onClick={() => run(onOpen)}>Open</button>
                  <button type="button" onClick={() => run(onSave)}>Save</button>
                  <button type="button" onClick={() => run(onExport)}>Print / PDF</button>
                  <button type="button" onClick={() => run(onExportXML)}>MusicXML</button>
                </div>
              </section>

              <section className="workspace-drawer-section">
                <span className="workspace-drawer-label">Recording</span>
                <p>
                  <strong>{sourceName || 'No recording loaded'}</strong>
                  <span>Music remains on this device</span>
                </p>
                <button className="workspace-drawer-primary" type="button" onClick={() => run(onOpenRecording)}>
                  {sourceName ? 'Change recording' : 'Open recording'}
                </button>
                <button className="workspace-drawer-primary" type="button" onClick={() => run(() => onView('vilambit'))}>
                  Open Music
                </button>
              </section>

              <section className="workspace-drawer-section">
                <span className="workspace-drawer-label">Project folder</span>
                <p>
                  <strong>{projectName || 'No project folder open'}</strong>
                  <span>{clipCount} saved {clipCount === 1 ? 'clip' : 'clips'}</span>
                </p>
                <div className="workspace-drawer-actions">
                  <button type="button" disabled={!projectSupported} onClick={() => run(onNewProject)}>
                    New Project Folder…
                  </button>
                  <button type="button" disabled={!projectSupported} onClick={() => run(onOpenProject)}>
                    Open Project Folder…
                  </button>
                  <button type="button" disabled={!projectName} onClick={() => run(onSaveProject)}>
                    Save Project
                  </button>
                  <button type="button" disabled={!projectName} onClick={() => run(onClipVault)}>
                    Clip Vault
                  </button>
                  <button type="button" onClick={() => run(onOpenPortable)}>
                    Open Portable Project…
                  </button>
                  <button type="button" disabled={!projectName} onClick={() => run(onExportPortable)}>
                    Export Portable .sargam…
                  </button>
                </div>
              </section>

              {recents.length > 0 && (
                <section className="workspace-drawer-section">
                  <span className="workspace-drawer-label">Recent notation</span>
                  <div className="workspace-recent-list">
                    {recents.map((entry) => (
                      <div key={entry.id}>
                        <button
                          type="button"
                          onClick={() => run(() => onOpenRecent(entry))}
                          title="Restore the autosaved copy"
                        >
                          {entry.title || entry.name || entry.id.slice(0, 8)}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${entry.title || entry.name || 'entry'} from recents`}
                          onClick={() => onRemoveRecent(entry.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <div className="workspace-menu-wrap" ref={libraryRef}>
          <button
            type="button"
            className={'workspace-menu-toggle' + (openMenu === 'library' ? ' is-open' : '')}
            aria-expanded={openMenu === 'library'}
            onClick={() => toggleMenu('library')}
          >
            Library <span aria-hidden="true">▾</span>
          </button>
          {openMenu === 'library' && (
            <LibraryDrawer
              items={libraryItems}
              queuedLibraryIds={queuedLibraryIds}
              onPlay={onLibraryPlay}
              onAdd={onLibraryAdd}
              onOpenRecording={() => run(onOpenRecording)}
              onClose={() => setOpenMenu(null)}
            />
          )}
        </div>

        <div className="workspace-menu-wrap" ref={moreRef}>
          <button type="button" className="workspace-menu-toggle" aria-expanded={openMenu === 'more'}
            onClick={() => toggleMenu('more')}>More <span aria-hidden="true">▾</span></button>
          {openMenu === 'more' && <div className="workspace-drawer workspace-more-drawer">
            <button type="button" onClick={() => toggleMenu('linked')}>Linked phrases</button>
            <button type="button" onClick={() => toggleMenu('queue')}>Queue
              {queueSession?.upcoming?.length > 0 && <b className="workspace-queue-count">{queueSession.upcoming.length}</b>}
            </button>
            <p className="workspace-about">Ali Akbar College of Music<br /><em>Listen &amp; learn first. Then notate.</em></p>
          </div>}
        </div>

        <div className="workspace-menu-wrap" ref={linkedRef}>
          {openMenu === 'linked' && (
            <div className="workspace-drawer workspace-linked-drawer">
              <div className="workspace-drawer-heading">
                <div>
                  <span>Current composition</span>
                  <strong>Linked phrases</strong>
                </div>
                <button type="button" aria-label="Close linked phrases" onClick={() => setOpenMenu(null)}>×</button>
              </div>
              {linkedPhraseItems.length === 0 ? (
                <p className="workspace-drawer-empty">
                  Attach an A–B loop to a notation passage and it will appear here.
                </p>
              ) : (
                <div className="workspace-queue-list">
                  {linkedPhraseItems.map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      className={item.active ? 'is-active' : ''}
                      onClick={() => run(() => onLinkedPhrase?.(item.id))}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="workspace-menu-wrap" ref={queueRef}>
          {openMenu === 'queue' && (
            <QueueDrawer
              session={queueSession}
              loopActive={queueLoopActive}
              onMove={onQueueMove}
              onRemove={onQueueRemove}
              onClear={onQueueClear}
              onPrevious={onQueuePrevious}
              onNext={onQueueNext}
              onRepeatMode={onQueueRepeatMode}
              onClose={() => setOpenMenu(null)}
            />
          )}
        </div>

        <button
          type="button"
          className="workspace-open-recording"
          onClick={onOpenRecording}
          title={sourceName ? 'Choose another recording' : 'Choose a recording'}
        >
          {sourceName ? 'Change recording' : 'Open recording'}
        </button>
      </div>
    </header>
  );
}
