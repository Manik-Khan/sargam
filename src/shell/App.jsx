// SARGAM_NOTATION_FOLLOWUP_V3_2026_07_18
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
import { createPlayer, DRONE_MODES, MELODY_VOICES } from './audio.js';
import { centeredLineScrollTop, sourceLineRange } from './editor-nav.js';
import { makeClock, makeEnv, makeAudioEnv, openViaInput } from './platform.js';
import Transport from './Transport.jsx';
import DictateBar from './DictateBar.jsx';
import CommandBar from './CommandBar.jsx';
import Legend from './Legend.jsx';
import EditorPane from './EditorPane.jsx';
import PreviewPane from './PreviewPane.jsx';
import Toolbar from './Toolbar.jsx';
import NewDocDialog from './NewDocDialog.jsx';
import ExportView from './ExportView.jsx';
import ProblemsPanel from './ProblemsPanel.jsx';
import { BAGESHRI_STARTER } from '../examples/bageshri.js';
import './sargam.css';

const STARTER = BAGESHRI_STARTER;

const clock = makeClock();

const prefGain = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
};

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
  const [showLegend, setShowLegend] = useState(false);
  // 'notation' | 'vilambit' — Vilambit (M's practice player, slow-without-
  // pitch-change) lives in an ALWAYS-MOUNTED iframe, hidden with CSS when
  // on the notation tab, never unmounted: the recording keeps looping
  // while you notate (M, 2026-07-16 — the transcription workflow).
  const [view, setView] = useState('notation');
  const [cursorPos, setCursorPos] = useState(0);
  const editorRef = useRef(null);
  const jumpSelectionRef = useRef(null);
  const jumpTimerRef = useRef(null);

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
  const [volumes, setVolumes] = useState(() => ({
    melody: prefGain(store.getPref('volumeMelody', 0.4), 0.4),
    tick: prefGain(store.getPref('volumeTala', 0.25), 0.25),
    drone: prefGain(store.getPref('volumeTanpura', 0.16), 0.16),
  }));
  const [melodyVoice, setMelodyVoice] = useState(() => {
    const saved = store.getPref('melodyVoice', 'pluck');
    return MELODY_VOICES.includes(saved) ? saved : 'pluck';
  });
  const [droneMode, setDroneMode] = useState(() => {
    const saved = store.getPref('droneMode', 'off');
    return DRONE_MODES.includes(saved) ? saved : 'off';
  });
  const [talaSound, setTalaSound] = useState(() => {
    const saved = store.getPref('talaSound', 'click');
    return ['click', 'tabla', 'off'].includes(saved) ? saved : 'click';
  });
  const bpm = Number(doc.directives.tempo) || 60;

  useEffect(() => {
    // Text edits reshape time; stop rather than play a stale schedule.
    player.load(schedule);
    setPlaying(false);
    setPlayCursor(null);
    setPosition(0);
  }, [schedule, player]);

  useEffect(() => {
    player.setGain('melody', volumes.melody);
    player.setGain('tick', volumes.tick);
    player.setGain('drone', volumes.drone);
    player.setMuted('melody', mutes.melody);
    player.setMuted('tick', mutes.tick);
    player.setMelodyVoice(melodyVoice);
    player.setDroneMode(droneMode);
    player.setTalaSound(talaSound);
  }, [player]); // restore the saved transport preferences once

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
  const rangeFor = (mode, sourceLine = activeLine) => {
    const starts = schedule.lineStarts;
    if (starts.length === 0) return null;
    let idx = starts.findIndex((l) => l.sourceLine === sourceLine);
    if (idx === -1) {
      idx = 0;
      for (let i = 0; i < starts.length; i++) if (starts[i].sourceLine <= sourceLine) idx = i;
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

  const clearJumpSelection = (el, collapse = true) => {
    const jump = jumpSelectionRef.current;
    if (!jump || !el) return;
    if (collapse && el.selectionStart === jump.start && el.selectionEnd === jump.end) {
      el.setSelectionRange(jump.caret, jump.caret);
    }
    jumpSelectionRef.current = null;
    clearTimeout(jumpTimerRef.current);
  };

  const focusSourceLine = (sourceLine) => {
    const range = sourceLineRange(text, sourceLine);
    const reveal = () => {
      const el = editorRef.current;
      if (!el) return;
      clearJumpSelection(el, false);

      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
      el.setSelectionRange(range.start, range.end);
      const style = window.getComputedStyle(el);
      let lineHeight = Number.parseFloat(style.lineHeight);
      if (!Number.isFinite(lineHeight)) {
        lineHeight = (Number.parseFloat(style.fontSize) || 14) * 1.7;
      }
      el.scrollTop = centeredLineScrollTop({
        line: range.line,
        lineHeight,
        paddingTop: Number.parseFloat(style.paddingTop) || 0,
        clientHeight: el.clientHeight,
      });

      jumpSelectionRef.current = { ...range, caret: range.start };
      jumpTimerRef.current = setTimeout(() => clearJumpSelection(el), 1400);
      setCursorPos(range.start);
    };

    if (window.requestAnimationFrame) window.requestAnimationFrame(reveal);
    else setTimeout(reveal, 0);
  };

  const doSeek = (sourceLine, matraIndex) => {
    setActiveLine(sourceLine);
    focusSourceLine(sourceLine);
    const t = timeFor(schedule, sourceLine, matraIndex);
    setPosition(t);
    if (playing) {
      player.pause();
      const range = loopMode === 'off' ? null : rangeFor(loopMode, sourceLine);
      player.setLoop(range);
      player.play({ from: t });
    }
  };

  const doTrackMute = (track, value) => {
    setMutes((prev) => ({ ...prev, [track]: value }));
    player.setMuted(track, value);
  };

  const doTrackGain = (track, value) => {
    const fallback = track === 'melody' ? 0.4 : track === 'drone' ? 0.16 : 0.25;
    const next = prefGain(value, fallback);
    setVolumes((prev) => ({ ...prev, [track]: next }));
    player.setGain(track, next);
    const key =
      track === 'melody'
        ? 'volumeMelody'
        : track === 'drone'
          ? 'volumeTanpura'
          : 'volumeTala';
    store.setPref(key, next);
  };

  const doMelodyVoice = (mode) => {
    const next = MELODY_VOICES.includes(mode) ? mode : 'pluck';
    setMelodyVoice(next);
    player.setMelodyVoice(next);
    store.setPref('melodyVoice', next);
  };

  const doDroneMode = (mode) => {
    const next = DRONE_MODES.includes(mode) ? mode : 'off';
    setDroneMode(next);
    player.setDroneMode(next);
    store.setPref('droneMode', next);
  };

  const doTalaSound = (mode) => {
    const next = ['click', 'tabla', 'off'].includes(mode) ? mode : 'click';
    setTalaSound(next);
    player.setTalaSound(next);
    store.setPref('talaSound', next);
    if (next === 'tabla') {
      void player.prepareTalaSound().then((ready) => {
        if (!ready) {
          setNotice('Tabla samples could not be loaded — the tala track will use the click instead.');
        }
      });
    }
  };

  const doEditorBeforeEdit = (el) => clearJumpSelection(el);

  useEffect(() => () => clearTimeout(jumpTimerRef.current), []);

  // Debounced autosave: raw text only, never mutated (M2 decision).
  const autosaveTimer = useRef(null);
  useEffect(() => {
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => store.saveCurrent(text), 500);
    return () => clearTimeout(autosaveTimer.current);
  }, [text, store]);

  const suggestName = () => {
    if (fileName) return fileName;
    const title = doc.directives.title || doc.directives.raga;
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
    // Read the LIVE caret from the textarea — browsers keep selectionStart
    // even while focus is on the dictate field. The tracked state was
    // stale until the first click, so inserts landed at position 0, inside
    // the frontmatter ("it input a different line" — M, 2026-07-16).
    const live = editorRef.current ? editorRef.current.selectionStart : null;
    let pos = Math.min(live ?? cursorPos, text.length);
    // Never inserted a caret at all? Append at the end on its own line
    // rather than silently corrupting the header.
    if (pos === 0 && text.length > 0) pos = text.length;
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

  // Selection command: transform the editor's live selection through a
  // pure engine function (commands.js), keep the result selected so
  // commands stack (slide, then octave up, then repeat...).
  const doCommand = (fn) => {
    const el = editorRef.current;
    if (!el) return;
    const a = el.selectionStart ?? 0;
    const b = el.selectionEnd ?? a;
    const replaced = fn(text.slice(a, b));
    setText(text.slice(0, a) + replaced + text.slice(b));
    const restore = () => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      editorRef.current.setSelectionRange(a, a + replaced.length);
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
      if (e.key === ' ' && view === 'notation' && !/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) {
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
        onLegend={() => setShowLegend((v) => !v)}
        view={view}
        onView={setView}
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
        volumes={volumes}
        melodyVoice={melodyVoice}
        droneMode={droneMode}
        talaSound={talaSound}
        onPlayPause={doPlayPause}
        onStop={doStop}
        onBpm={doBpm}
        onLoopMode={doLoopMode}
        onTrackMute={doTrackMute}
        onTrackGain={doTrackGain}
        onMelodyVoice={doMelodyVoice}
        onDroneMode={doDroneMode}
        onTalaSound={doTalaSound}
      />
      {showLegend && view === 'notation' && <Legend onClose={() => setShowLegend(false)} />}
      {showDictate && (
        <DictateBar
          raga={doc.directives.raga}
          onInsert={doDictateInsert}
          onClose={() => setShowDictate(false)}
        />
      )}
      {/* Both views live on one stage, both always mounted at full size.
          The inactive one is veiled (visibility), never display:none —
          Vilambit measures its own width at startup and must keep playing
          while you notate on the other tab. `allow="autoplay"` is
          REQUIRED: it drives a <video> through createMediaElementSource,
          and a frame without that permission simply cannot start it. */}
      <div className="app-stage">
        <iframe
          title="Vilambit — practice player"
          src="vilambit.html"
          allow="autoplay; fullscreen; encrypted-media; clipboard-read; clipboard-write"
          className={'app-vilambit' + (view === 'vilambit' ? '' : ' app-veiled')}
        />
        <div
          className={
            'app-panes app-layout-' + layout + (view === 'vilambit' ? ' app-veiled' : '')
          }
        >
          <PreviewPane
            doc={doc}
            activeLine={activeLine}
            activeCursor={playCursor}
            noteNames={noteNames}
            onSeek={doSeek}
          />
          <div className="app-editor-col">
            <CommandBar onApply={doCommand} />
            <EditorPane
              text={text}
              onChange={setText}
              onCursorLine={setActiveLine}
              onCursorPos={setCursorPos}
              onBeforeEdit={doEditorBeforeEdit}
              editorRef={editorRef}
            />
          </div>
        </div>
      </div>
  <ProblemsPanel problems={problems} text={text} editorRef={editorRef} />
    </div>
  );
}
