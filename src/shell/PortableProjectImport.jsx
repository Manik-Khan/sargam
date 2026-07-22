import React from 'react';

function bytesLabel(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function PortableProjectImport({ pending, importing = false, supportsDirectory = true, onImport, onClose }) {
  if (!pending) return null;
  const clipCount = pending.packageData?.media?.clips?.length || 0;
  const extraCount = pending.packageData?.manifest?.portable?.extraFiles?.length || 0;
  return (
    <div className="project-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !importing) onClose?.();
    }}>
      <section className="project-modal portable-import-modal" role="dialog" aria-modal="true" aria-labelledby="portable-import-title">
        <div className="project-modal-head">
          <div>
            <div className="project-modal-kicker">Portable Sargam Project</div>
            <h2 id="portable-import-title">{pending.packageData.manifest.name}</h2>
          </div>
          <button onClick={onClose} disabled={importing} aria-label="Close portable project import">×</button>
        </div>
        <div className="portable-import-body">
          <p>
            <strong>{pending.fileName}</strong> contains editable notation and {clipCount} included
            clip{clipCount === 1 ? '' : 's'} ({bytesLabel(pending.fileSize)} total).
          </p>
          <p>
            {supportsDirectory
              ? 'Import creates a new independent project. Choose an empty destination folder; the original package and its source recording remain untouched.'
              : 'This browser cannot choose a project folder, so Sargam will open an independent temporary project. Export a new .sargam copy before closing or refreshing.'}
          </p>
          {extraCount > 0 && (
            <p className="portable-import-note">
              {extraCount} safe future project file{extraCount === 1 ? '' : 's'} will be preserved.
            </p>
          )}
          {pending.packageData.warnings?.length > 0 && (
            <div className="portable-import-warnings">
              <strong>Package notes</strong>
              <ul>{pending.packageData.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="project-modal-actions">
          <button onClick={onClose} disabled={importing}>Cancel</button>
          <button className="is-primary" onClick={onImport} disabled={importing}>
            {importing ? 'Importing…' : supportsDirectory ? 'Choose Destination Folder…' : 'Open Temporary Project'}
          </button>
        </div>
      </section>
    </div>
  );
}
