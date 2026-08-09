// src/shell/GridEditor.jsx — direct graph-paper notation writing. Each input
// is one matra; valid edits immediately replace only that Markdown music line.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  appendGridCellToken,
  gridLines,
  replaceGridCellToken,
  setGridFirstEnding,
  setGridLineRepeat,
  setGridPhraseRepeat,
} from '../engine/grid-edit.js';
import { centeredElementScrollTop } from './editor-nav.js';

const BOL_SYMBOL = { da: '|', ra: '—', diri: 'V', chikari: '^' };
const BOL_OPTIONS = [
  { id: 'da', kind: 'da', symbol: '|', label: 'da' },
  { id: 'ra', kind: 'ra', symbol: '—', label: 'ra' },
  { id: 'diri-single', kind: 'diri', diriMode: 'single', symbol: 'V×2', label: 'diri · same note' },
  { id: 'diri-span', kind: 'diri', diriMode: 'span', symbol: 'V→', label: 'diri · next note' },
  { id: 'chikari', kind: 'chikari', symbol: '^', label: 'chikari' },
];

function bolMenuPosition(anchor) {
  const viewportWidth = Math.max(280, Number(window.innerWidth) || 0);
  const viewportHeight = Math.max(220, Number(window.innerHeight) || 0);
  const width = Math.min(292, viewportWidth - 16);
  const left = Math.min(
    Math.max(8, anchor.left + anchor.width / 2 - width / 2),
    viewportWidth - width - 8
  );
  const placeAbove = anchor.bottom + 118 > viewportHeight;
  return {
    position: 'fixed',
    width,
    left,
    ...(placeAbove
      ? { bottom: viewportHeight - anchor.top + 6 }
      : { top: anchor.bottom + 6 }),
  };
}

function cellMenuPosition(clientX, clientY, anchor) {
  const viewportWidth = Math.max(300, Number(window.innerWidth) || 0);
  const viewportHeight = Math.max(260, Number(window.innerHeight) || 0);
  const width = Math.min(324, viewportWidth - 16);
  const x = Number(clientX) > 0 ? Number(clientX) : anchor.left + anchor.width / 2;
  const y = Number(clientY) > 0 ? Number(clientY) : anchor.top + anchor.height / 2;
  const left = Math.min(Math.max(8, x + 5), viewportWidth - width - 8);
  const estimatedHeight = Math.min(410, viewportHeight - 16);
  const placeAbove = y + estimatedHeight > viewportHeight;
  return {
    position: 'fixed',
    width,
    maxHeight: viewportHeight - 16,
    left,
    ...(placeAbove
      ? { bottom: Math.max(8, viewportHeight - y + 5) }
      : { top: Math.max(8, y + 5) }),
  };
}

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
  const [cellMenu, setCellMenu] = useState(null);
  const [phraseRepeatStart, setPhraseRepeatStart] = useState(null);
  const [endingPickerLine, setEndingPickerLine] = useState(null);
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

  useEffect(() => {
    if (!cellMenu) return undefined;
    const dismiss = (event) => {
      if (event.target?.closest?.('.app-grid-cell-menu')) return;
      setCellMenu(null);
    };
    const escape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setCellMenu(null);
    };
    const resize = () => setCellMenu(null);
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
    };
  }, [cellMenu]);

  const chooseBolAttack = (sourceLine, matraIndex, ordinal, noteNumber, anchor) => {
    const target = {
      sourceLine,
      matraIndex,
      ordinal,
      noteNumber,
      style: bolMenuPosition(anchor.getBoundingClientRect()),
    };
    setBolMenu((current) => (
      current?.sourceLine === sourceLine && current?.ordinal === ordinal ? null : target
    ));
  };

  const chooseBolGap = (sourceLine, matraIndex, gapSlotIndex, gapNumber, anchor) => {
    const target = {
      sourceLine,
      matraIndex,
      ordinal: null,
      gapSlotIndex,
      gapNumber,
      style: bolMenuPosition(anchor.getBoundingClientRect()),
    };
    setBolMenu((current) => (
      current?.sourceLine === sourceLine && current?.gapSlotIndex === gapSlotIndex ? null : target
    ));
  };

  const openCellMenu = (event, row, cell, anchor = event.currentTarget) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = anchor.getBoundingClientRect();
    onCellFocus?.(row.sourceLine, cell.matraIndex);
    setBolMenu(null);
    setCellMenu({
      row,
      cell,
      sourceLine: row.sourceLine,
      matraIndex: cell.matraIndex,
      attackOrdinal: cell.attacks?.[0]?.ordinal ?? null,
      style: cellMenuPosition(event.clientX, event.clientY, bounds),
    });
  };

  const applyBol = (kind, diriMode = 'single') => {
    if (!bolMenu) return;
    const ok = onBolApply?.({
      sourceLine: bolMenu.sourceLine,
      ordinal: bolMenu.ordinal,
      gapSlotIndex: bolMenu.gapSlotIndex,
      kind,
      diriMode,
    });
    if (ok === false) return;
    const gap = Number.isInteger(bolMenu.gapSlotIndex);
    setMessage(kind
      ? `${kind === 'diri'
        ? diriMode === 'span' ? 'Diri attached across this and the next note.' : 'Diri attached to this note.'
        : gap ? 'Chikari written in this rhythmic gap.' : `${kind} attached to this note.`}`
      : gap ? 'Chikari removed from this rhythmic gap.' : 'Bol removed from this note.');
    setBolMenu(null);
  };

  const applyCellMenuBol = (kind, diriMode = 'single') => {
    if (!cellMenu || !Number.isInteger(cellMenu.attackOrdinal)) return;
    const ok = onBolApply?.({
      sourceLine: cellMenu.sourceLine,
      ordinal: cellMenu.attackOrdinal,
      kind,
      diriMode,
    });
    if (ok === false) return;
    setMessage(kind
      ? `${kind === 'diri'
        ? diriMode === 'span'
          ? `Diri attached across the chosen and next note from matra ${cellMenu.matraIndex + 1}.`
          : `Diri attached to the chosen note in matra ${cellMenu.matraIndex + 1}.`
        : `${kind} attached to the chosen note in matra ${cellMenu.matraIndex + 1}.`}`
      : 'Bol removed from the chosen note.');
    setCellMenu(null);
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

  const placeFirstEnding = (row, matraIndex) => {
    const result = setGridFirstEnding(text, row.sourceLine, matraIndex);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    onCellFocus?.(row.sourceLine, matraIndex);
    setEndingPickerLine(null);
    setCellMenu(null);
    setMessage(row.hasFollowingNotation
      ? `First ending now begins at written matra ${matraIndex + 1}. The next notation line is labelled as the second ending.`
      : `First ending now begins at written matra ${matraIndex + 1}. Add the second-ending phrase as the next notation line.`);
    onChange?.(result.text);
  };

  const removeFirstEnding = (row) => {
    const result = setGridFirstEnding(text, row.sourceLine, null);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setEndingPickerLine(null);
    setCellMenu(null);
    setMessage('Alternate-ending marker removed; both lines are ordinary notation again.');
    onChange?.(result.text);
  };

  const toggleLineRepeat = (row) => {
    const result = setGridLineRepeat(text, row.sourceLine, !row.lineRepeat);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setCellMenu(null);
    setEndingPickerLine(null);
    setMessage(row.lineRepeat
      ? 'Line repeat removed.'
      : 'Line repeat added. Right-click the first changed matra to add an alternate ending.');
    onChange?.(result.text);
  };

  const beginPhraseRepeat = (row, cell) => {
    setPhraseRepeatStart({ sourceLine: row.sourceLine, matraIndex: cell.matraIndex });
    setCellMenu(null);
    setMessage(`Phrase repeat starts at matra ${cell.matraIndex + 1}. Right-click its last matra.`);
  };

  const finishPhraseRepeat = (row, cell, times) => {
    if (
      Number(phraseRepeatStart?.sourceLine) !== Number(row.sourceLine) ||
      !Number.isInteger(phraseRepeatStart?.matraIndex)
    ) return;
    const result = setGridPhraseRepeat(
      text,
      row.sourceLine,
      phraseRepeatStart.matraIndex,
      cell.matraIndex,
      times
    );
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setPhraseRepeatStart(null);
    setCellMenu(null);
    setMessage(`Matras ${phraseRepeatStart.matraIndex + 1}–${cell.matraIndex + 1} now repeat ${times} times.`);
    onChange?.(result.text);
  };

  const removePhraseRepeat = (row, repeat) => {
    const result = setGridPhraseRepeat(
      text,
      row.sourceLine,
      repeat.fromMatra,
      repeat.toMatra,
      null
    );
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setCellMenu(null);
    setMessage('Phrase repeat removed.');
    onChange?.(result.text);
  };

  const useQuickCellValue = (row, cell, value, label) => {
    const result = replaceGridCellToken(text, row.sourceLine, cell.matraIndex, value);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    const key = `${row.sourceLine}:${cell.matraIndex}`;
    setDrafts((current) => withoutKey(current, key));
    setErrors((current) => withoutKey(current, key));
    setCellMenu(null);
    setMessage(`Matra ${cell.matraIndex + 1} changed to ${label}.`);
    onChange?.(result.text);
  };

  const copyBolLanes = async (row, rowIndex) => {
    const lines = String(text ?? '').split('\n');
    const nextSourceLine = rows[rowIndex + 1]?.sourceLine ?? (lines.length + 1);
    const lanes = lines
      .slice(row.sourceLine, Math.max(row.sourceLine, nextSourceLine - 1))
      .map((line) => line.trim())
      .filter((line) => /^>(?:\d+)?\s/.test(line) && !line.startsWith('>>'));
    if (!lanes.length) {
      setMessage('This notation line has no bol lane to copy yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(lanes.join('\n'));
      setMessage(`Copied ${lanes.length === 1 ? 'the bol lane' : `${lanes.length} bol passes`} from source line ${row.sourceLine}.`);
    } catch {
      setMessage('Clipboard access is unavailable here. Switch to Text Write to copy the bol line directly.');
    }
  };

  if (!rows.length) {
    return (
      <div className="app-grid-writer app-grid-writer-empty">
        Add a notation line in Text Write first, then return here to write it by matra.
      </div>
    );
  }

  const menuRow = cellMenu?.row ?? null;
  const menuCell = cellMenu?.cell ?? null;
  const menuPhraseRepeat = menuRow && menuCell
    ? (menuRow.phraseRepeats || []).find((repeat) =>
        menuCell.matraIndex >= repeat.fromMatra && menuCell.matraIndex <= repeat.toMatra
      )
    : null;
  const phraseStartOnMenuLine = menuRow &&
    Number(phraseRepeatStart?.sourceLine) === Number(menuRow.sourceLine) &&
    Number.isInteger(phraseRepeatStart?.matraIndex);
  const canFinishPhraseRepeat = phraseStartOnMenuLine &&
    menuCell && menuCell.matraIndex >= phraseRepeatStart.matraIndex;

  let previousSection = Symbol('first');
  return (
    <div
      className={`app-grid-writer${gridStyle === 'paper' ? ' app-grid-writer-paper' : ''}`}
      aria-label="Grid Write notation editor"
    >
      <div className="app-grid-writer-help">
        <strong>Grid Write</strong>
        <span>One box = one matra · type <code>SR</code> for an even cluster · <code>S R</code> for visible slots · <code>-</code> hold · <code>.</code> rest</span>
        <span className="app-grid-writer-bol-help"><b>+</b> beneath a note adds its bol; beneath a gap adds chikari · right-click a cell for musical tools</span>
      </div>
      <div
        className="app-grid-writer-scroll"
        ref={scrollRef}
        onScroll={() => {
          setBolMenu(null);
          setCellMenu(null);
        }}
      >
        {rows.map((row, rowIndex) => {
          const showSection = row.sectionLabel !== previousSection;
          previousSection = row.sectionLabel;
          return (
            <React.Fragment key={`line-${row.sourceLine}`}>
              {showSection && row.sectionLabel && (
                <div className="app-grid-writer-section">{row.sectionLabel}</div>
              )}
              <div
                className={`app-grid-writer-line${row.alternateEndingRole ? ` has-${row.alternateEndingRole}-ending` : ''}${Number(endingPickerLine) === Number(row.sourceLine) ? ' is-placing-ending' : ''}`}
                data-source-line={row.sourceLine}
              >
                <div className="app-grid-writer-line-label">
                  <span>Line {row.sourceLine}</span>
                  {row.tal && <small>{row.tal.name}</small>}
                  {row.alternateEndingRole === 'second' && (
                    <span className="app-grid-ending-line-label">2nd ending</span>
                  )}
                  {row.lineRepeat && (
                    <button
                      type="button"
                      className={Number(endingPickerLine) === Number(row.sourceLine) ? 'active' : ''}
                      aria-pressed={Number(endingPickerLine) === Number(row.sourceLine)}
                      onClick={() => {
                        setEndingPickerLine((current) => (
                          Number(current) === Number(row.sourceLine) ? null : row.sourceLine
                        ));
                        setMessage('Choose the first matra that changes on the first pass.');
                      }}
                    >
                      {Number(endingPickerLine) === Number(row.sourceLine)
                        ? 'Cancel ending'
                        : Number.isInteger(row.firstEndingFrom) ? 'Move 1st ending' : 'Add 1st ending'}
                    </button>
                  )}
                  {row.lineRepeat && Number.isInteger(row.firstEndingFrom) && (
                    <button type="button" className="remove" onClick={() => removeFirstEnding(row)}>Remove ending</button>
                  )}
                  {row.bolPasses.length > 0 && (
                    <button type="button" onClick={() => copyBolLanes(row, rowIndex)}>Copy bols</button>
                  )}
                </div>
                <div className="app-grid-writer-cells" role="group" aria-label={`Source line ${row.sourceLine} matras`}>
                  {row.cells.map((cell) => {
                    const key = `${row.sourceLine}:${cell.matraIndex}`;
                    const value = Object.hasOwn(drafts, key) ? drafts[key] : cell.text;
                    const error = errors[key] || '';
                    const selected = Number(activeSelection?.sourceLine) === Number(row.sourceLine)
                      && Number(activeSelection?.matraIndex) === Number(cell.matraIndex);
                    const placingEnding = Number(endingPickerLine) === Number(row.sourceLine);
                    const firstEndingCell = row.alternateEndingRole === 'first'
                      && cell.matraIndex >= row.firstEndingFrom;
                    const secondEndingCell = row.alternateEndingRole === 'second';
                    const endingStart = (firstEndingCell && cell.matraIndex === row.firstEndingFrom)
                      || (secondEndingCell && cell.matraIndex === 0);
                    const rowPass = row.bolPasses.find((lane) => lane.pass === 1);
                    const bolByAttack = new Map(
                      (rowPass?.marks || [])
                        .filter((mark) => Number.isInteger(mark.ordinal))
                        .map((mark) => [mark.ordinal, mark])
                    );
                    const gapBolBySlot = new Map(
                      (rowPass?.marks || [])
                        .filter((mark) => mark.gap && Number.isInteger(mark.slotIndex))
                        .map((mark) => [mark.slotIndex, mark])
                    );
                    const coveredByDiri = new Map();
                    for (const mark of rowPass?.marks || []) {
                      if (mark.mark !== 'diri') continue;
                      for (let ordinal = mark.ordinal + 1; ordinal <= mark.toOrdinal; ordinal++) {
                        coveredByDiri.set(ordinal, mark.ordinal);
                      }
                    }
                    return (
                      <div
                        className={`app-grid-write-cell${error ? ' is-invalid' : ''}${selected ? ' is-selected' : ''}${firstEndingCell ? ' is-first-ending' : ''}${secondEndingCell ? ' is-second-ending' : ''}${endingStart ? ' is-ending-start' : ''}`}
                        key={key}
                        data-source-line={row.sourceLine}
                        data-matra-index={cell.matraIndex}
                        title={error || `Source line ${row.sourceLine}, written matra ${cell.matraIndex + 1}`}
                        onContextMenu={(event) => openCellMenu(event, row, cell)}
                      >
                        {placingEnding && cell.matraIndex > 0 && (
                          <button
                            type="button"
                            className={`app-grid-ending-marker${cell.matraIndex === row.firstEndingFrom ? ' active' : ''}`}
                            aria-label={`Start the first ending at written matra ${cell.matraIndex + 1}`}
                            onClick={() => placeFirstEnding(row, cell.matraIndex)}
                          >{cell.matraIndex === row.firstEndingFrom ? '1st ending' : 'Start here'}</button>
                        )}
                        {!placingEnding && endingStart && (
                          row.alternateEndingRole === 'first' ? (
                            <button
                              type="button"
                              className="app-grid-ending-marker active"
                              aria-label="Move the first-ending marker"
                              onClick={() => {
                                setEndingPickerLine(row.sourceLine);
                                setMessage('Choose the first matra that changes on the first pass.');
                              }}
                            >1st ending</button>
                          ) : (
                            <span className="app-grid-ending-marker active second">2nd ending</span>
                          )
                        )}
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
                            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                              openCellMenu(event, row, cell, event.currentTarget.closest('.app-grid-write-cell'));
                              return;
                            }
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
                        {(cell.bolSlots?.length || 0) > 0 && (
                          <span
                            className="app-grid-write-bols"
                            style={{ '--grid-bol-slots': cell.bolSlots.length }}
                            aria-label={`Bols for line ${row.sourceLine}, matra ${cell.matraIndex + 1}`}
                          >
                            {cell.bolSlots.map((slot, slotIndex) => {
                              const attack = slot.kind === 'attack' ? slot : null;
                              const bol = attack ? bolByAttack.get(attack.attackOrdinal) : gapBolBySlot.get(slot.slotIndex);
                              const covered = attack ? coveredByDiri.has(attack.attackOrdinal) : false;
                              const spanning = bol?.mark === 'diri' && bol.toOrdinal > bol.ordinal;
                              const selected = Number(bolMenu?.sourceLine) === Number(row.sourceLine)
                                && (attack
                                  ? Number(bolMenu?.ordinal) === Number(attack.attackOrdinal)
                                  : Number(bolMenu?.gapSlotIndex) === Number(slot.slotIndex));
                              return (
                                <button
                                  type="button"
                                  key={attack ? `attack-${attack.attackOrdinal}` : `gap-${slot.slotIndex}`}
                                  className={`app-grid-bol-slot${bol ? ' has-bol' : ''}${covered ? ' is-covered' : ''}${selected ? ' selected' : ''}`}
                                  aria-pressed={selected}
                                  aria-label={attack
                                    ? `Line ${row.sourceLine}, matra ${cell.matraIndex + 1}, attack ${attack.attackOrdinal + 1}${bol ? `, ${bol.mark}` : ', no bol'}`
                                    : `Line ${row.sourceLine}, matra ${cell.matraIndex + 1}, rhythmic gap ${slotIndex + 1}${bol ? ', chikari' : ''}`}
                                  title={!attack
                                    ? bol ? 'Remove chikari from this rhythmic gap' : 'Add chikari to this rhythmic gap'
                                    : bol
                                    ? `Change ${bol.mark}${bol.mark === 'diri'
                                      ? spanning ? ' · across this and the next note' : ' · two strokes on this note'
                                      : ''}`
                                    : covered
                                      ? 'Second note of Diri from the previous note'
                                      : 'Add a bol to this note'}
                                  onClick={(event) => attack
                                    ? chooseBolAttack(
                                      row.sourceLine,
                                      cell.matraIndex,
                                      attack.attackOrdinal,
                                      cell.attacks.findIndex((item) => item.ordinal === attack.attackOrdinal) + 1,
                                      event.currentTarget
                                    )
                                    : chooseBolGap(
                                      row.sourceLine,
                                      cell.matraIndex,
                                      slot.slotIndex,
                                      slotIndex + 1,
                                      event.currentTarget
                                    )}
                                >{bol ? spanning ? 'di' : BOL_SYMBOL[bol.mark] : covered ? 'ri' : '+'}</button>
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
      {bolMenu && typeof document !== 'undefined' && createPortal(
        <div
          className="app-grid-bol-menu app-grid-bol-menu-floating"
          role="menu"
          aria-label={`Choose a bol for matra ${bolMenu.matraIndex + 1}`}
          style={bolMenu.style}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setBolMenu(null);
          }}
        >
          <div className="app-grid-bol-menu-head">
            <strong>Bol</strong>
            <span>{Number.isInteger(bolMenu.gapSlotIndex)
              ? `gap ${bolMenu.gapNumber}`
              : `note ${bolMenu.noteNumber}`}</span>
            <button type="button" aria-label="Close bol menu" onClick={() => setBolMenu(null)}>×</button>
          </div>
          <div className="app-grid-bol-menu-options">
            {BOL_OPTIONS.filter((option) => (
              !Number.isInteger(bolMenu.gapSlotIndex) || option.kind === 'chikari'
            )).map((option) => (
              <button
                type="button"
                role="menuitem"
                key={option.id}
                onClick={() => applyBol(option.kind, option.diriMode)}
              >
                <b>{option.symbol}</b>
                <span>{option.label}</span>
              </button>
            ))}
            <button type="button" role="menuitem" className="remove" onClick={() => applyBol(null)}>
              <b>×</b><span>remove</span>
            </button>
          </div>
        </div>,
        document.body
      )}
      {cellMenu && menuRow && menuCell && typeof document !== 'undefined' && createPortal(
        <div
          className="app-grid-cell-menu"
          role="menu"
          aria-label={`Musical tools for line ${menuRow.sourceLine}, matra ${menuCell.matraIndex + 1}`}
          style={cellMenu.style}
        >
          <div className="app-grid-cell-menu-head">
            <span>
              <strong>Matra {menuCell.matraIndex + 1}</strong>
              <small>line {menuRow.sourceLine}{menuCell.cycleMatra ? ` · cycle ${menuCell.cycleMatra}` : ''}</small>
            </span>
            <button type="button" aria-label="Close matra menu" onClick={() => setCellMenu(null)}>×</button>
          </div>

          {(menuCell.attacks?.length || 0) > 0 && (
            <section className="app-grid-cell-menu-section" aria-label="Bol tools">
              <h4>Bol</h4>
              {menuCell.attacks.length > 1 && (
                <div className="app-grid-cell-menu-attacks" aria-label="Choose note attack">
                  {menuCell.attacks.map((attack, index) => (
                    <button
                      type="button"
                      key={attack.ordinal}
                      className={cellMenu.attackOrdinal === attack.ordinal ? 'active' : ''}
                      aria-pressed={cellMenu.attackOrdinal === attack.ordinal}
                      onClick={() => setCellMenu((current) => ({ ...current, attackOrdinal: attack.ordinal }))}
                    >note {index + 1}</button>
                  ))}
                </div>
              )}
              <div className="app-grid-cell-menu-actions bol-actions">
                {BOL_OPTIONS.map((option) => (
                  <button type="button" role="menuitem" key={option.id} onClick={() => applyCellMenuBol(option.kind, option.diriMode)}>
                    <b>{option.symbol}</b><span>{option.label}</span>
                  </button>
                ))}
                <button type="button" role="menuitem" className="remove" onClick={() => applyCellMenuBol(null)}>
                  <b>×</b><span>remove</span>
                </button>
              </div>
            </section>
          )}

          <section className="app-grid-cell-menu-section" aria-label="Repeat and ending tools">
            <h4>Repeat &amp; endings</h4>
            <div className="app-grid-cell-menu-actions wide-actions">
              {menuPhraseRepeat ? (
                <button type="button" role="menuitem" className="remove" onClick={() => removePhraseRepeat(menuRow, menuPhraseRepeat)}>
                  Remove ×{menuPhraseRepeat.times} phrase repeat
                </button>
              ) : canFinishPhraseRepeat ? (
                <>
                  <button type="button" role="menuitem" onClick={() => finishPhraseRepeat(menuRow, menuCell, 2)}>
                    Repeat {phraseRepeatStart.matraIndex + 1}–{menuCell.matraIndex + 1} ×2
                  </button>
                  <button type="button" role="menuitem" onClick={() => finishPhraseRepeat(menuRow, menuCell, 3)}>
                    Repeat {phraseRepeatStart.matraIndex + 1}–{menuCell.matraIndex + 1} ×3
                  </button>
                  <button type="button" role="menuitem" className="quiet" onClick={() => {
                    setPhraseRepeatStart(null);
                    setCellMenu(null);
                    setMessage('Phrase-repeat selection cancelled.');
                  }}>Cancel phrase selection</button>
                </>
              ) : (
                <button type="button" role="menuitem" onClick={() => beginPhraseRepeat(menuRow, menuCell)}>
                  Start phrase repeat here
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => toggleLineRepeat(menuRow)}>
                {menuRow.lineRepeat ? 'Remove line repeat' : 'Repeat this line'}
              </button>
              {menuRow.lineRepeat && menuCell.matraIndex > 0 && (
                <button type="button" role="menuitem" onClick={() => placeFirstEnding(menuRow, menuCell.matraIndex)}>
                  {Number.isInteger(menuRow.firstEndingFrom) ? 'Move 1st ending here' : '1st ending starts here'}
                </button>
              )}
              {menuRow.lineRepeat && Number.isInteger(menuRow.firstEndingFrom) && (
                <button type="button" role="menuitem" className="remove" onClick={() => removeFirstEnding(menuRow)}>
                  Remove alternate ending
                </button>
              )}
            </div>
          </section>

          <section className="app-grid-cell-menu-section" aria-label="Quick cell tools">
            <h4>Quick cell</h4>
            <div className="app-grid-cell-menu-actions quick-actions">
              <button type="button" role="menuitem" onClick={() => useQuickCellValue(menuRow, menuCell, '-', 'a hold')}>
                <b>—</b><span>hold</span>
              </button>
              <button type="button" role="menuitem" onClick={() => useQuickCellValue(menuRow, menuCell, '.', 'a rest')}>
                <b>·</b><span>rest</span>
              </button>
            </div>
          </section>
          <p className="app-grid-cell-menu-hint">Right-click another cell to move this menu.</p>
        </div>,
        document.body
      )}
      <div className="app-grid-writer-message" role="status" aria-live="polite">{bolMessage || message}</div>
    </div>
  );
}
