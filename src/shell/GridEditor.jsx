// src/shell/GridEditor.jsx — direct graph-paper notation writing. Each input
// is one matra; valid edits immediately replace only that Markdown music line.

import React, { useMemo, useState } from 'react';
import {
  appendGridCellToken,
  gridLines,
  replaceGridCellToken,
} from '../engine/grid-edit.js';

const BOL_SYMBOL = { da: '|', ra: '—', diri: 'V', chikari: '^' };
const BOL_SHORTCUTS = new Set(['ArrowDown', 'ArrowUp', 'v', 'V', '^', 'c', 'C', 'Delete', 'Backspace', 'ArrowLeft', 'ArrowRight']);

function withoutKey(object, key) {
  const next = { ...object };
  delete next[key];
  return next;
}

export default function GridEditor({
  text,
  doc,
  onChange,
  onCellFocus,
  gridStyle = 'cells',
  bolCapture = null,
  bolMessage = '',
  onBolBegin,
  onBolKey,
  onBolEnd,
}) {
  const rows = useMemo(() => gridLines(doc), [doc]);
  const [drafts, setDrafts] = useState({});
  const [errors, setErrors] = useState({});
  const [addDrafts, setAddDrafts] = useState({});
  const [message, setMessage] = useState('Each box is one matra. Spaces inside a box become subdivisions.');
  const [bolTarget, setBolTarget] = useState(null);

  const firstAttack = rows.flatMap((row) => row.cells.flatMap((cell) => (
    cell.attacks || []
  ).map((attack) => ({ sourceLine: row.sourceLine, ordinal: attack.ordinal })))).at(0) || null;
  const activeBolPass = Math.max(1, Number(bolCapture?.pass) || 1);

  const beginSelectedBol = () => {
    const target = bolTarget || firstAttack;
    if (!target) {
      setMessage('Add a note attack before starting Bol Capture.');
      return;
    }
    onBolBegin?.(target.sourceLine, target.ordinal);
  };

  const chooseBolAttack = (sourceLine, ordinal) => {
    const target = { sourceLine, ordinal };
    setBolTarget(target);
    onBolBegin?.(sourceLine, ordinal);
  };

  const handleBolShortcut = (event) => {
    if (!bolCapture || !BOL_SHORTCUTS.has(event.key)) return;
    event.preventDefault();
    onBolKey?.(event.key, event);
  };

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
    <div
      className={`app-grid-writer${gridStyle === 'paper' ? ' app-grid-writer-paper' : ''}`}
      aria-label="Grid Write notation editor"
    >
      <div className="app-grid-writer-help">
        <strong>Grid Write</strong>
        <span>One box = one matra · type <code>SR</code> for an even cluster · <code>S R</code> for visible slots · <code>-</code> hold · <code>.</code> rest</span>
      </div>
      <div className={`app-grid-bol-tools${bolCapture ? ' active' : ''}`} role="group" aria-label="Grid Bol Capture">
        <button
          type="button"
          className={bolCapture ? 'active' : ''}
          aria-pressed={Boolean(bolCapture)}
          onClick={() => bolCapture ? onBolEnd?.() : beginSelectedBol()}
        >{bolCapture ? 'End Bol Capture' : 'Bol Capture'}</button>
        {bolCapture ? (
          <>
            <span className="app-grid-bol-pass">Pass</span>
            {[1, 2].map((pass) => (
              <button
                type="button"
                key={pass}
                className={activeBolPass === pass ? 'active' : ''}
                aria-pressed={activeBolPass === pass}
                onClick={() => onBolKey?.(String(pass))}
              >{pass}</button>
            ))}
            <button type="button" onClick={() => onBolKey?.('ArrowDown')}>| da</button>
            <button type="button" onClick={() => onBolKey?.('ArrowUp')}>— ra</button>
            <button type="button" onClick={() => onBolKey?.('v')}>V diri</button>
            <button type="button" onClick={() => onBolKey?.('^')}>^ chikari</button>
            <button type="button" onClick={() => onBolKey?.('Delete')}>Erase</button>
          </>
        ) : (
          <span>Choose an attack dot below; its bol stays attached to that exact note inside the matra.</span>
        )}
        {bolCapture && <span className="app-grid-bol-status" role="status">{bolMessage}</span>}
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
                    const rowPass = row.bolPasses.find((lane) => lane.pass === (
                      Number(bolCapture?.sourceLine) === Number(row.sourceLine) ? activeBolPass : 1
                    ));
                    const bolByAttack = new Map((rowPass?.marks || []).map((mark) => [mark.ordinal, mark]));
                    const coveredByDiri = new Map();
                    for (const mark of rowPass?.marks || []) {
                      if (mark.mark !== 'diri') continue;
                      for (let ordinal = mark.ordinal + 1; ordinal <= mark.toOrdinal; ordinal++) {
                        coveredByDiri.set(ordinal, mark.ordinal);
                      }
                    }
                    return (
                      <div
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
                          onFocus={() => {
                            onCellFocus?.(row.sourceLine, cell.matraIndex);
                            const attack = cell.attacks?.[0];
                            if (attack) setBolTarget({ sourceLine: row.sourceLine, ordinal: attack.ordinal });
                          }}
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
                        {(cell.attacks?.length || 0) > 0 && (
                          <span
                            className={`app-grid-write-bols${Number(bolCapture?.sourceLine) === Number(row.sourceLine) ? ' is-capturing' : ''}`}
                            style={{ '--grid-bol-slots': cell.attacks.length }}
                            aria-label={`Bols for line ${row.sourceLine}, matra ${cell.matraIndex + 1}`}
                          >
                            {cell.attacks.map((attack) => {
                              const bol = bolByAttack.get(attack.ordinal);
                              const covered = coveredByDiri.has(attack.ordinal);
                              const selected = Number(bolCapture?.sourceLine) === Number(row.sourceLine)
                                && Number(bolCapture?.ordinal) === Number(attack.ordinal);
                              return (
                                <button
                                  type="button"
                                  key={attack.ordinal}
                                  className={`app-grid-bol-slot${bol ? ' has-bol' : ''}${covered ? ' is-covered' : ''}${selected ? ' selected' : ''}`}
                                  aria-pressed={selected}
                                  aria-label={`Line ${row.sourceLine}, matra ${cell.matraIndex + 1}, attack ${attack.ordinal + 1}${bol ? `, ${bol.mark}` : ', no bol'}`}
                                  title={bol ? bol.mark : 'Choose this attack for Bol Capture'}
                                  onClick={() => chooseBolAttack(row.sourceLine, attack.ordinal)}
                                  onKeyDown={handleBolShortcut}
                                >{bol ? BOL_SYMBOL[bol.mark] : covered ? '·' : '+'}</button>
                              );
                            })}
                          </span>
                        )}
                      </div>
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
