// src/shell/CommandBar.jsx — M4 selection commands as buttons (M's ask,
// 2026-07-16). Select notes in the editor, press a button, the grammar is
// applied — "so you don't have to remember all of the commands". Thin
// shell: every transform is a pure, smoked function in engine/commands.js.

import React from 'react';
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

export default function CommandBar({ onApply }) {
  return (
    <div className="cmdbar">
      {COMMANDS.map(([label, title, fn]) => (
        <button key={label} className="cmd-btn" title={title} onClick={() => onApply(fn)}>
          {label}
        </button>
      ))}
    </div>
  );
}
