// SARGAM_NOTATION_FOLLOWUP_V3_2026_07_18
// src/shell/App.jsx — shell: text → parseDocument → renderDocument live per
// keystroke (spec §4), now wired to M2 "keep your music" (spec §7):
// toolbar (New/Open/Save/Recent), Cmd+S, debounced autosave to the
// sargam.current slot, restore-on-load, unsaved dot, and narrated notices
// (Safari download fallback, autosave restore). Save writes the editor text
// verbatim plus the surgical identity edit — never serialize(parse(text)).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseDocument } from '../engine/parse.js';
import { ensureIdentity, createStore, createFileIO, setDirective } from '../engine/files.js';
import { scheduleDocument, timeFor } from '../engine/schedule.js';
import { documentToMusicXML } from '../engine/western.js';
import { createPlayer, DRONE_MODES } from './audio.js';
import {
  isSoundfontVoice,
  melodyVoiceLabel,
  normalizeMelodyVoice,
} from './voices.js';
import { normalizeToneMap, updateToneMap } from './tone.js';
import { centeredLineScrollTop, sourceLineRange } from './editor-nav.js';
import {
  applyMeterToSelection,
  clearMeterFromSelection,
  parseMeterDocument,
  previewMeterSelection,
} from '../engine/meter.js';
import {
  addAnchorMark,
  parseAnchorDocument,
  removeAnchorMark,
  updateAnchorMark,
} from '../engine/anchors.js';
import {
  addAudioLink,
  attachClipToAudioLink,
  parseAudioLinkDocument,
  recordingMatches,
  removeAudioLink,
  sourceAssetFromAudioLink,
} from '../engine/audio-links.js';
import { makeClock, makeEnv, makeAudioEnv, openViaInput } from './platform.js';
import { createProjectIO } from '../engine/project-files.js';
import {
  clipPathFor,
  createEmptyMediaManifest,
  nextClipId,
  normalizeSourceAsset,
  removeClipAsset,
  upsertClipAsset,
  upsertSourceAsset,
} from '../engine/project-media.js';
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
import PracticeBar from './PracticeBar.jsx';
import ClipVault from './ClipVault.jsx';
import { EMPTY_VILAMBIT_STATE, postVilambitCommand } from './vilambit-bridge.js';
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
  const fileEnv = useMemo(() => makeEnv(), []);
  const io = useMemo(() => createFileIO(fileEnv), [fileEnv]);
  const projectIO = useMemo(() => createProjectIO(fileEnv), [fileEnv]);

  // Restore-on-load: a crash or accidental close loses nothing (spec §7).
  const restored = useMemo(() => store.loadCurrent(), [store]);
  const [text, setText] = useState(restored ? restored.text : STARTER);
  const [fileName, setFileName] = useState(null);
  const [handle, setHandle] = useState(null);
  const [project, setProject] = useState(null);
  const [projectMedia, setProjectMedia] = useState(() => createEmptyMediaManifest());
  const [showClipVault, setShowClipVault] = useState(false);
  const [clipPresence, setClipPresence] = useState({});
  const [extractingClip, setExtractingClip] = useState(false);
  const pendingClipRef = useRef(null);
  const clipAudioRef = useRef({ audio: null, url: null, linkId: null });
  const [linkedPlayback, setLinkedPlayback] = useState(null);
  const linkedPlaybackRef = useRef(null);
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
  const [meterDraft, setMeterDraft] = useState(null);
  const [meterMessage, setMeterMessage] = useState(
    'Select the first through last note of a local meter span.'
  );
  const [anchorTool, setAnchorTool] = useState(null);
  const [anchorMeter, setAnchorMeter] = useState('6');
  const [anchorMessage, setAnchorMessage] = useState(
    'Choose a mark, then click or drag directly on the rendered notation.'
  );
  const [selectedMarkId, setSelectedMarkId] = useState(null);
  const [selectedAudioLinkId, setSelectedAudioLinkId] = useState(null);
  const [vilambitState, setVilambitState] = useState(EMPTY_VILAMBIT_STATE);
  const vilambitStateRef = useRef(EMPTY_VILAMBIT_STATE);
  const editorRef = useRef(null);
  const vilambitRef = useRef(null);
  const jumpSelectionRef = useRef(null);
  const jumpTimerRef = useRef(null);

  const sendVilambit = useCallback((type, payload = {}) => {
    const frameWindow = vilambitRef.current?.contentWindow;
    return postVilambitCommand(frameWindow, type, payload, window.location.origin);
  }, []);

  const setLinkedPlaybackState = useCallback((next) => {
    linkedPlaybackRef.current = next;
    setLinkedPlayback(next);
  }, []);

  const stopExtractedClip = useCallback(() => {
    const current = clipAudioRef.current;
    if (current.audio) {
      current.audio.loop = false;
      current.audio.pause();
      current.audio.removeAttribute('src');
    }
    if (current.url) URL.revokeObjectURL(current.url);
    clipAudioRef.current = { audio: null, url: null, linkId: null };
  }, []);

  const stopLinkedPlayback = useCallback(({ pauseSource = true, announce = false } = {}) => {
    const active = linkedPlaybackRef.current;
    if (!active) return false;
    stopExtractedClip();
    if (pauseSource && active.kind === 'source') sendVilambit('pause');
    setLinkedPlaybackState(null);
    if (announce) setNotice(`Stopped linked ${active.kind === 'clip' ? 'clip' : 'source loop'}.`);
    return true;
  }, [sendVilambit, setLinkedPlaybackState, stopExtractedClip]);

  const { doc, problems } = useMemo(() => parseDocument(text), [text]);
  const meterModel = useMemo(() => parseMeterDocument(text), [text]);
  const anchorModel = useMemo(() => parseAnchorDocument(text), [text]);
  const audioLinkModel = useMemo(() => parseAudioLinkDocument(text), [text]);
  const selectedAudioLink = useMemo(
    () => audioLinkModel.links.find((link) => link.id === selectedAudioLinkId) || null,
    [audioLinkModel.links, selectedAudioLinkId]
  );
  const allProblems = useMemo(
    () => [...problems, ...meterModel.problems, ...anchorModel.problems, ...audioLinkModel.problems],
    [problems, meterModel, anchorModel, audioLinkModel]
  );
  const dirty = text !== lastSaved;

  useEffect(() => {
    let cancelled = false;
    if (!project) {
      setClipPresence({});
      return () => { cancelled = true; };
    }
    Promise.all((projectMedia.clips || []).map(async (clip) => [clip.id, await projectIO.clipExists(project, clip.path)]))
      .then((entries) => { if (!cancelled) setClipPresence(Object.fromEntries(entries)); })
      .catch((error) => { if (!cancelled) setNotice(`Clip Vault check failed: ${error?.message || error}`); });
    return () => { cancelled = true; };
  }, [project, projectIO, projectMedia]);

  useEffect(() => () => {
    stopExtractedClip();
  }, [stopExtractedClip]);

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
  const [toneByVoice, setToneByVoice] = useState(() =>
    normalizeToneMap(store.getPref('melodyToneSettings', null))
  );
  const [melodyVoice, setMelodyVoice] = useState(() =>
    normalizeMelodyVoice(store.getPref('melodyVoice', 'pluck'))
  );
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
    for (const [voice, settings] of Object.entries(toneByVoice)) {
      player.setToneSettings(voice, settings);
    }
    player.setMelodyVoice(melodyVoice);
    player.setDroneMode(droneMode);
    player.setTalaSound(talaSound);
  }, [player]); // restore the saved transport preferences once

  useEffect(() => {
    if (isSoundfontVoice(melodyVoice)) void player.prepareMelodyVoice();
  }, [melodyVoice, player]);

  useEffect(() => {
    player.onCursor((ev) =>
      setPlayCursor({
        sectionIndex: ev.sectionIndex,
        lineIndex: ev.lineIndex,
        matraIndex: ev.matraIndex,
        sourceLine: ev.sourceLine,
      })
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

  const doPlayPause = async () => {
    if (playing) {
      player.pause();
      setPlaying(false);
      setPosition(player.position);
      return;
    }

    // One musical transport owns the speakers at a time. Starting notation
    // playback stops either an extracted linked clip or a Vilambit source loop.
    stopLinkedPlayback();

    // Do not begin a sampled-voice transport while the 30 MB bank is still
    // loading. Starting immediately used the pluck fallback for the opening
    // notes and made the selected instrument appear to enter late.
    if (isSoundfontVoice(player.melodyVoice) && !player.soundfontReady) {
      const label = melodyVoiceLabel(player.melodyVoice);
      setNotice(`Loading ${label} before playback…`);
      const ready = await player.prepareMelodyVoice();
      if (!ready) {
        const detail = player.soundfontError?.message;
        setNotice(
          `${label} could not load${detail ? `: ${detail}` : ''}. ` +
            'Current Pluck will be used as the fallback.'
        );
      }
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
    stopLinkedPlayback();
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
      const styleTarget = el.dom || el;
      const scrollTarget = el.scrollDOM || el;
      const style = window.getComputedStyle(styleTarget);
      let lineHeight = Number.parseFloat(style.lineHeight);
      if (!Number.isFinite(lineHeight)) {
        lineHeight = (Number.parseFloat(style.fontSize) || 14) * 1.7;
      }
      scrollTarget.scrollTop = centeredLineScrollTop({
        line: range.line,
        lineHeight,
        paddingTop: Number.parseFloat(style.paddingTop) || 0,
        clientHeight: scrollTarget.clientHeight,
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
    const next = normalizeMelodyVoice(mode);
    setMelodyVoice(next);
    player.setMelodyVoice(next);
    store.setPref('melodyVoice', next);

    if (isSoundfontVoice(next)) {
      const label = melodyVoiceLabel(next);
      setNotice(`Loading ${label} for its first use…`);
      void player.prepareMelodyVoice().then((ready) => {
        if (ready) {
          setNotice(`${label} is ready.`);
        } else {
          const detail = player.soundfontError?.message;
          setNotice(
            `${label} could not load${detail ? `: ${detail}` : ''}. ` +
              'Current Pluck will be used as the fallback.'
          );
        }
      });
    }
  };

  const doToneChange = (key, value) => {
    setToneByVoice((previous) => {
      const next = updateToneMap(previous, melodyVoice, { [key]: value });
      player.setToneSettings(melodyVoice, next[melodyVoice]);
      store.setPref('melodyToneSettings', next);
      return next;
    });
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

  const mediaWithCurrentSources = (base = projectMedia, links = audioLinkModel.links) => {
    let next = base;
    for (const link of links) {
      const source = sourceAssetFromAudioLink(link);
      if (source) next = upsertSourceAsset(next, source);
    }
    return next;
  };

  const recordSavedDocument = (withId, name) => {
    store.recordRecent({ id: withId.id, title: doc.directives.title || null, name });
    store.saveSnapshot(withId.id, withId.text);
    setRecents(store.listRecents());
  };

  const doSaveProject = async ({ textOverride = text, mediaOverride = projectMedia, quiet = false } = {}) => {
    if (!project) {
      if (!quiet) setNotice('Open or create a Project Folder first.');
      return null;
    }
    const withId = ensureIdentity(textOverride, clock);
    const media = mediaWithCurrentSources(mediaOverride, parseAudioLinkDocument(withId.text).links);
    try {
      await projectIO.save(project, { text: withId.text, media });
    } catch (error) {
      setNotice(`Project save failed: ${error?.message || error}`);
      return null;
    }
    setText(withId.text);
    setLastSaved(withId.text);
    setFileName('composition.md');
    setHandle(null);
    setProjectMedia(media);
    recordSavedDocument(withId, `${project.name}/composition.md`);
    if (!quiet) setNotice(`Saved project folder “${project.name}”.`);
    return { withId, media };
  };

  const doSave = async () => {
    if (project) {
      await doSaveProject();
      return;
    }
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
    recordSavedDocument(withId, res.name);
    if (res.method === 'download') {
      setNotice(`Saved as a download (${res.name}) — this browser can't write files in place.`);
    } else {
      setNotice(null);
    }
  };

  const doNewProject = async () => {
    if (!projectIO.supportsDirectory) {
      setNotice('Project folders are not available in this browser. Plain Markdown open/save still works.');
      return;
    }
    const withId = ensureIdentity(text, clock);
    const media = mediaWithCurrentSources(createEmptyMediaManifest());
    let result;
    try {
      result = await projectIO.create({ text: withId.text, media });
    } catch (error) {
      setNotice(`Could not create project folder: ${error?.message || error}`);
      return;
    }
    if (!result) return;
    if (!result.ok) {
      setNotice(result.message || 'That folder could not be initialized.');
      return;
    }
    stopLinkedPlayback();
    const nextProject = { directory: result.directory, name: result.name };
    setProject(nextProject);
    setProjectMedia(result.media);
    setText(withId.text);
    setLastSaved(withId.text);
    setFileName('composition.md');
    setHandle(null);
    recordSavedDocument(withId, `${result.name}/composition.md`);
    setNotice(`Created project folder “${result.name}” with composition.md, media.json, and clips/.`);
  };

  const doOpenProject = async () => {
    if (!confirmDiscard()) return;
    if (!projectIO.supportsDirectory) {
      setNotice('Project folders are not available in this browser.');
      return;
    }
    let result;
    try {
      result = await projectIO.open();
    } catch (error) {
      setNotice(`Could not open project folder: ${error?.message || error}`);
      return;
    }
    if (!result) return;
    stopLinkedPlayback();
    setProject({ directory: result.directory, name: result.name });
    setProjectMedia(result.media);
    setText(result.text);
    setLastSaved(result.text);
    setFileName('composition.md');
    setHandle(null);
    setSelectedAudioLinkId(null);
    setNotice(result.problems?.length
      ? `Opened “${result.name}” with media warnings: ${result.problems.join('; ')}`
      : `Opened project folder “${result.name}”.`);
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
    stopLinkedPlayback();
    setProject(null);
    setProjectMedia(createEmptyMediaManifest());
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
    stopLinkedPlayback();
    setProject(null);
    setProjectMedia(createEmptyMediaManifest());
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
  // Local meter authoring: the textarea selection supplies the musical range;
  // the app writes exact line-relative matra anchors into a generated >> lane.
  const restoreMeterSelection = (result) => {
    if (!result?.selectionStart && result?.selectionStart !== 0) return;
    const restore = () => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    };
    if (typeof window !== 'undefined' && window.requestAnimationFrame) window.requestAnimationFrame(restore);
    else setTimeout(restore, 0);
  };
  const liveMeterSelection = () => {
    const el = editorRef.current;
    return el ? { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 } : null;
  };
  const doMeterPreview = (value) => {
    const selection = liveMeterSelection();
    if (!selection) return;
    const result = previewMeterSelection(text, selection.start, selection.end, value);
    if (!result.ok) {
      setMeterDraft(null);
      setMeterMessage(result.message);
      return;
    }
    setMeterDraft(result);
    setMeterMessage(result.message || 'Dashed preview: press Enter or Apply to write the meter span.');
  };
  const doMeterApply = (value) => {
    const selection = liveMeterSelection();
    if (!selection) return;
    const result = applyMeterToSelection(text, selection.start, selection.end, value);
    if (!result.ok) {
      setMeterMessage(result.message);
      return;
    }
    setText(result.text);
    setMeterDraft(null);
    setMeterMessage(result.message);
    restoreMeterSelection(result);
  };
  const doMeterClear = () => {
    const selection = liveMeterSelection();
    if (!selection) return;
    const result = clearMeterFromSelection(text, selection.start, selection.end);
    if (!result.ok) {
      setMeterMessage(result.message);
      return;
    }
    setText(result.text);
    setMeterDraft(null);
    setMeterMessage(result.message);
    restoreMeterSelection(result);
  };
  // Shared score-side anchor tools. The rendered notation supplies exact
  // attack/boundary endpoints; the engine writes portable generated metadata.
  const doAnchorGesture = ({ start, end }) => {
    if (!anchorTool) return;
    const result = addAnchorMark(text, {
      kind: anchorTool,
      value: anchorTool === 'meter' ? anchorMeter : undefined,
      start,
      end,
    });
    setAnchorMessage(result.message);
    if (!result.ok) return;
    setText(result.text);
    setSelectedMarkId(result.mark.id);
  };
  const doMoveAnchorMark = (markId, side, endpoint) => {
    const result = updateAnchorMark(text, markId, side, endpoint);
    setAnchorMessage(result.message);
    if (!result.ok) return;
    setText(result.text);
    setSelectedMarkId(markId);
  };
  const doRemoveSelectedMark = () => {
    const result = removeAnchorMark(text, selectedMarkId);
    setAnchorMessage(result.message);
    if (!result.ok) return;
    setText(result.text);
    setSelectedMarkId(null);
  };

  // Vilambit Phase 3A — attach the player's current A–B range to the live
  // CodeMirror selection using repairable musical endpoints. The recording
  // stays in Vilambit; Sargam stores only identity, seconds, and notation.
  const receiveVilambitState = useCallback((state) => {
    const previous = vilambitStateRef.current;
    const active = linkedPlaybackRef.current;
    // A manually-started Vilambit transport owns playback and therefore stops
    // an extracted clip. A linked source session clears when that transport is
    // paused or reaches its end.
    if (active?.kind === 'clip' && !previous.playing && state.playing) {
      stopLinkedPlayback({ pauseSource: false });
    } else if (active?.kind === 'source' && previous.playing && !state.playing) {
      setLinkedPlaybackState(null);
    }
    vilambitStateRef.current = state;
    setVilambitState(state);
  }, [setLinkedPlaybackState, stopLinkedPlayback]);

  const doAttachAudioLoop = (playerState = vilambitState) => {
    const el = editorRef.current;
    if (!el) return;
    const result = addAudioLink(text, {
      player: playerState,
      selectionStart: el.selectionStart ?? 0,
      selectionEnd: el.selectionEnd ?? 0,
    });
    setNotice(result.message);
    if (!result.ok) return;
    setText(result.text);
    setSelectedAudioLinkId(result.link.id);
    const source = sourceAssetFromAudioLink(result.link);
    if (source) setProjectMedia((current) => upsertSourceAsset(current, source));
    const restore = () => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      editor.setSelectionRange(result.selectionStart, result.selectionEnd);
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(restore);
    else setTimeout(restore, 0);
  };

  const activateAudioLink = useCallback(async (link, { play = false } = {}) => {
    if (!link) return;
    setSelectedAudioLinkId(link.id);

    if (play && linkedPlaybackRef.current?.linkId === link.id) {
      stopLinkedPlayback({ announce: true });
      return;
    }

    if (link.clipAssetId && project) {
      const clip = (projectMedia.clips || []).find((item) => item.id === link.clipAssetId);
      if (clip) {
        if (!play) {
          setNotice(`Extracted clip ${clip.id} is ready in “${project.name}”.`);
          return;
        }
        let file = null;
        try {
          file = await projectIO.readClip(project, clip.path);
          setClipPresence((current) => ({ ...current, [clip.id]: true }));
        } catch (error) {
          setClipPresence((current) => ({ ...current, [clip.id]: false }));
          setNotice(`Extracted clip is missing; trying the original recording. ${error?.message || ''}`.trim());
        }
        if (file) {
          try {
            stopLinkedPlayback();
            if (playing) {
              player.pause();
              setPlaying(false);
              setPosition(player.position);
            }
            if (vilambitStateRef.current.loaded && vilambitStateRef.current.playing) sendVilambit('pause');
            const url = URL.createObjectURL(file);
            const audio = new Audio(url);
            audio.loop = true;
            clipAudioRef.current = { audio, url, linkId: link.id };
            audio.addEventListener('error', () => {
              if (clipAudioRef.current.audio !== audio) return;
              stopLinkedPlayback();
              setNotice(`Extracted clip ${clip.id} could not continue playing.`);
            }, { once: true });
            await audio.play();
            setLinkedPlaybackState({
              linkId: link.id,
              clipAssetId: clip.id,
              kind: 'clip',
              startTime: link.startTime,
              endTime: link.endTime,
            });
            setNotice(`Looping extracted clip ${clip.id}. Choose Stop Linked, start another phrase, or use another transport to stop it.`);
            return;
          } catch (error) {
            stopExtractedClip();
            setNotice(`Extracted clip could not play; trying the original recording. ${error?.message || ''}`.trim());
          }
        }
      }
    }

    if (!recordingMatches(link.recording, vilambitStateRef.current)) {
      setNotice(`Load “${link.recording?.name || 'the linked recording'}” in Vilambit to use this phrase.`);
      return;
    }
    stopLinkedPlayback();
    if (play && playing) {
      player.pause();
      setPlaying(false);
      setPosition(player.position);
    }
    sendVilambit('set-loop', { a: link.startTime, b: link.endTime, on: true });
    sendVilambit('seek', { seconds: link.startTime });
    if (play) {
      const sent = sendVilambit('play');
      if (!sent) {
        setNotice('Vilambit is not ready to play the linked source loop.');
        return;
      }
      setLinkedPlaybackState({
        linkId: link.id,
        kind: 'source',
        startTime: link.startTime,
        endTime: link.endTime,
      });
    }
    setNotice(`${play ? 'Looping' : 'Loaded'} linked source range ${link.startTime.toFixed(1)}–${link.endTime.toFixed(1)}s.`);
  }, [
    player, playing, project, projectIO, projectMedia.clips, sendVilambit,
    setLinkedPlaybackState, stopExtractedClip, stopLinkedPlayback,
  ]);

  const receiveVilambitError = useCallback((message) => {
    if (!pendingClipRef.current) return;
    pendingClipRef.current = null;
    setExtractingClip(false);
    setNotice(`Clip extraction failed: ${message}`);
  }, []);

  const doExtractAudioClip = (playerState, link) => {
    if (!project) {
      setNotice('Open or create a Project Folder before extracting clips.');
      return;
    }
    if (!link) {
      setNotice('Select a linked phrase first.');
      return;
    }
    if (!recordingMatches(link.recording, playerState)) {
      setNotice(`Load “${link.recording?.name || 'the linked recording'}” in Vilambit before extracting its clip.`);
      return;
    }
    const requestId = clock.uuid();
    pendingClipRef.current = { requestId, link };
    setExtractingClip(true);
    setNotice(`Extracting ${link.startTime.toFixed(1)}–${link.endTime.toFixed(1)}s as a source-speed WAV…`);
    const sent = sendVilambit('extract-loop', { requestId, a: link.startTime, b: link.endTime });
    if (!sent) {
      pendingClipRef.current = null;
      setExtractingClip(false);
      setNotice('Vilambit is not ready to extract the clip.');
    }
  };

  const receiveExtractedClip = useCallback(async (clipPayload) => {
    const pending = pendingClipRef.current;
    if (!pending || pending.requestId !== clipPayload?.requestId) return;
    if (!project) {
      pendingClipRef.current = null;
      setExtractingClip(false);
      setNotice('The project folder closed before the clip was written.');
      return;
    }
    try {
      const sourceResult = normalizeSourceAsset({
        ...pending.link.recording,
        ...(clipPayload.source || {}),
        id: pending.link.sourceAssetId,
        duration: pending.link.recording?.duration,
      });
      if (!sourceResult.ok) throw new Error(sourceResult.problem);
      let media = upsertSourceAsset(projectMedia, sourceResult.asset);
      const clipId = nextClipId(media);
      const path = clipPathFor(clipId, clipPayload.extension);
      const blob = new Blob([clipPayload.buffer], { type: clipPayload.mimeType });
      await projectIO.writeClip(project, path, blob);
      const clip = {
        id: clipId,
        sourceAssetId: pending.link.sourceAssetId,
        startTime: clipPayload.startTime,
        endTime: clipPayload.endTime,
        path,
        mimeType: clipPayload.mimeType,
        bytes: blob.size,
        createdAt: clock.now(),
      };
      media = upsertClipAsset(media, clip);
      const attached = attachClipToAudioLink(text, pending.link.id, clipId);
      if (!attached.ok) throw new Error(attached.message);
      const withId = ensureIdentity(attached.text, clock);
      await projectIO.save(project, { text: withId.text, media });
      setText(withId.text);
      setLastSaved(withId.text);
      setProjectMedia(media);
      setClipPresence((current) => ({ ...current, [clipId]: true }));
      setSelectedAudioLinkId(pending.link.id);
      recordSavedDocument(withId, `${project.name}/composition.md`);
      setNotice(`Saved ${clipId} to ${path} and attached it to the notation.`);
    } catch (error) {
      setNotice(`Clip extraction failed: ${error?.message || error}`);
    } finally {
      pendingClipRef.current = null;
      setExtractingClip(false);
    }
  }, [project, projectIO, projectMedia, text]);

  const doDeleteUnusedClips = async (clips) => {
    if (!project || !clips?.length) return;
    let media = projectMedia;
    try {
      for (const clip of clips) {
        await projectIO.deleteClip(project, clip.path);
        media = removeClipAsset(media, clip.id);
      }
      await projectIO.save(project, { text, media });
      setProjectMedia(media);
      setNotice(`Deleted ${clips.length} unused clip${clips.length === 1 ? '' : 's'}; linked source ranges were untouched.`);
    } catch (error) {
      setNotice(`Could not delete unused clips: ${error?.message || error}`);
    }
  };

  const doRemoveAudioLink = (id = selectedAudioLinkId) => {
    if (linkedPlaybackRef.current?.linkId === id) stopLinkedPlayback();
    const result = removeAudioLink(text, id);
    setNotice(result.message);
    if (!result.ok) return;
    setText(result.text);
    setSelectedAudioLinkId(null);
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
    stopLinkedPlayback();
    setProject(null);
    setProjectMedia(createEmptyMediaManifest());
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
      if (e.key === ' ' && view === 'notation'
          && !/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)
          && !e.target.isContentEditable
          && !e.target.closest?.('.cm-editor')) {
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
        <ExportView doc={doc} noteNames={noteNames} onClose={() => setShowExport(false)}
  sourceText={text}
  anchorMarks={anchorModel.marks}
/>
      )}
      {showNew && <NewDocDialog onCreate={createDoc} onCancel={() => setShowNew(false)} />}
      {showClipVault && project && (
        <ClipVault
          project={project}
          manifest={projectMedia}
          links={audioLinkModel.links}
          presence={clipPresence}
          onDeleteUnused={doDeleteUnusedClips}
          onClose={() => setShowClipVault(false)}
        />
      )}
      <Toolbar
        fileName={fileName || doc.directives.title || null}
        dirty={dirty}
        recents={recents}
        layout={layout}
        onNew={doNew}
        onOpen={doOpen}
        onSave={doSave}
        projectName={project?.name || null}
        projectSupported={projectIO.supportsDirectory}
        clipCount={projectMedia.clips.length}
        onNewProject={doNewProject}
        onOpenProject={doOpenProject}
        onSaveProject={doSaveProject}
        onClipVault={() => setShowClipVault(true)}
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
        tone={toneByVoice[melodyVoice]}
        droneMode={droneMode}
        talaSound={talaSound}
        onPlayPause={doPlayPause}
        onStop={doStop}
        onBpm={doBpm}
        onLoopMode={doLoopMode}
        onTrackMute={doTrackMute}
        onTrackGain={doTrackGain}
        onMelodyVoice={doMelodyVoice}
        onToneChange={doToneChange}
        onDroneMode={doDroneMode}
        onTalaSound={doTalaSound}
      />

      {view === 'notation' && (
        <PracticeBar
          frameRef={vilambitRef}
          onOpen={() => setView('vilambit')}
          onState={receiveVilambitState}
          onAttachLoop={doAttachAudioLoop}
          projectOpen={Boolean(project)}
          extracting={extractingClip}
          onExtractClip={doExtractAudioClip}
          onClipExtracted={receiveExtractedClip}
          onVilambitError={receiveVilambitError}
          selectedLink={selectedAudioLink}
          linkedPlayback={linkedPlayback}
          onPlayLinked={(link) => activateAudioLink(link, { play: true })}
          onStopLinked={() => stopLinkedPlayback({ announce: true })}
          onRemoveLinked={doRemoveAudioLink}
        />
      )}
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
          ref={vilambitRef}
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
            meterSpans={meterModel.spans}
            meterDraft={meterDraft}
            sourceText={text}
            anchorMarks={anchorModel.marks}
            anchorTool={anchorTool}
            selectedMarkId={selectedMarkId}
            onAnchorGesture={doAnchorGesture}
            onSelectMark={setSelectedMarkId}
            onMoveMark={doMoveAnchorMark}
            audioLinks={audioLinkModel.links}
            selectedAudioLinkId={selectedAudioLinkId}
            onActivateAudioLink={activateAudioLink}
          
          /><div className="app-editor-col">
            <CommandBar
            onApply={doCommand}
            anchorTool={anchorTool}
            onAnchorTool={setAnchorTool}
            anchorMeter={anchorMeter}
            onAnchorMeter={setAnchorMeter}
            onRemoveSelectedMark={doRemoveSelectedMark}
            anchorMessage={anchorMessage}
          />
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
  <ProblemsPanel problems={allProblems} text={text} editorRef={editorRef} />
    </div>
  );
}
