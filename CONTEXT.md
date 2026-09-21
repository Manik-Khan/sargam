# Sargam — Project Context & Handoff

**Updated:** 2026-09-21, after the inline ornament and slide-hold repair. The July 30 product rulings below remain binding except where a later checkpoint explicitly supersedes them.

**What this is:** the broad project memory for Sargam — Manik Khan's web app for writing, rendering, hearing, printing, transcribing, and practicing Hindustani classical notation. Read this with [the September 21 handoff](SARGAM_NEXT_SESSION_CONTEXT_2026-09-21_NOTATION_CHECKPOINT.md) and the historical July 30 print checkpoint, then inspect the actual clone at `/Users/khansolo/Documents/GitHub/sargam`.

Manik is the musical and product authority. Never invent raga, tala, bol, ornament, notation, or AACM archival semantics.

## September 21 inline ornaments and preview proposal

- Base: canonical clone, clean matching `main` at `f0d5043e4b3e`. Manik reported that `G{P}m` split a beat and that a hold after a slide wrapper became a separate beat.
- `G{P}m` now keeps the `Gm` timed skeleton, puts the small P and kan curve at m, and takes grace playback time from m. `G{P~}m` uses the existing approach-slide model: m approaches from P without a separate P strike. Bracketed beats and ordered multiple grace runs are supported. Canonical saves retain the destination, durations and holds.
- `~(Gm | R)-` and `~(Gm | R-)` now match; a spaced `~(Gm | R) -` still adds a beat. Bare parentheses remain `(phrase)xN` repeat syntax. No `G(P)m` alias was approved or added.
- Scoped slides such as `G~(Pm)` draw over P/m, not over the preceding G. Source selection, meter scanning and seek positions share the inline ornament scan. The Jhampak final half-cell and S on sam remain unchanged.
- Manik's next preference is a dynamic command list for highlighted notation showing the rendered result, written shorthand and intention before applying. A contained interactive mock was prepared; the live Note tools panel has **not** been replaced. Keep it manually opened and stable during selection. Follow mock approval before building the new panel; do not infer approval of a new parenthesis grammar.
- **726 checks passed, 0 failed; production build passed (132 modules).** Regression coverage includes parser, playback, save roundtrips, renderer scope, direct source navigation, partial-cluster Kan controls and the complete Jhampak phrase. Browser visual/aural acceptance remains pending; no commit, push or deployment.

## September 21 compact workspace layout

- Manik approved the mock's arrangement while explicitly preferring the existing site's visuals. Preserve Sargam's existing palette, typography, AACM logo, artwork and paper treatment; the mock is not a replacement visual identity.
- One slim identity rail replaces the three left strips. Top navigation provides Notation, Music and explicit Split view. File and Library remain primary; More contains Linked phrases and Queue. Narrow split view stacks both surfaces.
- Repeat and Sounds consolidate notation playback settings. Empty recording controls are hidden without removing their bridge listener. The Music iframe remains mounted across views.
- Text/Grid and editing menus share one source toolbar. Note tools opens manually below the editor, has bounded scrolling, and cannot expand in response to selection. Insert groups structural shorthand actions; View owns appearance, follow, metadata, naming and layout options. Focus mode hides notation transport and the inspector. Direct shorthand remains essential and supported.
- **718 checks passed, 0 failed; production build passed (131 modules)**. New real-component regressions cover menus, navigation, callbacks, recording readiness and inspector visibility. Browser visual/aural acceptance remains pending. See [compact layout](docs/compact-workspace-layout.md) for the acceptance sequence.
- Base: canonical clone, clean matching `main` at `19bbb77e3277`. This layout is local and uncommitted at handoff; no push or deployment.
- Additional musical ruling from this conversation: the final Jhampak `.N` occupies its own ½-beat space before S on sam. Do not automatically join them with a rhythmic grouping curve. An intended meend is a separate explicit marking; this layout pass does not change that musical behavior.

## September 21 selection stability repair

- Manik reported that the Selected notes panel grew while highlighting text, pushing the source away from the pointer. Its earlier maximum height did not prevent growth. It now reserves a fixed, viewport-bounded height (100–180 CSS pixels) and scrolls additional controls internally, including keyboard scrolling when the panel is focused. Writing focus still hides it.
- CodeMirror selection remains live during pointer drags. Surrounding controls and score-line synchronization wait until release, including release outside the editor; keyboard selection remains immediate. Cancellation, window blur and editor teardown cannot leave pending selection updates behind. Direct typing and musical spacing are unchanged.
- **712 checks passed, 0 failed; production build passed (128 modules)**. Gesture regressions use DOM events and real CodeMirror selection state, including final mouseup changes and rapid consecutive drags. Browser geometry and audio acceptance remain pending; tests do not establish actual pointer/scroll behavior in Chrome or Safari.
- Implementation base: canonical clone, clean matching `main` at `face6d601d62`. This repair is local and uncommitted at handoff; no push or deployment. Manually repeat short/long/backward selections in the supplied Jhampak phrase, release outside the source, scroll the control panel, and test a small window plus Writing focus.

## September 21 current checkpoint — writing, playback and layout

- Manik confirmed that **direct shorthand typing remains essential**. The approved controls are optional editing shortcuts inside Sargam; the conversation mock does not change a score. Text/Markdown is still the source of truth.
- Text Write now has Selected notes controls for Slide, Krintan, Kan / grace, None, per-note bols and existing bol passes, with a live shorthand preview. Examples: `~(Gm)`, `~(G m)`, `[[Gm]]`, `{G}m`, and `> da ra . diri`. Existing spellings remain supported; Grid Write retains its cell inputs and bol menus.
- Selecting a whole ornament lets controls replace/remove its wrapper. Edits are parser-validated, preserve cell durations including Jhampak's half-beat, remap surviving bols across passes, and preserve gap chikari on its written slot. Newly untimed grace-note bols are removed with a message. One Undo restores notation, bols and selection together. See [writing controls](docs/notation-writing-controls.md) for scope and scanner limits.
- **Approved click behavior:** select and move playback there; continue only if already playing. Markdown, rendered subdivisions, Grid Write and Beginning share this behavior. Selection drags and programmatic reveals do not scrub. Seeking/pausing cancels native voices already queued at the old position.
- Preview sizing excludes padding. Graph rows grow for extra bol/lyric lanes; cross-cell diri spans include expanded columns and align to measured attacks in preview/export. Ornament anchors use their destination glyph. Dense logical matras may span multiple physical columns; the print lifecycle stays unchanged. See [notation repairs](docs/notation-repairs-2026-09-20.md).
- **708 checks passed, 0 failed; production build passed (127 modules)** in the completed implementation pass. Real React interactions and atomic undo/redo are tested; audible playback, browser layout, accessibility and real multipage PDF acceptance remain pending. Passing tests are not a visual or audio sign-off.
- Repository state was rechecked September 21: clean `main`, local/tracking/live GitHub all at `5139fb4431a4` (`updating bols and writing`). The earlier `ca7629efd5f0` notation fixes and latest writing controls are now committed in matching main. Prior uncommitted-status notes below describe their original handoffs, not today's Git state. Deployment is unverified; this documentation pass does not authorize a commit, push or deployment.
- Next work is the live acceptance sequence in [the current handoff](SARGAM_NEXT_SESSION_CONTEXT_2026-09-21_NOTATION_CHECKPOINT.md) and [release checklist](docs/release-checklist.md), then fixes for observed failures. Preserve the on-device/no-recording-upload requirement and Jhampak's automatic final half-beat. FileMaker remains a separate project.

## September 20 audit repairs

- Manik authorized fixing the September 20 audit findings on the reviewed, uncommitted audio-work base. That work was preserved; no commit/push/deployment was performed.
- Saving retains edits made during asynchronous writes; logical saves and folder writes are ordered. Project/clip saves preserve live recording settings and document identity.
- Recording workspace checkpoints run during playback, with project/base-matched local recovery. Failed older writes cannot overwrite a later successful snapshot.
- Queue waits for matching playable-source readiness and workspace acknowledgement before committing/autoplay; failures/timeouts preserve the prior session.
- MusicXML shares performed-cell traversal with playback and preserves meter changes, Gat returns and pickup-to-sam boundaries. Ashta Jhaptal/Jhaptaal aliases resolve to the existing Jhampak definition.
- Native full-waveform decoding uses bounded local audio-header inspection, a 64 MiB estimated PCM budget and a 15-second deadline; media failure can immediately start the existing on-device fallback. Unknown/oversized layouts remain streamed.
- **685 checks passed; production build succeeded (124 modules)**. Browser audio, printing/layout, folder shutdown and real archive Queue acceptance remain pending; large-bundle profiling also remains. See `docs/audit-repairs-2026-09-20.md`.

## September 17 on-device audio compatibility

- Manik approved automatic local-audio preparation with progress and Cancel, explicitly requiring that recordings never be uploaded for decoding. No installed user app is required.
- Local audio format failures can now start a lazy, same-origin FFmpeg WebAssembly worker and produce a temporary FLAC playback copy. The original source identity, file, markers, and loops are preserved. Normal playable files do not start the decoder.
- Audio-only first scope; real video and archive URLs retain native playback. File, output, duration and time limits prevent unbounded conversion; large local/prepared audio stays streamed rather than fully decoded. See `docs/audio-compatibility.md` for exact limits and hosting requirements.
- The optional decoder is about 32 MB and is included in both static builds, with license and source references. It runs single-threaded without a server conversion service or isolation headers.
- **666 checks passed; production build succeeded**, including real ALAC/AAC decoder fixtures and lossless integrity checks. Chrome visual/aural and network-panel acceptance remain pending due to the previous browser-access denial. The original failing M4A is not yet available for direct testing. No commit, push, or deployment performed.

## September 17 recording playback repair

- Local recording replacement previously closed the AudioContext and discarded its MediaElementAudioSourceNode while retaining the same media element. A later media-engine start attempted to bind that element again and failed. Keep one context/source binding for the mounted player and rebuild only the downstream processing graph.
- Graph setup and Play now share pending work, discard obsolete worklet results after source changes, await media.play(), and show recoverable playback errors. Local-file load errors no longer claim an archive URL failure. Temporary decoding contexts close on failure too.
- The user-supplied `m2-res_854p-2.mp4` is 31.07 seconds of H.264 Main video and AAC-LC stereo audio; ffmpeg decoded the complete file without errors. This establishes file decodability, not browser acceptance or the cause of the earlier unsupplied M4A failure.
- Eight lifecycle regressions cover repeated video replacement, video/audio/video transitions, stale setup, repeated clicks, rejected playback and retry, fallback playback, and local/archive errors. **657 checks passed, 0 failed; production build succeeded.**
- Chrome computer-use access was not approved, so live video/audio playback acceptance remains pending. Test the supplied MP4, then another recording, then the MP4 again; include play/pause, seeking, speed/pitch, A–B looping, and audible output. Changes are local; no commit, push, or deployment performed.

## September 16 Jhampak correction — automatic final half-beat

- Manik approved the display `[8: .N.D] [½: .N] | [1 / sam: S]` and automatic half-beat timing at the end of Jhampak. This supersedes the explicit-only rule in the earlier checkpoint below.
- His unchanged phrase `@3 ||: G - Gm | R- S | .N.D .N|S - :||` now lasts 8½ beats per pass; the final S lands on sam on both passes. Reader-facing positions are `3,4,5,6,7,8,½,1,2`.
- Only an unqualified cell in Jhampak's final half position receives the inferred duration. Explicit `:1/2` and `:1` overrides remain available. Inferred duration is not written back as a suffix; canonical text and Grid Write preserve the distinction.
- Source anchors, local meter selection, and audio-link selection use the parsed duration when converting source positions to time. Numeric internal cycle positions remain stable; display labels use ½ for the final half and + for a half-offset within a numbered beat.
- Exact-phrase regressions cover repeats, continuations, holds/rests/subdivisions, render/print, Grid Write, canonicalization, anchors, local meter, audio selection, and MusicXML. **649 checks passed; production build succeeded.** Visual/aural acceptance remains with Manik; no commit, push, or deployment performed in this correction.

## September 16 Jhampak and audit checkpoint

- Jhampak is 8½ beats, grouped 2 + 3 + 2 + 1½. Manik confirmed Dhi Na | Dhi Dhi Na | Tun Na | Di Di Na with three equal half-beat ending strokes. Khali on 6 remains provisional.
- `:1/2` explicitly shortens a cell to half a beat; `:1` restores a full beat in Grid Write. Duration, onset, and source-cell identity remain distinct. See `docs/jhampak.md`.
- Fractional timing is shared by continuation, repeats, playback, anchors, local meter, render/print, and 17/8 staff export. Jhampak uses click fallback pending an approved sampled theka.
- The audit fixed staff-export first endings, free-time grid labels, damaged recent-file handling, silent autosave failures, draft flushing, and outdated notation-key guidance.
- Verification: **643 checks passed, 0 failed**; production build successful. Browser policy verification blocked visual/aural acceptance. See `docs/site-audit-2026-09-16.md` for evidence and remaining Queue, multi-tala/Gat staff-export, and performance work.
- The starting uncommitted September 8 changes were reviewed and explicitly approved as the working base. No commit, push, or deployment was authorized or performed.

## September 8 repository source-of-truth guardrail

- `npm run repo:preflight:remote` is now the mandatory first step before implementation work.
- It rejects Codex project mirrors, the wrong GitHub remote, a non-main or untracked branch, a stale local/tracking/live GitHub commit, and an already-dirty worktree.
- Root `AGENTS.md` makes a failed preflight a hard stop and requires every implementation handoff to name the repository root, branch, HEAD, verification result, and remaining manual acceptance.
- Verification after the guardrail: **625 checks passed, 0 failed**, and the production build succeeded with 120 modules transformed. The existing large-chunk advisory remains non-blocking.

## August 19 Library and Queue Wave 1

- **Library**, **Linked phrases**, and **Queue** are now separate shell surfaces. Library is the durable project catalog; Linked phrases retains composition-specific notation A–B links; Queue is temporary listening-session order. Playlist remains later.
- The pure session controller owns current, ordered upcoming items, history, and repeat mode. It smoke-covers add-without-interrupting, reorder, remove, clear, next/previous, repeat track, repeat queue, and the A–B exit policy.
- An active A–B loop blocks automatic advancement. Pressing **Next** explicitly clears the loop and advances.
- Project `media.json` sources form the first Library adapter. A stable record ID is mandatory. Only controlled same-origin HTTP(S) URLs are reopenable; a loaded local file remains visible but explicitly requires reconnection before it can be queued.
- The same-origin player bridge accepts `load-library-source`, republishes the stable source ID, and restores the matched `workspace.json` state before queued autoplay. It never binds by filename.
- FileMaker is a separate build, not a dependency or integration wave for this Sargam project. The next Sargam step is browser acceptance of Library and Queue with real project recordings. The binding contract is recorded in `docs/library-queue.md`.
- Verification at this checkpoint: **621 checks passed, 0 failed**, and the production build succeeded with 120 modules transformed. The existing large-chunk advisory remains non-blocking.

## August 10–19 print, rhythm, and playback checkpoint

- A matra is always one **logical** rhythmic cell, but it is no longer forced into one narrow physical square in every view. Dense subdivisions, long kan/slide ornaments, and phrase reports may reserve two or three adjacent graph columns while remaining one selectable/editable matra with one timing identity. The notation cell, its bol lane, arcs, selection, system planning, and print geometry must use the same span. This supersedes the earlier assumption that every written matra must occupy exactly one physical graph column; preserving legibility takes precedence over making every box equally narrow.
- Written phrase dividers and tala divisions are now separate visual levels. Every authored `|` remains visible as a medium divider in Clean, Matra Cells, Graph Paper, and PDF output. Derived tala/vibhag boundaries and first-ending boundaries are heavier. When a written `|` coincides with a tala boundary, only the heavier divider is drawn. Holds/sustains must not override either divider style.
- The printed bol lane is reading material, not a pale editing guide. Its symbols share the exact subdivision grid of the notes above, use printer-safe weight and size, and remain aligned when a matra expands. Rhythmic holds and empty subdivisions stay blank in the bol lane: a notation `-` must never be printed as though it were the bol **ra**. Only actual da (`|`), ra (`—`), Diri (`V`), and chikari (`^`) marks appear. A Diri V has no underline, keeps a consistent compact size, and a `di-ri` across attacks remains one connected mark rather than two symbols.
- Chikari is audible in playback as a separate short upper-Sa articulation without replacing the melody event. Sound Settings persist a **Soft string**, **Rounded tone**, or **Clear string** choice plus intensity, length, and brightness. The default is deliberately soft. Both a note-attached `chikari` and an exact gap `^` use this voice.
- Local meter spans remain descriptive/validating overlays on the rhythm already written; they do not retime the line, move sam/khali, or replace the tala. The companion syntax requires whitespace between the ratio and range, for example `>> 3/2 @0..8`; multiple spans are separated by semicolons. The normal workflow is still to select the attacks and let Sargam write the exact rational offsets. Playback timing comes from the actual subdivisions in the notation source.
- A bounded Gat return cue uses `gat@START..@STOP`. For example, `gat@9..@1` enters the nearest preceding Gat at cycle matra 9, plays until—but not including—the next matra 1, then resumes with the following written line on sam. It disambiguates a partial return even when the Gat spans multiple cycles. Export intentionally prints the reader-facing instruction simply as *gat*; the exact range remains source/playback structure.
- Verification at this checkpoint: **608 checks passed, 0 failed**, and the production build succeeded with 116 modules transformed. Tracked Finder `.DS_Store` metadata and the remaining numbered conflict copies were removed in the dedicated repository-cleanup pass. The existing large-chunk build advisory remains non-blocking.

## August 7 stabilization note

- **Graph Grid** is the existing Rhythm Grid developed into a clearer working surface: every rendered matra carries its tala-matra coordinate and subdivision count, and retains a visible selected-cell state while its Markdown source line remains authoritative.
- **Grid Write** is the companion direct editor. It exposes one input box per written matra, rewrites only the corresponding Markdown music line, updates the score and playback model immediately, keeps invalid/incomplete drafts out of the source, and supports adding a matra to an existing line. A `+` beneath every real note attack opens a local da/ra/diri/chikari menu; choosing once writes the ordinary editable `>` attachment lane at that exact note and closes the menu. Every written hold/rest subdivision is also exposed in the bol strip: its `+` offers chikari only, and writes `^` into that gap without consuming or replacing the next note's bol (`^da` means gap chikari followed by note-attached da). Diri has two deliberate meanings: `diri` schedules two equal strokes on the same written pitch, while `di-ri` binds the current and next successive note attacks as the two halves of one spoken bol and preserves both written pitches. Grid controls label these **same note** and **next note**; a spanning pair reads `di` / `ri` in Grid Write, but the rendered and printed notation always uses one continuous V whose arms align with the two attacks—even when it crosses a matra boundary. It must never print a second or faded continuation V, and the system planner must not break between its endpoints. Four notes with four per-note Diris still sound as eight strikes in one matra. Entering Grid Write migrates older score-side bol anchors into these editable lanes, and complete pre-change two-attack Diri lanes remain readable without shifting later bols. There is no Grid Write capture mode or cursor to advance. Text Write retains its keyboard Bol Capture workflow and remains available for headings, attachment lines, and broader structural edits.
- Clicking any rendered score matra addresses the same `{sourceLine, matraIndex}` in Grid Write, centers that exact editor cell, focuses it for immediate typing, and gives both score and editor the same visible selection. Repeated jumps between distant lines must work in both directions.
- Switching between Text Write and Grid Write preserves the current musical source line and, where possible, the exact matra. **Beginning** is the explicit shortcut back to the first notation line. **Writing focus** hides secondary notation tools and reduces surrounding margins without changing the split score/editor workflow. During edits, the selected source line or exact Grid Write matra is the score's scroll anchor, so inserting or deleting content must not push the working music away from the user.
- The Grid Write bol picker is one viewport-level floating menu, not content clipped inside a cell or editor pane. It keeps all da/ra/diri/chikari/remove choices reachable near every edge. A line-level **Copy bols** action copies its ordinary editable bol attachment lanes for reuse without returning to Text Write.
- Compact alternate endings use the existing parser-backed repeat form. `|1` begins the first ending inside a repeated line; the next notation line is the second ending. The renderer keeps a tail of the shared phrase at the end of the system, then places real **1st time** and **2nd time** matra grids at one aligned divergence. The first ending owns the structural `:||` column; the second begins directly beneath it. Clean, Matra cells, and Graph Paper use the same paired structure, and the complete ending block is kept together at print boundaries. `@N` remains source/playback alignment and is not the reader's printed explanation.
- Grid Write exposes that same alternate-ending structure without requiring syntax recall. A repeated line offers **Add 1st ending**; placement mode shows a **Start here** control before every valid changed matra. The chosen region receives a visible **1st ending** bracket, the immediately following notation row receives **2nd ending**, and the boundary can be moved or removed. These actions only add/move/remove the underlying `|1`, so Text Write, rendering, scheduling, and print remain one model.
- A Grid Write matra has a pointer-anchored context menu on right-click and a keyboard equivalent on Shift–F10. It selects exact note attacks before applying da/ra/diri/chikari; starts and completes bounded phrase repeats; toggles a complete line repeat; places, moves, or removes the first-ending boundary; and offers safe hold/rest replacements. The menu flips above the pointer near viewport edges and closes on outside click, scroll, resize, or Escape. These are alternate controls over the existing Markdown operations, never a second composition model; the visible `+` bol controls and ending buttons remain valid.
- Grid users can persist either **Cells** (only written matras are boxed) or **Graph Paper** (an actual matrix in which every written cell is one logical matra and trailing empty columns are real cell elements) across both the rendered score and Grid Write. PDF export separately offers Clean, Matra cells, and the same real-cell Graph Paper matrix. Ordinary matras occupy one physical column; dense or ornament-heavy matras may reserve two or three while retaining one timing/editing identity. Repeats and cues have their own structural columns, and line planning must use the full available row without shrinking content into illegibility. Subdivisions, kan/approach ornaments, and repeat endings remain inside their owning logical matra. Line repeats `||:` / `:||` occupy their own non-musical structural grid positions before/after the repeated matras; they never share, shrink, or cover a note cell. Graph-paper descriptions, section labels, and numbered cues sit in compact inter-row strips rather than consuming a full matra-height row; their background cells remain pinned to the printable width. Rendered bol lanes occupy a small per-matra strip whose subdivisions share the note attack grid. The view changes without changing Markdown, timing, or playback math. Tala markers remain inset in their upper-left coordinate lane instead of following delayed attacks into vibhag dividers.
- The graph-grid preference and the PDF page, typeface, grid, and ink choices persist locally.
- `docs/release-checklist.md` is now the repeatable writing, playback, print, and restoration acceptance gate.
- Active implementation files never use numbered conflict-copy suffixes. The historical numbered copies and tracked Finder metadata were removed in the August 19 repository-cleanup pass; do not restore them.
- Verification at this checkpoint: **602 checks passed, 0 failed**; the production build succeeded with the existing non-blocking large-chunk advisory.
- Any future richer direct manipulation—deleting or reordering cells, creating whole lines, or editing attachment lanes—must continue to use parser-backed source identities rather than guessing at spaces or ornaments.

## Authoritative current state — 2026-07-30

This block supersedes older dated current-state and roadmap prose.

### Verification checkpoint

- Repository was clean at commit `6862b8e` before this documentation update.
- `npm run smoke`: **553 passed, 0 failed**.
- `npm run build`: successful, 111 modules transformed.
- The existing large JavaScript chunk warning remains non-blocking.
- Manik browser-accepted the final print improvement: the notation is easier to read, uses the page more effectively, and prints across the complete composition.

### Accepted Sargam shell

Preserve the approved Chronicle-inspired visual system:

- green and warm-paper palette derived from the Baba image;
- two faces frame the central working surface without one side feeling more obstructed than the other;
- circular AACM school logo and Sargam wordmark;
- **Notation** and **Music** are the two primary views;
- clicking either view opens only that view;
- dragging the divider opens the intentional half-and-half workspace;
- the current project title is the central project identity;
- **File** and **Queue** are utility menus, not left-rail folder dividers;
- the left rail is structural navigation, not a growing list of recordings;
- “Ali Akbar College of Music” remains a single readable line;
- the footer may show the current raga from notation and the quote “Listen & learn first. Then notate.”

Do not reopen this layout without a concrete regression or a new approved mock.

### Notation, editor, and print

Preserve:

- text/Markdown remains the source of truth;
- converted notation and Markdown synchronize in both directions with one click;
- clicking rendered notation selects and centers the matching source line;
- clicking a Markdown line brings the matching rendered line into view;
- repeated line selections do not require a second click;
- Preview and Export use the same semantic system planner;
- print breaks only at safe musical boundaries and prefers sam where possible;
- indivisible ornaments, beats, repeats, and structural spans are never broken merely to fill a line;
- print/export uses compact typography and the full printable width;
- opening the browser print dialog must not collapse the export to one page;
- closing/canceling print must not leave the export in a changed layout;
- the app navigation must not cover the Export toolbar.

The July 30 Bageshri printout is the browser-accepted reference. Do not replace the print lifecycle or pagination heuristics without a reproducible failing composition.

### Accepted Music workspace

The approved Music surface is the live Sargam Player, not the earlier generic card stack.

Preserve:

- current project/raga and source identity at the top;
- optional video presentation;
- waveform, zoom, Fit Loop, Show All, A/B, markers, and playhead;
- transport, ±5-second buttons, position, duration, and volume;
- **Controls** section containing speed and pitch;
- coarse and fine speed adjustment, including a percentage slider;
- semitone and cents pitch adjustment;
- **Loop & Markers** as the paired working area;
- recording replacement without reloading the full workspace;
- the player remains centered between the framing faces;
- the iframe stays mounted at full size and inactive views use `visibility`, never `display:none`.

### Source workspace, clips, and portable projects

Working local project structure:

```text
Project Folder/
├── composition.md
├── media.json
├── workspace.json
└── clips/
```

Preserve:

- stable source identity; filename alone is never sufficient;
- per-source position, loop, speed, pitch, markers, waveform view, follow preference, speed regions, BPM, and EQ;
- identity-matched atomic restore;
- debounced project-folder writes;
- extracted clip → original source A–B → locate source playback priority;
- source timing remains available when a clip is absent;
- non-destructive clip-loop editing;
- binary media never enters Markdown or JSON;
- portable `.sargam` projects include notation, manifests, workspace, and clips;
- imported packages become independent copies and never silently overwrite projects.

### Waveform and archive player

The Sargam Player archive route and waveform infrastructure are working:

- same-origin URL/library media loads in streaming mode;
- remote WAV overview uses byte ranges rather than full-file decoding;
- sidecar peaks may be served from the archive;
- a host waveform worker can lazily create missing class-audio sidecars;
- audio/video can build visible waveform information during playback;
- source recordings remain untouched;
- the target archive browser remains Chrome 109 on Windows 8.1 unless the real host changes.

The FileMaker-backed catalog/player is a separate build and is not part of this Sargam roadmap. Shared player boundaries should still pass stable recording IDs or controlled URLs rather than treating raw filesystem paths as durable identity.

### EQ & Restoration

EQ is non-destructive and belongs to each recording's workspace.

Preserve:

- personal EQ restoration persists with the source;
- the archive may publish recommended/community EQ profiles in a versioned manifest;
- no published profile applies until the listener explicitly chooses it;
- a listener may download a candidate profile JSON;
- an archive curator manually reviews and publishes accepted profiles;
- authenticated submission, voting, and reputation remain a later server phase.

### Accepted notation geometry and linked audio

Do not casually reopen:

- Diri as either a per-note `V` that doubles one pitch (`diri`) or one joined bol across two successive written pitches (`di-ri`). The source and Grid Write menu must keep these meanings explicit rather than guessing;
- meter spans as the accepted mirrored bracket;
- repeated local approaches and their independent arcs;
- repeat signs outside the metric note grid;
- active playback highlighting without score reconstruction;
- versioned `sargam-audio-links:v1` source-range links;
- folded generated metadata in Clean mode and exact source in Structure mode;
- Bol Capture's notation-derived structural lane.

## Library and Queue — first implementation slice

The product mock was approved and the first pure controller and shell slice is implemented.

### Product rulings to carry forward

- **Library** is a separate catalog/browser surface. It is not a list of 10–20 recordings in the left rail.
- **Current recording** belongs to Music/File context.
- **Queue** is temporary session order and may be collapsible.
- **Playlist** is a durable named collection and should follow the queue, not be conflated with it.
- Adding an item to the queue must not interrupt the recording already playing.
- Queue operations should eventually cover reorder, remove, clear, next/previous, repeat track, and repeat queue.
- Infinite A–B loops need an explicit exit policy before automatic queue advance.
- Selecting a recording should restore its saved workspace, including EQ, loop, markers, position, and waveform view.
- FileMaker integration belongs to its separate build and must not be added as a dependency here.

### Remaining implementation order

1. Browser-accept Library, reconnection, queue order, A–B exit, repeat, and workspace restoration with real Sargam project recordings.
2. Fix any interaction or restoration issues found during that acceptance pass.
3. Add durable named playlists only after the transient queue feels correct.
4. Build Practice Sets on the same sequencing foundation: excerpts, repetitions, timed steps, rests, and speed ladders.

## Binding architecture and working rules

- The exact clone is authoritative; inspect it before editing.
- Text remains the source of truth for notation.
- Never embed binary media in Markdown or JSON.
- Preserve original source A–B timing and optional extracted-clip identity separately.
- Never silently bind to another recording with the same filename.
- Browser handles are local permissions, not portable data.
- `.sargam` is the portable exchange format.
- Marker-to-loop and loop-to-marker operations copy exact times; they do not create hidden mutable coupling.
- Preserve the stable iframe integration and same-origin bridge.
- Mock → approve → build for product/UX work.
- Smokes first; green suite plus Manik's visual/aural acceptance is the completion gate.
- Manik deploys through the repository/hosting workflow; assistants do not commit or push unless explicitly authorized.
- Ambiguous musical semantics stop for Manik's ruling; never improvise the tradition.

## Historical context

Older dated handoffs remain in the repository for implementation history:

- `SARGAM_NEXT_SESSION_CONTEXT_2026-07-23_VILAMBIT_SOURCE_WORKSPACE_STANDALONE.md`
- `SARGAM_NEXT_SESSION_CONTEXT_2026-07-21_CLIP_VAULT_PORTABLE_PROJECTS.md`
- `SARGAM_NEXT_SESSION_CONTEXT_2026-07-20_ANCHOR_GEOMETRY.md`
- `SARGAM_NEXT_SESSION_CONTEXT_2026-07-19.md`
- `archives/SARGAM_NEXT_SESSION_CONTEXT_2026-07-18.md`

Those files do not override this document or the July 30 handoff.
