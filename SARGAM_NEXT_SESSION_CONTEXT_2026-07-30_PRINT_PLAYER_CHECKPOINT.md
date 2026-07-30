# Sargam — Next Session Context & Handoff

**Updated:** 2026-07-30  
**Checkpoint:** accepted Sargam shell, Music workspace, waveform/archive work, EQ, editor synchronization, and multi-page print  
**Next product phase:** Library and Queue architecture  
**Owner and musical authority:** Manik Khan  
**Assistant name:** Quill / Q  
**Supersedes for current state:** every older dated handoff

## 1. Read this first

This session ended at a stable product checkpoint. The July 30 print work is browser-accepted: the complete Bageshri composition prints across multiple pages with substantially better readability and page use.

Do not begin the next session by continuing to tune print CSS. Begin by verifying the checkpoint, then design the Library/Queue model.

The authoritative clone is:

```text
/Users/khansolo/Documents/GitHub/sargam
```

## 2. Exact verification gate

At the end of the implementation wave:

```text
commit: 6862b8e print-dialog layout patch
smokes: 553 passed, 0 failed
build: successful, 111 modules transformed
```

The production build still reports the known large-chunk advisory. It is not a release blocker.

At the start of the next engineering session, run:

```bash
git status --short
npm run smoke
npm run build
```

Record new results instead of repeating the July 30 count after the code changes.

## 3. Browser-accepted surfaces — preserve

### Sargam shell

- Circular AACM logo and wordmark.
- Chronicle-derived green/warm-paper visual language.
- Baba image frames the workspace with two faces.
- Notation and Music align in the left structural rail.
- A click opens one view only.
- Dragging opens the intentional split workspace.
- File and Queue are utility menus.
- The current project title is the central identity.

### Music

- Approved composition-style player rather than the earlier generic form.
- Current raga/project and recording source.
- Video when present.
- Waveform with zoom, Fit Loop, Show All, selection, A/B, markers, and playhead.
- Transport, ±5 seconds, position/duration, and volume.
- **Controls**, not “Practice,” for speed and pitch.
- Speed percentage slider plus coarse/fine buttons.
- Pitch semitones plus cents.
- Loop & Markers.
- Recordings can be replaced without reloading the workspace.
- Player is centered relative to the framing artwork.

### Notation and editor

- Rendered notation and Markdown synchronize in both directions with a single click.
- Repeated line selections must not snap back or require a second click.
- Text is always the source of truth.
- Existing accepted notation geometry remains binding.

### Print/export

- Export toolbar is visible and not covered by the app navigation.
- Screen preview uses the printable paper width.
- Typography is compact enough to read and use the page well.
- Long compositions paginate across all required pages.
- System breaks are musical and prefer sam where possible.
- Opening and closing the browser print dialog does not permanently reformat Export.

The July 30 Bageshri result is the acceptance reference. Reopen only for a reproducible regression.

## 4. Durable media state

Each stable source identity may restore:

- last position;
- A/B loop and loop-on state;
- speed and pitch;
- markers;
- BPM and speed regions;
- waveform window and Follow Playhead;
- EQ & Restoration.

This data belongs in `workspace.json`, keyed by stable source identity. It travels in `.sargam` packages. Filename alone never establishes identity.

Local projects continue to use:

```text
composition.md
media.json
workspace.json
clips/
```

## 5. Archive and waveform state

The archive Sargam Player supports:

- same-origin streamed recordings;
- recording replacement;
- byte-range remote WAV overview;
- optional precomputed waveform sidecars;
- lazy host-worker sidecar generation for class audio;
- progressive audio/video waveform capture;
- non-destructive per-recording EQ;
- curated recommended/community EQ manifests;
- Chrome 109 / Windows 8.1 compatibility target.

Nothing in the player applies a community EQ automatically.

## 6. Next design question

The product now needs a clean answer to three different concepts:

```text
Library   durable archive/catalog of available recordings
Queue     temporary order for the current listening session
Playlist  durable named collection, built later
```

The left rail must not become a list of open files or recordings. A class may have 10–20 sources, and that model does not scale or provide a clear close/remove action.

Recommended placement:

- Library/catalog: separate browser surface, with FileMaker/archive remaining authoritative.
- Current recording: Music/File context.
- Queue: collapsible utility surface, without forcing a permanent wide column.
- Playlist: later save/load layer over proven queue behavior.

## 7. Next-session plan

### Step 1 — product mock

Mock these states before writing code:

- Music with no current recording;
- Music with one current recording;
- Library results;
- collapsed and expanded Queue;
- adding a recording while another continues playing;
- missing/unavailable archive media;
- restoring a recording's prior EQ/loop/markers.

### Step 2 — queue contract

Define a pure, testable session model:

```text
current item
ordered upcoming items
history
repeat mode
explicit loop-exit policy
```

Minimum behavior:

- add without interrupting current playback;
- reorder;
- remove;
- clear;
- next/previous;
- repeat track;
- repeat queue.

Do not add shuffle or named playlists until the core interaction is accepted.

### Step 3 — archive adapter

- Load through stable library/FileMaker record ID.
- Resolve controlled same-origin media URLs.
- Never expose raw filesystem paths as durable identity.
- Restore the matched recording's workspace only after identity validation.

### Step 4 — later layers

- Named playlists.
- Practice Sets using the same queue/sequencing engine.
- Optional authenticated community EQ submissions and voting.

## 8. Practice Sets relationship

Practice Sets should not introduce another transport queue. They can later reuse the same controller for:

- a chosen source or extracted clip;
- repetition count;
- target duration;
- speed ladders;
- rest intervals;
- ordered exercises;
- teacher-authored routines inside `.sargam`.

The engine already has smoke-covered bounded repetition and speed-ladder planning. The product UI is not yet shipped.

## 9. Do-not-reopen list

Unless there is a concrete regression:

- print-dialog lifecycle and multi-page pagination;
- one-click rendered-notation/Markdown synchronization;
- approved Sargam shell and Music layout;
- iframe mounting/visibility behavior;
- source identity rules;
- extracted-clip-first playback;
- per-source workspace restore;
- community EQ opt-in rule;
- accepted Diri, meter, arc, repeat, and Bol Capture geometry.

## 10. Working agreement

- Inspect the exact clone before changing anything.
- Mock → approve → build for Library/Queue UX.
- Add tests around contracts before UI wiring.
- Verify with the full smoke suite and production build.
- Manik's visual and aural acceptance remains part of “done.”
- Never invent musical or archival semantics.
