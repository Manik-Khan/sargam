// src/shell/App.jsx — shell: text → parseDocument → renderDocument live per
// keystroke (spec §4), now wired to M2 "keep your music" (spec §7):
// toolbar (New/Open/Save/Recent), Cmd+S, debounced autosave to the
// sargam.current slot, restore-on-load, unsaved dot, and narrated notices
// (Safari download fallback, autosave restore). Save writes the editor text
// verbatim plus the surgical identity edit — never serialize(parse(text)).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { parseDocument } from '../engine/parse.js';
import { ensureIdentity, createStore, createFileIO, setDirective } from '../engine/files.js';
import { scheduleDocument, timeFor } from '../engine/schedule.js';
import { documentToMusicXML } from '../engine/western.js';
import { createPlayer } from './audio.js';
import { makeClock, makeEnv, makeAudioEnv, openViaInput } from './platform.js';
import Transport from './Transport.jsx';
import DictateBar from './DictateBar.jsx';
import EditorPane from './EditorPane.jsx';
import PreviewPane from './PreviewPane.jsx';
import Toolbar from './Toolbar.jsx';
import NewDocDialog from './NewDocDialog.jsx';
import ExportView from './ExportView.jsx';
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
  const [activeLine, setActiveLine] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [layout, setLayout] = useState(() => store.getPref('layout', 'side'));
  const [noteNames, setNoteNames] = useState(() => store.getPref('noteNames', 'sargam'));
  const [showDictate, setShowDictate] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const editorRef = useRef(null);

  const { doc, problems } = useMemo(() => parseDocument(text), [text]);
  const dirty = text !== lastSaved;

  // ---- playback (M3) ----
  const player = useMemo(() => createPlayer(makeAudioEnv()), []);
  const schedule = useMemo(() => scheduleDocument(doc), [doc]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [playCursor, setPlayCursor] = useState(null);
  const [loopMode, setLoopMode] = useState('off');
  const [mutes, setMutes] = useState({ melody: false, tick: false });
  const bpm = Number(doc.directives.tempo) || 60;

  useEffect(() => {
    // Text edits reshape time; stop rather than play a stale schedule.
    player.load(schedule);
    setPlaying(false);
    setPlayCursor(null);
    setPosition(0);
  }, [schedule, player]);

  useEffect(() => {
    player.onCursor((ev) =>
      setPlayCursor({ sectionIndex: ev.sectionIndex, lineIndex: ev.lineIndex, matraIndex: ev.matraIndex })
    );
    player.onEnded(() => {
      setPlaying(false);
      setPlayCursor(null);
    });
  }, [player]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setPosition(player.position), 200);
    return () => clearInterval(id);
  }, [playing, player]);

  // The loop range and start point come from the text cursor's line — the
  // same machinery the landing report rides.
  const rangeFor = (mode) => {
    const starts = schedule.lineStarts;
    if (starts.length === 0) return null;
    let idx = starts.findIndex((l) => l.sourceLine === activeLine);
    if (idx === -1) {
      idx = 0;
      for (let i = 0; i < starts.length; i++) if (starts[i].sourceLine <= activeLine) idx = i;
    }
    const cur = starts[idx];
    if (mode === 'line') {
      const next = starts[idx + 1];
      return { from: cur.t, to: next ? next.t : schedule.duration };
    }
    if (mode === 'section') {
      let a = idx;
      while (a > 0 && starts[a - 1].sectionIndex === cur.sectionIndex) a--;
      let b = idx;
      while (b + 1 < starts.length && starts[b + 1].sectionIndex === cur.sectionIndex) b++;
      const next = starts[b + 1];
      return { from: starts[a].t, to: next ? next.t : schedule.duration };
    }
    return null;
  };

  const doPlayPause = () => {
    if (playing) {
      player.pause();
      setPlaying(false);
      setPosition(player.position);
      return;
    }
    const range = loopMode === 'off' ? null : rangeFor(loopMode);
    player.setLoop(range);
    const from =
      position > 0 && (!range || (position >= range.from && position < range.to))
        ? position
        : range
          ? range.from
          : (rangeFor('line')?.from ?? 0);
    if (player.play({ from })) setPlaying(true);
  };

  const doStop = () => {
    player.stop();
    setPlaying(false);
    setPlayCursor(null);
    setPosition(0);
  };

  const doBpm = (v) => {
    // The knob writes the directive — text is the source of truth (M).
    const r = setDirective(text, 'tempo', String(v));
    if (r.changed) setText(r.text);
  };

  const doLoopMode = (m) => {
    setLoopMode(m);
    if (playing) player.setLoop(m === 'off' ? null : rangeFor(m));
  };

  // Click in the notation: move the play position (and the working line —
  // loop and landing reports follow the same cursor).
  // MusicXML: the notation on a Western staff, in any notation program.
  // Uses the same download shim as the Safari save path.
  const doExportXML = () => {
    try {
      const xml = documentToMusicXML(doc);
      const base = (fileName || doc.directives.raga || 'sargam').replace(/\.(md|txt)$/i, '');
      makeEnv().download(`${base}.musicxml`, xml);
      setNotice(`Exported ${base}.musicxml — opens in MuseScore, Sibelius, Dorico or Finale.`);
    } catch (err) {
      setNotice(`MusicXML export failed: ${err && err.message ? err.message : err}`);
    }
  };

  const doSeek = (sourceLine, matraIndex) => {
    setActiveLine(sourceLine);
    const t = timeFor(schedule, sourceLine, matraIndex);
    setPosition(t);
    if (playing) {
      player.pause();
      const range = loopMode === 'off' ? null : rangeFor(loopMode);
      player.setLoop(range);
      player.play({ from: t });
    }
  };

  const doTrackMute = (track, v) => {
    setMutes((prev) => ({ ...prev, [track]: v }));
    player.setMuted(track, v);
  };

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
    setShowNew(true);
  };

  // The form (or "Blank document") hands back the text it wrote.
  const createDoc = (newText) => {
    setShowNew(false);
    setText(newText);
    setFileName(null);
    setHandle(null);
    setLastSaved(newText);
    setNotice(null);
  };

  const toggleNoteNames = () => {
    const next = noteNames === 'sargam' ? 'western' : 'sargam';
    setNoteNames(next);
    store.setPref('noteNames', next);
  };

  // Dictation inserts at the text cursor — the notation it writes is
  // ordinary Sargam text, editable by hand like everything else.
  const doDictateInsert = (snippet) => {
    const pos = Math.min(cursorPos, text.length);
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const next = before + pad + snippet + after;
    setText(next);
    const caret = pos + pad.length + snippet.length;
    setCursorPos(caret);
    // Restore the caret after React commits. Guarded: the insert itself
    // must never depend on rAF existing (nothing here may throw).
    const restore = () => {
      const el = editorRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    };
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(restore);
    } else {
      setTimeout(restore, 0);
    }
  };

  const toggleLayout = () => {
    const next = layout === 'side' ? 'stacked' : 'side';
    setLayout(next);
    store.setPref('layout', next);
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

  // Cmd+S / Ctrl+S; Space = play/pause when not typing in a field.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        doSave();
        return;
      }
      if (e.key === ' ' && !/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) {
        e.preventDefault();
        doPlayPause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={'app-root' + (showExport ? ' is-exporting' : '')}>
      {showExport && (
        <ExportView doc={doc} noteNames={noteNames} onClose={() => setShowExport(false)} />
      )}
      {showNew && <NewDocDialog onCreate={createDoc} onCancel={() => setShowNew(false)} />}
      <Toolbar
        fileName={fileName || doc.directives.title || null}
        dirty={dirty}
        recents={recents}
        layout={layout}
        onNew={doNew}
        onOpen={doOpen}
        onSave={doSave}
        onExport={() => setShowExport(true)}
        onExportXML={doExportXML}
        noteNames={noteNames}
        onToggleNoteNames={toggleNoteNames}
        onDictate={() => setShowDictate((v) => !v)}
        onToggleLayout={toggleLayout}
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
      <Transport
        playing={playing}
        position={position}
        duration={schedule.duration}
        bpm={bpm}
        loopMode={loopMode}
        tracks={mutes}
        onPlayPause={doPlayPause}
        onStop={doStop}
        onBpm={doBpm}
        onLoopMode={doLoopMode}
        onTrackMute={doTrackMute}
      />
      {showDictate && (
        <DictateBar
          raga={doc.directives.raga}
          onInsert={doDictateInsert}
          onClose={() => setShowDictate(false)}
        />
      )}
      <div className={'app-panes app-layout-' + layout}>
        <PreviewPane
          doc={doc}
          activeLine={activeLine}
          activeCursor={playCursor}
          noteNames={noteNames}
          onSeek={doSeek}
        />
        <EditorPane
          text={text}
          onChange={setText}
          onCursorLine={setActiveLine}
          onCursorPos={setCursorPos}
          editorRef={editorRef}
        />
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
