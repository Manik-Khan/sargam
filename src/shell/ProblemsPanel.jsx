// src/shell/ProblemsPanel.jsx — compact diagnostics, collapsed by default.
import React, { useMemo, useState } from 'react';
import { groupProblems, problemSelectionRange, problemSummary } from './problems.js';

export default function ProblemsPanel({ problems = [], text = '', editorRef = null }) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => groupProblems(problems), [problems]);

  const jumpToProblem = (problem) => {
    const selection = problemSelectionRange(text, problem);
    const applySelection = () => {
      const editor = editorRef && editorRef.current;
      if (!editor) return;

      editor.focus();
      editor.setSelectionRange(selection.start, selection.end);

      // Scroll the textarea itself, not merely the page containing it.
      const before = text.slice(0, selection.start);
      const zeroBasedLine = before === '' ? 0 : before.split('\n').length - 1;
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        const style = window.getComputedStyle(editor);
        const fontSize = parseFloat(style.fontSize) || 14;
        const parsedLineHeight = parseFloat(style.lineHeight);
        const lineHeight = Number.isFinite(parsedLineHeight)
          ? parsedLineHeight
          : fontSize * 1.45;
        editor.scrollTop = Math.max(
          0,
          zeroBasedLine * lineHeight - editor.clientHeight * 0.35,
        );
      }

      // EditorPane reports cursor line/position through its native select hook.
      if (typeof Event === 'function') {
        editor.dispatchEvent(new Event('select', { bubbles: true }));
      }
    };

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(applySelection);
    } else {
      setTimeout(applySelection, 0);
    }
  };

  // A clean document should not spend any vertical space saying so.
  if (problems.length === 0) return null;

  return (
    <section className={'app-problems has-problems' + (open ? ' is-open' : '')}>
      <button
        type="button"
        className="app-problems-summary"
        aria-expanded={open}
        aria-controls="sargam-problems-list"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="app-problems-count">⚠ {problemSummary(problems.length)}</span>
        <span className="app-problems-toggle">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="app-problems-list" id="sargam-problems-list">
          {grouped.map((problem) => (
            <button
              type="button"
              className="app-problem"
              key={JSON.stringify([problem.line, problem.col, problem.message])}
              onClick={() => jumpToProblem(problem)}
              title="Jump to this issue in the editor"
            >
              <span className="app-problem-location">
                Line {problem.line}
                {problem.col != null ? ', col ' + problem.col : ''}
              </span>
              <span className="app-problem-message">{problem.displayMessage}</span>
              {problem.count > 1 && (
                <span className="app-problem-count">×{problem.count}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
