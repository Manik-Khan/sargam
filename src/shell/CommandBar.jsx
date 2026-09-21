// src/shell/CommandBar.jsx — text-format commands plus the shared score-side
// annotation palette. The score is the placement surface; generated metadata
// is hidden by default in the CodeMirror editor.

import React, { useState } from 'react';
import {
  applyBeat,
  applyRepeat,
  applyLineRepeat,
  shiftOctave,
} from '../engine/commands.js';

const COMMANDS = [
  ['[ ] beat', 'Selection shares one beat', (s) => applyBeat(s)],
  ['( )×3', 'Repeat the phrase three times (edit the 3 after)', (s) => applyRepeat(s, 3)],
  ['||: :||', 'Repeat the whole passage', (s) => applyLineRepeat(s)],
  ["' oct +", 'Every selected note up one octave', (s) => shiftOctave(s, 1)],
  ['. oct −', 'Every selected note down one octave', (s) => shiftOctave(s, -1)],
];

const TOOLS = [
  ['da', '|', 'Da — one attack'],
  ['ra', '—', 'Ra — one attack'],
  ['diri', 'V', 'Legacy Diri span — Grid Write + is the per-note double stroke'],
  ['chikari', '^', 'Chikari — one attack'],
];

export default function CommandBar({
  onApply,
  mode = 'annotations',
  anchorTool,
  onAnchorTool,
  anchorMeter,
  onAnchorMeter,
  onApplyMeter,
  onRemoveSelectedMark,
  anchorMessage,
}) {
  const [customMeter, setCustomMeter] = useState(anchorMeter || '');
  const chooseMeter = (value) => {
    setCustomMeter(value);
    onAnchorMeter?.(value);
    onAnchorTool?.('meter');
  };
  return (
    <div className="cmdbar-wrap">
      <div className="cmdbar">
        {mode === 'insert' && COMMANDS.map(([label, title, fn]) => (
          <button key={label} type="button" className="cmd-btn" title={title} onMouseDown={event => event.preventDefault()} onClick={() => onApply(fn)}>{label}</button>
        ))}
        {mode === 'annotations' && <div className="cmd-anchor-tools" role="group" aria-label="Score annotations">
          <span className="cmd-anchor-label">Annotate</span>
          {TOOLS.map(([kind, glyph, title]) => (
            <button
              key={kind}
              type="button"
              className={`cmd-btn cmd-anchor-tool${anchorTool === kind ? ' active' : ''}`}
              title={title}
              onClick={() => onAnchorTool?.(anchorTool === kind ? null : kind)}
            >{glyph} <span>{kind}</span></button>
          ))}
          <label className="cmd-meter-label" htmlFor="cmd-anchor-meter">Meter</label>
          <input
            id="cmd-anchor-meter"
            className="cmd-meter-input"
            list="sargam-common-meters"
            value={customMeter}
            placeholder="3, 6, 5/7, 4/3"
            onFocus={() => onAnchorTool?.('meter')}
            onChange={(event) => chooseMeter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              onApplyMeter?.(customMeter);
            }}
          />
          <datalist id="sargam-common-meters">
            {['2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '4/3', '5/7'].map((value) => <option key={value} value={value} />)}
          </datalist>
          <button
            type="button"
            className="cmd-btn cmd-meter-apply"
            title="Apply this meter to the selected notes in the source editor"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onApplyMeter?.(customMeter)}
          >Apply Meter</button>
          <button type="button" className="cmd-btn" onClick={() => onRemoveSelectedMark?.()}>Remove selected mark</button>
          {anchorTool && <button type="button" className="cmd-btn" onClick={() => onAnchorTool?.(null)}>Done</button>}
        </div>}
      </div>
      {mode === 'annotations' && (anchorTool || anchorMessage) && <div className="cmd-meter-message" aria-live="polite">
        {anchorMessage || 'Click or drag on the score to place this mark.'}
      </div>}
    </div>
  );
}
