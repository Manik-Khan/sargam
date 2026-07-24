// src/shell/EditorPane.jsx — CodeMirror editor with a textarea-compatible
// facade for the existing shell. Clean mode visually folds generated anchor
// metadata while preserving the exact underlying Markdown and selection maps.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState, Compartment, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { metadataRanges } from '../engine/anchors.js';
import { audioLinkMetadataRanges } from '../engine/audio-links.js';
import { bolCursorSelection } from '../engine/bol-capture.js';
import { bolCaptureKeymap } from './bol-capture-keymap.js';

class HiddenStructureWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-sargam-fold';
    span.textContent = '⋯ generated structure';
    span.title = 'Turn on Structure to inspect stored anchors and audio links';
    return span;
  }
}

function hiddenDecorations(state) {
  const source = state.doc.toString();
  const ranges = [...metadataRanges(source), ...audioLinkMetadataRanges(source)]
    .sort((a, b) => a.from - b.from)
    .map(({ from, to }) =>
    Decoration.replace({ widget: new HiddenStructureWidget(), block: true }).range(from, to)
  );
  return Decoration.set(ranges, true);
}

const rebuildHidden = StateEffect.define();
const hiddenStructure = StateField.define({
  create: hiddenDecorations,
  update(value, transaction) {
    if (transaction.docChanged || transaction.effects.some((effect) => effect.is(rebuildHidden))) {
      return hiddenDecorations(transaction.state);
    }
    return value.map(transaction.changes);
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.from(field, (ranges) => () => ranges),
  ],
});

function makeFacade(view) {
  return {
    get value() { return view.state.doc.toString(); },
    get selectionStart() { return view.state.selection.main.from; },
    get selectionEnd() { return view.state.selection.main.to; },
    setSelectionRange(start, end = start) {
      const length = view.state.doc.length;
      const a = Math.max(0, Math.min(length, Number(start) || 0));
      const b = Math.max(0, Math.min(length, Number(end) || 0));
      view.dispatch({ selection: { anchor: a, head: b }, scrollIntoView: true });
    },
    focus() { view.focus(); },
    get scrollTop() { return view.scrollDOM.scrollTop; },
    set scrollTop(value) { view.scrollDOM.scrollTop = value; },
    get clientHeight() { return view.scrollDOM.clientHeight; },
    get dom() { return view.contentDOM; },
    get scrollDOM() { return view.scrollDOM; },
    get view() { return view; },
  };
}

export default function EditorPane({
  text,
  onChange,
  onCursorLine,
  onCursorPos,
  onBeforeEdit,
  bolCapture,
  bolMessage,
  onToggleBolCapture,
  onBolCaptureKey,
  editorRef,
}) {
  const mount = useRef(null);
  const viewRef = useRef(null);
  const changeRef = useRef(onChange);
  const lineRef = useRef(onCursorLine);
  const posRef = useRef(onCursorPos);
  const beforeRef = useRef(onBeforeEdit);
  const bolKeyRef = useRef(onBolCaptureKey);
  const [showStructure, setShowStructure] = useState(false);
  const structureCompartment = useMemo(() => new Compartment(), []);

  changeRef.current = onChange;
  lineRef.current = onCursorLine;
  posRef.current = onCursorPos;
  beforeRef.current = onBeforeEdit;
  bolKeyRef.current = onBolCaptureKey;

  useEffect(() => {
    if (!mount.current) return undefined;
    let facade = null;
    const view = new EditorView({
      parent: mount.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          dropCursor(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          markdown(),
          bolCaptureKeymap((key) => bolKeyRef.current?.(key)),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          structureCompartment.of(hiddenStructure),
          EditorView.domEventHandlers({
            beforeinput() {
              if (facade) beforeRef.current?.(facade);
              return false;
            },
            keydown(event) {
              if (bolKeyRef.current?.(event.key, event)) {
                event.preventDefault();
                return true;
              }
              if (facade && (event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key))) {
                beforeRef.current?.(facade);
              }
              return false;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (!facade) return;
            if (update.docChanged) {
              changeRef.current?.(update.state.doc.toString());
            }
            if (update.selectionSet || update.docChanged || update.focusChanged) {
              const pos = update.state.selection.main.head;
              posRef.current?.(pos);
              lineRef.current?.(update.state.doc.lineAt(pos).number);
            }
          }),
          EditorView.contentAttributes.of({
            'aria-label': 'Sargam text editor',
            spellcheck: 'false',
            autocapitalize: 'off',
            autocorrect: 'off',
          }),
        ],
      }),
    });
    facade = makeFacade(view);
    viewRef.current = view;
    if (editorRef) editorRef.current = facade;
    const pos = view.state.selection.main.head;
    posRef.current?.(pos);
    lineRef.current?.(view.state.doc.lineAt(pos).number);
    return () => {
      if (editorRef?.current === facade) editorRef.current = null;
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === text) return;
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: text },
      selection: {
        anchor: Math.min(text.length, selection.anchor),
        head: Math.min(text.length, selection.head),
      },
    });
  }, [text]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !bolCapture) return;
    const range = bolCursorSelection(text, bolCapture);
    if (!range) return;
    const selection = view.state.selection.main;
    if (selection.from === range.from && selection.to === range.to) return;
    view.dispatch({
      selection: { anchor: range.from, head: range.to },
      scrollIntoView: true,
    });
  }, [text, bolCapture]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: structureCompartment.reconfigure(showStructure ? [] : hiddenStructure),
    });
  }, [showStructure, structureCompartment]);

  return (
    <div className="app-editor-shell">
      <div className="app-editor-mode" role="group" aria-label="Editor structure visibility">
        <button
          type="button"
          className={!showStructure ? 'active' : ''}
          onClick={() => setShowStructure(false)}
        >Clean</button>
        <button
          type="button"
          className={showStructure ? 'active' : ''}
          onClick={() => setShowStructure(true)}
        >Structure</button>
        <button
          type="button"
          className={`app-bol-capture-toggle${bolCapture ? ' active' : ''}`}
          aria-pressed={Boolean(bolCapture)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onToggleBolCapture?.()}
        >{bolCapture ? 'Bol Capture: ON' : 'Bol Capture'}</button>
        <span
          className={bolCapture ? 'app-bol-capture-help' : ''}
          role={bolCapture ? 'status' : undefined}
          aria-live={bolCapture ? 'polite' : undefined}
        >
          {bolCapture
            ? `WRITING > BOL LINE · holds/repeats mirror notes · ↓ da · ↑ ra · v diri (2 strikes) · ^/c chikari · ←/→ move · Delete erase · Esc direct edit — ${bolMessage || ''}`
            : (showStructure ? 'Generated anchors and audio links are editable.' : 'Generated anchors and audio links are folded.')}
        </span>
      </div>
      <div className="app-editor" ref={mount} />
    </div>
  );
}
