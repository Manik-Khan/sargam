// src/shell/CommandBar.jsx — selection commands plus a musician-facing meter
// field. The meter syntax is generated from the editor selection so writers do
// not have to coordinate nested brackets or count a parallel event lane.

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

export default function CommandBar({
  onApply,
  onMeterApply,
  onMeterClear,
  onMeterPreview,
  meterMessage,
}) {
  const [meter, setMeter] = useState('');
  const applyMeter = () => onMeterApply?.(meter);
  return (
    <div className="cmdbar-wrap">
      <div className="cmdbar">
        {COMMANDS.map(([label, title, fn]) => (
          <button key={label} type="button" className="cmd-btn" title={title} onClick={() => onApply(fn)}>
            {label}
          </button>
        ))}
        <div className="cmd-meter" role="group" aria-label="Local meter">
          <label className="cmd-meter-label" htmlFor="cmd-meter-input">Meter</label>
          <input
            id="cmd-meter-input"
            className="cmd-meter-input"
            value={meter}
            placeholder="3, 6, 5/7, 4/3"
            inputMode="text"
            onFocus={() => onMeterPreview?.(meter)}
            onChange={(event) => {
              setMeter(event.target.value);
              onMeterPreview?.(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyMeter();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setMeter('');
                onMeterPreview?.('');
              }
            }}
          />
          <button type="button" className="cmd-btn cmd-meter-apply" onClick={applyMeter}>Apply</button>
          <button type="button" className="cmd-btn" onClick={() => onMeterClear?.()}>Clear</button>
        </div>
      </div>
      {meterMessage && <div className="cmd-meter-message" aria-live="polite">{meterMessage}</div>}
    </div>
  );
}
