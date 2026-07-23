# Sargam — Next Session Context & Handoff

**Updated:** 2026-07-23, after acceptance of local projects, extracted clips, clip-loop editing, and portable `.sargam` packages; through Vilambit Source Workspace Wave 1C preparation
**Immediate gate:** browser-accept Wave 1C layout consolidation
**Next engineering phase:** Vilambit Source Workspace Wave 2 — project-native per-source workspace
**Project:** Sargam notation editor/player + Vilambit transcription/practice player
**Owner and musical authority:** Manik Khan
**Assistant name:** Quill / Q
**Supersedes:** `SARGAM_NEXT_SESSION_CONTEXT_2026-07-21_CLIP_VAULT_PORTABLE_PROJECTS.md` and all older current-state paragraphs

## 1. Read this first

Sargam has crossed three major product thresholds:

1. linked notation can retain and restore exact Vilambit source ranges;
2. those ranges can become durable, refined extracted clips inside a local project;
3. the complete editable/listenable project can travel as one `.sargam` package and reopen without the original master recording.

The next bottleneck is no longer media portability. It is preserving the full Vilambit transcription workspace per source recording and making the player architecture reusable for both Sargam and a future standalone FileMaker/library player.

Read this file, then inspect the actual clone:

```text
~/Documents/GitHub/sargam
```

The clone is authoritative. Do not reconstruct source from this prose or old patch chains.

---

## 2. Session-start gate

Start with:

```bash
cd ~/Documents/GitHub/sargam
git status --short
npm run smoke
npm run build
```

Record the actual count before editing. The later Vilambit waves were browser-tested and had focused/static checks, but no authoritative post-Wave-1C full smoke/build count was recorded in chat. Do not repeat an older count as though it were current.

Also confirm whether Wave 1C has been applied and browser-accepted. Its patch only changes:

```text
public/vilambit.html
public/vilambit/vilambit.css
```

If the current clone does not yet show one **Playback** card, one **Loop & Markers** card, and collapsed **Advanced tuning**, Wave 1C is not present.

---

## 3. Browser-accepted and working — preserve these

### A. Notation geometry and linked audio

Do not casually reopen the accepted Diri, meter, repeated-slide, repeat-sign, playback-cursor, Preview, Export, or print geometry.

Preserve the Phase 3A workflow:

1. load a source recording in Vilambit;
2. set A–B;
3. select notation in CodeMirror;
4. attach the loop;
5. store a versioned `sargam-audio-links:v1` record in folded Markdown-safe metadata;
6. restore/seek/play from linked notation;
7. remove the link without rewriting unrelated notation.

### B. Local project folders and media contracts

Working local project structure:

```text
Project Folder/
├── composition.md
├── media.json
└── clips/
    └── clip-....*
```

Preserve:

- explicit user-approved directory access;
- stable source/clip IDs;
- plain Markdown notation as source of truth;
- binary clips outside Markdown and JSON;
- source-range retention even if a clip is missing or deleted;
- graceful playback fallback:

```text
valid extracted clip
→ loaded original source A–B
→ locate/reload source
```

The full recording never supersedes a valid extracted clip merely because it was reloaded.

### C. Extraction and linked clip transport

Manik confirmed both extraction paths in real use:

- decodable audio uses the fast local slice path;
- a long MP4 can use real-time source-speed/source-pitch capture.

Preserve:

- **Extract Clip** only after a project and linked range exist;
- the clip survives a hard refresh;
- extracted linked playback loops until stopped;
- **Play Linked** / **Stop Linked** transport state;
- other musical transports stop or yield cleanly;
- source A–B remains available for context and re-extraction.

### D. Clip Loop Editor

Manik reported that the refined clip looper is working well.

Preserve:

- decoded Web Audio clip playback;
- non-destructive `loopStart` / `loopEnd` in media data;
- draggable waveform boundaries;
- ±10 ms and ±100 ms nudging;
- continuous preview;
- reset;
- short seam smoothing / zero-crossing assistance;
- source reopening when more material is needed;
- context padding on newer extractions so boundaries can move in both directions.

### E. Portable `.sargam` projects

Browser acceptance is complete: Manik exported a `.sargam` project, opened it in a new session and folder, and confirmed that the linked clip worked without the master recording.

Preserve:

```text
Project.sargam
├── manifest.json
├── composition.md
├── media.json
└── clips/
```

- one-file import/export;
- independent-copy behavior;
- no silent overwrite;
- exact notation preservation;
- clip and loop-region preservation;
- safe package path/version/checksum/size validation;
- local/offline use without accounts or Cloudinary.

---

## 4. Current Vilambit Source Workspace state

### Wave 1 — waveform window and precise boundaries

Implemented:

- visible source time window independent of total recording duration;
- Zoom In/Out, Fit Loop, Show All;
- pan backward/forward;
- Ctrl/Cmd+wheel zoom and Shift+wheel pan;
- optional Follow Playhead;
- visible window start/end/duration;
- all waveform hit-testing and drawing translated through the visible window;
- editable A/B timecodes;
- ±10 ms / ±100 ms nudges;
- millisecond loop-duration display.

For long MP4/video that cannot expose a decoded buffer, timeline navigation remains accurate even if detailed waveform peaks are not yet available.

### Wave 1B — marker/loop workflow

Implemented:

- marker timestamp click seeks;
- marker **Set A**;
- marker **Set B**;
- marker **Loop → next**;
- Shift-click marker sets A;
- Option/Alt-click marker sets B;
- marker time is copied into A/B rather than creating hidden permanent binding.

Correction added afterward:

- **A → Marker** saves the exact current A boundary;
- **B → Marker** saves the exact current B boundary;
- playback does not move;
- near-duplicate markers are not added repeatedly.

### Wave 1C — layout consolidation candidate

Prepared and syntactically verified, but browser acceptance should be recorded explicitly after application.

Expected interface:

- waveform navigation remains in the waveform header;
- Speed + Pitch become one **Playback** card;
- Loop + Markers become one **Loop & Markers** card;
- Tuning becomes collapsed **Advanced tuning**;
- primary cards receive more width on larger screens;
- responsive internal grids become one column on narrower screens.

Do not continue stacking features into the old crowded card layout. First confirm that Wave 1C solves the screenshot-level crowding at Manik's normal browser width.

---

## 5. Next phase — Source Workspace Wave 2

The standalone Vilambit session JSON already knows much of this state, but Sargam projects do not yet automatically own and restore the complete workspace per source.

Add a versioned, pure-data workspace keyed by `sourceAssetId`, for example:

```json
{
  "version": 1,
  "sources": {
    "source-...": {
      "lastPosition": 3041.2,
      "loop": {
        "a": 3039.0,
        "b": 3046.8,
        "on": true
      },
      "tempoPercent": 75,
      "pitchSemitones": 0,
      "pitchCents": -8,
      "markers": [],
      "bpm": null,
      "speedRegions": [],
      "waveformView": {
        "start": 3025.0,
        "end": 3060.0,
        "followPlayhead": false
      }
    }
  }
}
```

### Binding requirements

- Workspace belongs to the source asset, not to one global player.
- A browser file handle is not portable workspace JSON.
- Restore state only after matching the intended source identity.
- Do not silently apply one recording's markers/settings to another file with the same name.
- Save workspace with the local project automatically.
- Include workspace in `.sargam` export/import.
- Preserve unknown future workspace fields where safe.
- Project opening without the original source should still restore clip playback and retain the missing source's workspace for later reconnection.
- Debounce writes; do not write the project folder on every animation frame or playhead tick.

### Likely storage choice

Prefer a separate versioned file such as:

```text
workspace.json
```

rather than overloading `media.json` with rapidly changing UI state. Confirm the final contract with smokes before wiring UI.

---

## 6. Wave 3 — sources and large-file optimization

After workspace persistence is solid:

### Sources panel

```text
Lesson recording.mp4       Located
Concert reference.mov      Missing — Locate…
Exercise demonstration.wav Located
```

Needed actions:

- select source;
- locate/reconnect;
- switch without losing the current source workspace;
- resume each source at its saved position;
- display missing/located state;
- warn on identity mismatch;
- never accept filename alone as proof.

### Waveform peak cache

Long/streamed media needs a lightweight visualization cache, not a duplicate master recording.

Potential project structure:

```text
waveforms/
└── source-....peaks
```

Requirements:

- versioned and regenerable;
- bounded size;
- safe to include optionally in `.sargam` packages;
- does not become source identity;
- supports zoomed visible-window rendering for media that cannot be fully decoded in memory.

### Reliability cleanup

Inspect before deleting, then remove confirmed unused duplicates such as:

```text
public/vilambit/vilambit-app 2.js
src/shell/PracticeBar 2.jsx
smokes/vilambit-bridge.smoke 2.js
```

Also verify cleanup of old object URLs, decoded buffers, capture nodes, and source resources when replacing recordings or projects.

---

## 7. Shared Vilambit Core and standalone library player

The future standalone player should not be a copied `vilambit.html` that drifts away from Sargam.

Target architecture:

```text
Vilambit Core
├── media loading / transport
├── Signalsmith / fallback processing
├── waveform windows and peak sources
├── loop and marker operations
├── per-source workspace
└── queue / playlist controller

Sargam shell
├── iframe bridge
├── notation audio links
├── clip extraction / Clip Vault
└── project and `.sargam` integration

Library shell
├── stable URL / library-record loading
├── queue and playlists
├── listening-session reset
└── optional FileMaker communication
```

Do not undertake a full React/native Vilambit redesign yet. The existing iframe is stable and preserves ongoing playback because it remains mounted at full size and is hidden with `visibility`, never `display:none`.

---

## 8. FileMaker / local-network direction

Context supplied by Manik:

- the musical catalog is digitized and run through FileMaker;
- recordings live on a server and are accessed over the local network;
- the player must work on an older Windows machine;
- the standalone version primarily needs playback, pitch, tempo, looping, markers, workspace, and playlists — not Sargam notation or clip extraction.

Preferred experience:

```text
FileMaker record
→ Open in Vilambit
→ browser URL with stable library/record ID
→ server resolves the media URL
→ Vilambit opens or queues the recording
```

Use a stable library ID rather than a raw network path as the public identity. The player and media should ideally be served in a browser-friendly local-network arrangement that supports seeking into long recordings.

Before choosing syntax/build targets, record:

- exact Windows version;
- exact FileMaker version;
- available browser and version;
- current media-server URLs/headers and authentication requirements;
- codecs present in the archive.

Older-Windows compatibility must be tested on the actual machine; do not assume modern browser APIs are available.

---

## 9. Playlist and queue — approved product direction

The queue is separate from the current recording. Adding or removing future tracks must not interrupt playback.

Required eventual actions:

```text
Add to Queue
Play Next
Play Later
Remove
Drag to Reorder
Previous / Next
Repeat Track
Repeat Queue
Shuffle
Clear Queue
Reset Session
```

Distinguish:

```text
Queue          temporary listening session
Saved Playlist named reusable collection
```

- **Clear Queue** removes upcoming items but does not necessarily stop the current recording.
- **Reset Session** stops playback and clears temporary queue, loop, unsaved markers, speed/pitch, and transient session state; it must not delete saved playlists.
- Each track should retain its own workspace.
- Infinite A–B looping cannot naturally advance; add explicit “loop N times” or “loop for N minutes, then continue” behavior.

This queue controller should also become the foundation for Sargam Practice Sets rather than creating two unrelated sequence engines.

---

## 10. Practice Set Builder — approved, later UI phase

The current `src/engine/practice-sets.js` foundation anticipates reusable routines. The eventual builder should support:

- ordered clip/phrase sequence;
- fixed repetitions;
- target minutes;
- ascending or descending speed ladders;
- change speed after N repetitions;
- rests between passes;
- repeat whole set;
- teacher-authored routines stored inside `.sargam` packages.

Example:

```text
Phrase 1 — 5 repetitions at 60%
Phrase 2 — 3 repetitions at 70%
Phrase 3 — 2 minutes, +5% every 4 repetitions
Rest 10 seconds
Repeat the set twice
```

Do not build this UI before per-source workspace and the shared queue/transport contract are stable.

---

## 11. Relevant source spine

Current areas to inspect before Wave 2:

```text
public/vilambit.html
public/vilambit/vilambit.css
public/vilambit/vilambit-app.js
public/vilambit/vilambit-core.js

src/engine/audio-links.js
src/engine/project-media.js
src/engine/project-files.js
src/engine/portable-project.js
src/engine/clip-loop.js
src/engine/practice-sets.js

src/shell/vilambit-bridge.js
src/shell/clip-audio.js
src/shell/audio-link-overlay.js

smokes/vilambit-source-workspace.smoke.js
smokes/vilambit-marker-loop.smoke.js
smokes/project-media.smoke.js
smokes/project-files.smoke.js
smokes/portable-project.smoke.js
smokes/practice-sets.smoke.js
```

Read actual imports and source contracts before editing. Do not infer behavior from file names alone.

---

## 12. Do not do next

- Do not rewrite the stable iframe integration into React merely for aesthetic consistency.
- Do not merge workspace state into notation Markdown.
- Do not serialize browser file handles into portable project data.
- Do not let workspace writes fire on every playback animation frame.
- Do not silently reconnect a missing source by matching filename only.
- Do not make waveform peaks the source of truth.
- Do not create a separate copied standalone player that must be maintained independently.
- Do not begin cloud collaboration before local workspace, source switching, and shared player contracts are stable.
- Do not build the full Practice Set UI before the common queue/transport foundation.
- Do not reopen accepted notation geometry without a concrete regression.
- Do not commit or push on Manik's behalf.

---

## 13. Short handoff

Sargam now supports local project folders, source-aware audio links, MP4/audio loop extraction, durable linked clip looping, a precise clip waveform editor, and a one-file `.sargam` package that reopens as a complete editable/listenable project without the master recording. Vilambit now has zoom/pan/follow waveform windows, precise A/B editing, marker-to-loop actions, and direct A/B-to-marker saving. The prepared Wave 1C layout consolidates Speed/Pitch and Loop/Markers while collapsing tuning; browser-accept that first. Then persist the complete Vilambit workspace per source in `workspace.json` and portable packages. After that, add multi-source reconnection and waveform peak caching, extract a reusable Vilambit Core, and build the approved browser-hosted FileMaker/library player with a noninterrupting queue. The same transport/queue foundation should later power teacher-authored Sargam Practice Sets.
