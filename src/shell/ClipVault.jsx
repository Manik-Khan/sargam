// src/shell/ClipVault.jsx — compact Phase 3B inventory for extracted project
// audio. It reports what is stored, referenced, missing, or safe to remove.
import React, { useMemo } from 'react';
import { formatVilambitTime } from './vilambit-bridge.js';

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

export default function ClipVault({ project, manifest, links = [], presence = {}, onClose, onDeleteUnused, onEditClip }) {
  const used = useMemo(() => new Set(links.map((link) => link.clipAssetId).filter(Boolean)), [links]);
  const sources = useMemo(() => new Map((manifest.sources || []).map((source) => [source.id, source])), [manifest]);
  const clips = manifest.clips || [];
  const bytes = clips.reduce((sum, clip) => sum + (Number(clip.bytes) || 0), 0);
  const unused = clips.filter((clip) => !used.has(clip.id));
  const missing = clips.filter((clip) => presence[clip.id] === false);

  return (
    <div className="project-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="project-modal clip-vault" role="dialog" aria-modal="true" aria-labelledby="clip-vault-title">
        <header className="project-modal-head">
          <div>
            <span className="project-modal-kicker">{project?.name || 'Project Folder'}</span>
            <h2 id="clip-vault-title">Clip Vault</h2>
          </div>
          <button type="button" aria-label="Close Clip Vault" onClick={onClose}>×</button>
        </header>
        <div className="clip-vault-summary">
          <strong>{clips.length} clip{clips.length === 1 ? '' : 's'}</strong>
          <span>{formatBytes(bytes)}</span>
          <span>{missing.length} missing</span>
          <span>{unused.length} unused</span>
        </div>
        {clips.length === 0 ? (
          <p className="clip-vault-empty">Attach a Vilambit loop, open a project folder, then choose Extract Clip.</p>
        ) : (
          <div className="clip-vault-list">
            {clips.map((clip) => {
              const source = sources.get(clip.sourceAssetId);
              const isUsed = used.has(clip.id);
              const isMissing = presence[clip.id] === false;
              return (
                <article className="clip-vault-row" key={clip.id}>
                  <div>
                    <strong>{clip.id}</strong>
                    <span>{source?.name || clip.sourceAssetId}</span>
                  </div>
                  <span title={`Master ${formatVilambitTime(clip.startTime)}–${formatVilambitTime(clip.endTime)}`}>
                    {clip.loopStart != null && clip.loopEnd != null
                      ? `Loop ${Number(clip.loopStart).toFixed(2)}–${Number(clip.loopEnd).toFixed(2)}s`
                      : `${formatVilambitTime(clip.startTime)}–${formatVilambitTime(clip.endTime)}`}
                  </span>
                  <span>{formatBytes(clip.bytes)}</span>
                  <span className={isMissing ? 'is-missing' : isUsed ? 'is-used' : 'is-unused'}>
                    {isMissing ? 'Missing' : isUsed ? 'Linked' : 'Unused'}
                  </span>
                  <button type="button" disabled={isMissing} onClick={() => onEditClip?.(clip)}>Edit Loop</button>
                </article>
              );
            })}
          </div>
        )}
        <footer className="project-modal-actions">
          <button type="button" disabled={!unused.length} onClick={() => onDeleteUnused?.(unused)}>
            Delete Unused
          </button>
          <button type="button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}
