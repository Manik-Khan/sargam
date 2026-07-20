// src/shell/CommandBar.jsx — text-format commands plus the shared score-side
// annotation palette. The score is the placement surface; generated metadata
// is hidden by default in the CodeMirror editor.

import React, { useState } from 'react';
import {
  applySlide,
  applyKan,
  applyKrintan,
  applyBeat,
  applyRepeat,
  applyLineRepeat,
  shiftOctave,
} from '../engine/commands.js';

const COMMANDS = [
  ['~ slide', 'Slide/meend over the selection', (s) => applySlide(s)],
  ['{ } kan', 'Grace run — last note owns the beat', (s) => applyKan(s)],
  ['[[ ]] krintan', 'Krintan over the selection', (s) => applyKrintan(s)],
  ['[ ] beat', 'Selection shares one beat', (s) => applyBeat(s)],
  ['( )×3', 'Repeat the phrase three times (edit the 3 after)', (s) => applyRepeat(s, 3)],
  ['||: :||', 'Repeat the whole passage', (s) => applyLineRepeat(s)],
  ["' oct +", 'Every selected note up one octave', (s) => shiftOctave(s, 1)],
  ['. oct −', 'Every selected note down one octave', (s) => shiftOctave(s, -1)],
];

const TOOLS = [
  ['da', '|', 'Da — one attack'],
  ['ra', '—', 'Ra — one attack'],
  ['diri', 'V', 'Diri — drag across two consecutive attacks'],
  ['chikari', '^', 'Chikari — one attack'],
];

export default function CommandBar({
  onApply,
  anchorTool,
  onAnchorTool,
  anchorMeter,
  onAnchorMeter,
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
        {COMMANDS.map(([label, title, fn]) => (
          <button key={label} type="button" className="cmd-btn" title={title} onClick={() => onApply(fn)}>{label}</button>
        ))}
        <div className="cmd-anchor-tools" role="group" aria-label="Score annotations">
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
          />
          <datalist id="sargam-common-meters">
            {['2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '4/3', '5/7'].map((value) => <option key={value} value={value} />)}
          </datalist>
          <button type="button" className="cmd-btn" onClick={() => onRemoveSelectedMark?.()}>Remove</button>
          {anchorTool && <button type="button" className="cmd-btn" onClick={() => onAnchorTool?.(null)}>Done</button>}
        </div>
      </div>
      <div className="cmd-meter-message" aria-live="polite">
        {anchorMessage || 'Choose a mark, then click or drag directly on the rendered notation.'}
      </div>
    </div>
  );
}
