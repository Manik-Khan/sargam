// src/shell/EditorPane.jsx — the plain textarea (spec §5: Phase 1 editor).
// Reports the cursor's SOURCE LINE upward and accepts a small before-edit
// hook so preview-driven temporary line selections cannot be accidentally
// overwritten by the first keystroke.

import React, { useCallback, useRef } from 'react';

export default function EditorPane({
  text,
  onChange,
  onCursorLine,
  onCursorPos,
  onBeforeEdit,
  editorRef,
}) {
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

  const beforeEdit = (el) => {
    if (onBeforeEdit) onBeforeEdit(el);
  };

  return (
    <textarea
      ref={editorRef}
      className="app-editor"
      value={text}
      onChange={(e) => {
        onChange(e.target.value);
        report(e.target);
      }}
      onBeforeInput={(e) => beforeEdit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(e.key)) {
          beforeEdit(e.currentTarget);
        }
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
