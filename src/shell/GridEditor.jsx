// src/shell/GridEditor.jsx — direct graph-paper notation writing. Each input
// is one matra; valid edits immediately replace only that Markdown music line.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  appendGridCellToken,
  gridLines,
  replaceGridCellToken,
} from '../engine/grid-edit.js';
import { centeredElementScrollTop } from './editor-nav.js';

const BOL_SYMBOL = { da: '|', ra: '—', diri: 'V', chikari: '^' };
const BOL_OPTIONS = [
  { kind: 'da', label: 'da' },
  { kind: 'ra', label: 'ra' },
  { kind: 'diri', label: 'diri · 2 strokes' },
  { kind: 'chikari', label: 'chikari' },
];

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
  activeSelection = null,
  gridStyle = 'cells',
  bolMessage = '',
  onBolApply,
}) {
  const rows = useMemo(() => gridLines(doc), [doc]);
  const [drafts, setDrafts] = useState({});
  const [errors, setErrors] = useState({});
  const [addDrafts, setAddDrafts] = useState({});
  const [message, setMessage] = useState('Each box is one matra. Spaces inside a box become subdivisions.');
  const [bolMenu, setBolMenu] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const sourceLine = Number(activeSelection?.sourceLine);
    const matraIndex = Number(activeSelection?.matraIndex);
    if (!Number.isInteger(sourceLine) || !Number.isInteger(matraIndex)) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const cell = [...scroller.querySelectorAll('.app-grid-write-cell')].find((node) => (
      Number(node.dataset.sourceLine) === sourceLine &&
      Number(node.dataset.matraIndex) === matraIndex
    ));
    if (!cell) return;

    const viewport = scroller.getBoundingClientRect();
    const bounds = cell.getBoundingClientRect();
    scroller.scrollTop = centeredElementScrollTop({
      scrollTop: scroller.scrollTop,
      containerTop: viewport.top,
      containerHeight: viewport.height,
      elementTop: bounds.top,
      elementHeight: bounds.height,
    });
    const input = cell.querySelector('input[data-grid-cell="true"]');
    try {
      input?.focus({ preventScroll: true });
    } catch {
      input?.focus();
    }
    setBolMenu(null);
  }, [activeSelection?.sourceLine, activeSelection?.matraIndex]);

  const chooseBolAttack = (sourceLine, matraIndex, ordinal) => {
    const target = { sourceLine, matraIndex, ordinal };
    setBolMenu((current) => (
      current?.sourceLine === sourceLine && current?.ordinal === ordinal ? null : target
    ));
  };

  const applyBol = (kind) => {
    if (!bolMenu) return;
    const ok = onBolApply?.({
      sourceLine: bolMenu.sourceLine,
      ordinal: bolMenu.ordinal,
      kind,
    });
    if (ok === false) return;
    setMessage(kind
      ? `${kind === 'diri' ? 'Diri' : kind} attached to this note.`
      : 'Bol removed from this note.');
    setBolMenu(null);
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
        <span className="app-grid-writer-bol-help"><b>+</b> beneath a note adds its bol</span>
      </div>
      <div className="app-grid-writer-scroll" ref={scrollRef}>
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
                    const selected = Number(activeSelection?.sourceLine) === Number(row.sourceLine)
                      && Number(activeSelection?.matraIndex) === Number(cell.matraIndex);
                    const rowPass = row.bolPasses.find((lane) => lane.pass === 1);
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
                        className={`app-grid-write-cell${error ? ' is-invalid' : ''}${selected ? ' is-selected' : ''}`}
                        key={key}
                        data-source-line={row.sourceLine}
                        data-matra-index={cell.matraIndex}
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
                            className="app-grid-write-bols"
                            style={{ '--grid-bol-slots': cell.attacks.length }}
                            aria-label={`Bols for line ${row.sourceLine}, matra ${cell.matraIndex + 1}`}
                          >
                            {cell.attacks.map((attack) => {
                              const bol = bolByAttack.get(attack.ordinal);
                              const covered = coveredByDiri.has(attack.ordinal);
                              const selected = Number(bolMenu?.sourceLine) === Number(row.sourceLine)
                                && Number(bolMenu?.ordinal) === Number(attack.ordinal);
                              return (
                                <button
                                  type="button"
                                  key={attack.ordinal}
                                  className={`app-grid-bol-slot${bol ? ' has-bol' : ''}${covered ? ' is-covered' : ''}${selected ? ' selected' : ''}`}
                                  aria-pressed={selected}
                                  aria-label={`Line ${row.sourceLine}, matra ${cell.matraIndex + 1}, attack ${attack.ordinal + 1}${bol ? `, ${bol.mark}` : ', no bol'}`}
                                  title={bol
                                    ? `Change ${bol.mark}${bol.mark === 'diri' ? ' · two strokes on this note' : ''}`
                                    : 'Add a bol to this note'}
                                  onClick={() => chooseBolAttack(row.sourceLine, cell.matraIndex, attack.ordinal)}
                                >{bol ? BOL_SYMBOL[bol.mark] : covered ? '·' : '+'}</button>
                              );
                            })}
                          </span>
                        )}
                        {Number(bolMenu?.sourceLine) === Number(row.sourceLine)
                          && Number(bolMenu?.matraIndex) === Number(cell.matraIndex) && (
                          <div
                            className="app-grid-bol-menu"
                            role="menu"
                            aria-label={`Choose a bol for matra ${cell.matraIndex + 1}`}
                            onKeyDown={(event) => {
                              if (event.key !== 'Escape') return;
                              event.preventDefault();
                              setBolMenu(null);
                            }}
                          >
                            <div className="app-grid-bol-menu-head">
                              <strong>Bol</strong>
                              <span>note {cell.attacks.findIndex((attack) => attack.ordinal === bolMenu.ordinal) + 1}</span>
                              <button type="button" aria-label="Close bol menu" onClick={() => setBolMenu(null)}>×</button>
                            </div>
                            <div className="app-grid-bol-menu-options">
                              {BOL_OPTIONS.map((option) => (
                                <button
                                  type="button"
                                  role="menuitem"
                                  key={option.kind}
                                  onClick={() => applyBol(option.kind)}
                                >
                                  <b>{BOL_SYMBOL[option.kind]}</b>
                                  <span>{option.label}</span>
                                </button>
                              ))}
                              <button type="button" role="menuitem" className="remove" onClick={() => applyBol(null)}>
                                <b>×</b><span>remove</span>
                              </button>
                            </div>
                          </div>
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
      <div className="app-grid-writer-message" role="status" aria-live="polite">{bolMessage || message}</div>
    </div>
  );
}
