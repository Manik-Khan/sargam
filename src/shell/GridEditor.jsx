// src/shell/GridEditor.jsx — direct graph-paper notation writing. Each input
// is one matra; valid edits immediately replace only that Markdown music line.

import React, { useMemo, useState } from 'react';
import {
  appendGridCellToken,
  gridLines,
  replaceGridCellToken,
} from '../engine/grid-edit.js';

function withoutKey(object, key) {
  const next = { ...object };
  delete next[key];
  return next;
}

export default function GridEditor({ text, doc, onChange, onCellFocus }) {
  const rows = useMemo(() => gridLines(doc), [doc]);
  const [drafts, setDrafts] = useState({});
  const [errors, setErrors] = useState({});
  const [addDrafts, setAddDrafts] = useState({});
  const [message, setMessage] = useState('Each box is one matra. Spaces inside a box become subdivisions.');

  const editCell = (row, cell, value) => {
    const key = `${row.sourceLine}:${cell.matraIndex}`;
    setDrafts((current) => ({ ...current, [key]: value }));
    onCellFocus?.(row.sourceLine, cell.matraIndex);
    const result = replaceGridCellToken(text, row.sourceLine, cell.matraIndex, value);
    if (!result.ok) {
      setErrors((current) => ({ ...current, [key]: result.message }));
      setMessage(result.message);
      return;
    }
    setErrors((current) => withoutKey(current, key));
    setMessage(`Updated source line ${row.sourceLine}, matra ${cell.matraIndex + 1}.`);
    onChange?.(result.text);
  };

  const finishCell = (row, cell, key) => {
    const value = Object.hasOwn(drafts, key) ? drafts[key] : cell.text;
    const result = replaceGridCellToken(text, row.sourceLine, cell.matraIndex, value);
    if (!result.ok) {
      setErrors((current) => ({ ...current, [key]: result.message }));
      setMessage(result.message);
      return false;
    }
    setDrafts((current) => withoutKey(current, key));
    setErrors((current) => withoutKey(current, key));
    if (result.text !== text) onChange?.(result.text);
    return true;
  };

  const addCell = (row) => {
    const key = String(row.sourceLine);
    const value = addDrafts[key] || '';
    const result = appendGridCellToken(text, row.sourceLine, value);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setAddDrafts((current) => withoutKey(current, key));
    setMessage(`Added one matra to source line ${row.sourceLine}.`);
    onChange?.(result.text);
  };

  if (!rows.length) {
    return (
      <div className="app-grid-writer app-grid-writer-empty">
        Add a notation line in Text Write first, then return here to write it by matra.
      </div>
    );
  }

  let previousSection = Symbol('first');
  return (
    <div className="app-grid-writer" aria-label="Grid Write notation editor">
      <div className="app-grid-writer-help">
        <strong>Grid Write</strong>
        <span>One box = one matra · type <code>SR</code> for an even cluster · <code>S R</code> for visible slots · <code>-</code> hold · <code>.</code> rest</span>
      </div>
      <div className="app-grid-writer-scroll">
        {rows.map((row) => {
          const showSection = row.sectionLabel !== previousSection;
          previousSection = row.sectionLabel;
          return (
            <React.Fragment key={`line-${row.sourceLine}`}>
              {showSection && row.sectionLabel && (
                <div className="app-grid-writer-section">{row.sectionLabel}</div>
              )}
              <div className="app-grid-writer-line" data-source-line={row.sourceLine}>
                <div className="app-grid-writer-line-label">
                  <span>Line {row.sourceLine}</span>
                  {row.tal && <small>{row.tal.name}</small>}
                </div>
                <div className="app-grid-writer-cells" role="group" aria-label={`Source line ${row.sourceLine} matras`}>
                  {row.cells.map((cell) => {
                    const key = `${row.sourceLine}:${cell.matraIndex}`;
                    const value = Object.hasOwn(drafts, key) ? drafts[key] : cell.text;
                    const error = errors[key] || '';
                    return (
                      <label
                        className={`app-grid-write-cell${error ? ' is-invalid' : ''}`}
                        key={key}
                        title={error || `Source line ${row.sourceLine}, written matra ${cell.matraIndex + 1}`}
                      >
                        <span className="app-grid-write-coordinate">
                          <b>{cell.marker || ''}</b>
                          <i>{cell.cycleMatra ?? cell.matraIndex + 1}</i>
                        </span>
                        <input
                          value={value}
                          aria-label={`Line ${row.sourceLine}, written matra ${cell.matraIndex + 1}, cycle matra ${cell.cycleMatra ?? cell.matraIndex + 1}`}
                          aria-invalid={error ? 'true' : 'false'}
                          data-grid-cell="true"
                          onFocus={() => onCellFocus?.(row.sourceLine, cell.matraIndex)}
                          onChange={(event) => editCell(row, cell, event.target.value)}
                          onBlur={() => finishCell(row, cell, key)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              if (!finishCell(row, cell, key)) return;
                              const inputs = [...(event.currentTarget.closest('.app-grid-writer')?.querySelectorAll('input[data-grid-cell="true"]') || [])];
                              inputs[inputs.indexOf(event.currentTarget) + 1]?.focus();
                              return;
                            }
                            if (event.key !== 'Escape') return;
                            event.preventDefault();
                            setDrafts((current) => withoutKey(current, key));
                            setErrors((current) => withoutKey(current, key));
                            setMessage('Draft reverted to the Markdown source.');
                          }}
                        />
                      </label>
                    );
                  })}
                  <div className="app-grid-write-add">
                    <input
                      value={addDrafts[row.sourceLine] || ''}
                      aria-label={`Add a matra to source line ${row.sourceLine}`}
                      placeholder="new"
                      onChange={(event) => setAddDrafts((current) => ({
                        ...current,
                        [row.sourceLine]: event.target.value,
                      }))}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        addCell(row);
                      }}
                    />
                    <button type="button" onClick={() => addCell(row)}>+ Matra</button>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="app-grid-writer-message" role="status" aria-live="polite">{message}</div>
    </div>
  );
}
