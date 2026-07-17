// src/shell/EditorPane.jsx — the plain textarea (spec §5: Phase 1 editor;
// native undo preserved, selection commands arrive in M4).
// Reports the cursor's SOURCE LINE upward so the preview can scope the
// landing report to it (spec §4). The line number is derived here and only
// reported when it changes, so ordinary typing costs no extra renders.

import React, { useCallback, useRef } from 'react';

export default function EditorPane({ text, onChange, onCursorLine, onCursorPos, editorRef }) {
  const lastLine = useRef(0);

  const report = useCallback(
    (el) => {
      if (!el || !onCursorLine) return;
      const upto = el.value.slice(0, el.selectionStart);
      let line = 1;
      for (let i = 0; i < upto.length; i++) if (upto.charCodeAt(i) === 10) line++;
      if (onCursorPos) onCursorPos(el.selectionStart);
      if (line !== lastLine.current) {
        lastLine.current = line;
        onCursorLine(line);
      }
    },
    [onCursorLine, onCursorPos]
  );

  return (
    <textarea
      ref={editorRef}
      className="app-editor"
      value={text}
      onChange={(e) => {
        onChange(e.target.value);
        report(e.target);
      }}
      onSelect={(e) => report(e.target)}
      onKeyUp={(e) => report(e.target)}
      onClick={(e) => report(e.target)}
      onFocus={(e) => report(e.target)}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="Sargam text editor"
    />
  );
}
