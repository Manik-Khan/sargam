// src/shell/EditorPane.jsx — the plain textarea (spec §5: Phase 1 editor;
// native undo preserved, selection commands arrive in M4).

import React from 'react';

export default function EditorPane({ text, onChange }) {
  return (
    <textarea
      className="app-editor"
      value={text}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="Sargam text editor"
    />
  );
}
