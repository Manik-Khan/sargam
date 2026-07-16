// src/shell/App.jsx — shell: text → parseDocument → renderDocument live per
// keystroke (spec §4), now wired to M2 "keep your music" (spec §7):
// toolbar (New/Open/Save/Recent), Cmd+S, debounced autosave to the
// sargam.current slot, restore-on-load, unsaved dot, and narrated notices
// (Safari download fallback, autosave restore). Save writes the editor text
// verbatim plus the surgical identity edit — never serialize(parse(text)).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { parseDocument } from '../engine/parse.js';
import { ensureIdentity, createStore, createFileIO } from '../engine/files.js';
import { makeClock, makeEnv, openViaInput } from './platform.js';
import EditorPane from './EditorPane.jsx';
import PreviewPane from './PreviewPane.jsx';
import Toolbar from './Toolbar.jsx';
import './sargam.css';

const STARTER = `title: Kahe Ko (khyal) — R. 1732
raga: kirwani
tal: tintal
sa: C#
tempo: 72

Sthayi
@7 ||: .d P | mg R m m | P d N~ 'S | .d - P m | R - :||
" ka- he | ko ma- na na- | hi | ma- ne | re

Vistars
@7 S R | g - - - | - R g m | P -
@7 R m | g - - - | m R g m | P - d - | P -

Tihai
(SR gm P)x3

Krintan (cross-beat)
[[dP/mg/RS]] -

tal: free

Alap
~PS.NRS.N.D N
`;

const NEW_DOC = `tal: tintal

`;

const clock = makeClock();

export default function App() {
  const store = useMemo(() => createStore(window.localStorage, clock), []);
  const io = useMemo(() => createFileIO(makeEnv()), []);

  // Restore-on-load: a crash or accidental close loses nothing (spec §7).
  const restored = useMemo(() => store.loadCurrent(), [store]);
  const [text, setText] = useState(restored ? restored.text : STARTER);
  const [fileName, setFileName] = useState(null);
  const [handle, setHandle] = useState(null);
  // null = no known on-disk state (restored/new docs count as unsaved).
  const [lastSaved, setLastSaved] = useState(restored ? null : STARTER);
  const [notice, setNotice] = useState(() => {
    if (restored) {
      const t = restored.savedAt ? new Date(restored.savedAt).toLocaleString() : '';
      return `Restored from autosave${t ? ` (${t})` : ''} — not yet saved to a file.`;
    }
    if (!io.supportsFSA) {
      return "This browser can't write files in place — each save downloads a copy.";
    }
    return null;
  });
  const [recents, setRecents] = useState(() => store.listRecents());

  const { doc, problems } = useMemo(() => parseDocument(text), [text]);
  const dirty = text !== lastSaved;

  // Debounced autosave: raw text only, never mutated (M2 decision).
  const autosaveTimer = useRef(null);
  useEffect(() => {
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => store.saveCurrent(text), 500);
    return () => clearTimeout(autosaveTimer.current);
  }, [text, store]);

  const suggestName = () => {
    if (fileName) return fileName;
    const title = doc.directives.title;
    if (title) {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
      if (slug) return `${slug}.md`;
    }
    return 'untitled.md';
  };

  const doSave = async () => {
    const withId = ensureIdentity(text, clock);
    let res;
    try {
      res = await io.save(withId.text, { handle, suggestedName: suggestName() });
    } catch (err) {
      setNotice(`Save failed: ${err && err.message ? err.message : err}`);
      return;
    }
    if (!res) return; // user cancelled the picker — nothing written, say nothing
    setText(withId.text);
    setLastSaved(withId.text);
    setHandle(res.handle);
    setFileName(res.name);
    store.recordRecent({ id: withId.id, title: doc.directives.title || null, name: res.name });
    store.saveSnapshot(withId.id, withId.text);
    setRecents(store.listRecents());
    if (res.method === 'download') {
      setNotice(`Saved as a download (${res.name}) — this browser can't write files in place.`);
    } else {
      setNotice(null);
    }
  };

  const confirmDiscard = () =>
    !dirty || window.confirm('You have unsaved changes. Discard them?');

  const doOpen = async () => {
    if (!confirmDiscard()) return;
    let res;
    try {
      res = io.supportsFSA ? await io.open() : await openViaInput();
    } catch (err) {
      setNotice(`Open failed: ${err && err.message ? err.message : err}`);
      return;
    }
    if (!res) return;
    setText(res.text);
    setFileName(res.name);
    setHandle(res.handle);
    setLastSaved(res.text);
    setNotice(null);
  };

  const doNew = () => {
    if (!confirmDiscard()) return;
    setText(NEW_DOC);
    setFileName(null);
    setHandle(null);
    setLastSaved(NEW_DOC);
    setNotice(null);
  };

  const openRecent = (entry) => {
    if (!confirmDiscard()) return;
    const snap = store.loadSnapshot(entry.id);
    if (snap === null) {
      setNotice(`No autosave copy found for “${entry.title || entry.name || entry.id}”.`);
      return;
    }
    setText(snap);
    setFileName(entry.name || null);
    setHandle(null); // snapshots restore content, not the on-disk handle (v1)
    setLastSaved(null);
    setNotice('Restored from the autosaved copy — save to write it back to a file.');
  };

  const removeRecent = (id) => {
    store.removeRecent(id);
    setRecents(store.listRecents());
  };

  // Cmd+S / Ctrl+S.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        doSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="app-root">
      <Toolbar
        fileName={fileName || doc.directives.title || null}
        dirty={dirty}
        recents={recents}
        onNew={doNew}
        onOpen={doOpen}
        onSave={doSave}
        onOpenRecent={openRecent}
        onRemoveRecent={removeRecent}
      />
      {notice && (
        <div className="app-notice">
          <span>{notice}</span>
          <button
            className="app-notice-x"
            aria-label="Dismiss notice"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
      <div className="app-panes">
        <EditorPane text={text} onChange={setText} />
        <PreviewPane doc={doc} />
      </div>
      <div className={'app-problems' + (problems.length ? ' has-problems' : '')}>
        {problems.length === 0 ? (
          <div className="app-problems-ok">No problems.</div>
        ) : (
          problems.map((p, i) => (
            <div className="app-problem" key={i}>
              line {p.line}
              {p.col != null ? `, col ${p.col}` : ''}: {p.msg}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
