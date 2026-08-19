# Sargam — Project Context & Handoff

**Updated:** 2026-08-19, after the graph-cell density, printed-divider, bol-legibility, local-meter, return-cue, and chikari-playback passes. The July 30 product rulings below remain binding except where a later checkpoint explicitly supersedes them.

**What this is:** the broad project memory for Sargam — Manik Khan's web app for writing, rendering, hearing, printing, transcribing, and practicing Hindustani classical notation. Read this with `SARGAM_NEXT_SESSION_CONTEXT_2026-07-30_PRINT_PLAYER_CHECKPOINT.md`, then inspect the actual clone at `/Users/khansolo/Documents/GitHub/sargam`.

Manik is the musical and product authority. Never invent raga, tala, bol, ornament, notation, or AACM archival semantics.

## August 10–19 print, rhythm, and playback checkpoint

- A matra is always one **logical** rhythmic cell, but it is no longer forced into one narrow physical square in every view. Dense subdivisions, long kan/slide ornaments, and phrase reports may reserve two or three adjacent graph columns while remaining one selectable/editable matra with one timing identity. The notation cell, its bol lane, arcs, selection, system planning, and print geometry must use the same span. This supersedes the earlier assumption that every written matra must occupy exactly one physical graph column; preserving legibility takes precedence over making every box equally narrow.
- Written phrase dividers and tala divisions are now separate visual levels. Every authored `|` remains visible as a medium divider in Clean, Matra Cells, Graph Paper, and PDF output. Derived tala/vibhag boundaries and first-ending boundaries are heavier. When a written `|` coincides with a tala boundary, only the heavier divider is drawn. Holds/sustains must not override either divider style.
- The printed bol lane is reading material, not a pale editing guide. Its symbols share the exact subdivision grid of the notes above, use printer-safe weight and size, and remain aligned when a matra expands. Rhythmic holds and empty subdivisions stay blank in the bol lane: a notation `-` must never be printed as though it were the bol **ra**. Only actual da (`|`), ra (`—`), Diri (`V`), and chikari (`^`) marks appear. A Diri V has no underline, keeps a consistent compact size, and a `di-ri` across attacks remains one connected mark rather than two symbols.
- Chikari is audible in playback as a separate short upper-Sa articulation without replacing the melody event. Sound Settings persist a **Soft string**, **Rounded tone**, or **Clear string** choice plus intensity, length, and brightness. The default is deliberately soft. Both a note-attached `chikari` and an exact gap `^` use this voice.
- Local meter spans remain descriptive/validating overlays on the rhythm already written; they do not retime the line, move sam/khali, or replace the tala. The companion syntax requires whitespace between the ratio and range, for example `>> 3/2 @0..8`; multiple spans are separated by semicolons. The normal workflow is still to select the attacks and let Sargam write the exact rational offsets. Playback timing comes from the actual subdivisions in the notation source.
- A bounded Gat return cue uses `gat@START..@STOP`. For example, `gat@9..@1` enters the nearest preceding Gat at cycle matra 9, plays until—but not including—the next matra 1, then resumes with the following written line on sam. It disambiguates a partial return even when the Gat spans multiple cycles. Export intentionally prints the reader-facing instruction simply as *gat*; the exact range remains source/playback structure.
- Verification at this checkpoint: **607 functional checks passed** and the production build succeeded with 116 modules transformed. One repository-hygiene check still reports tracked Finder `.DS_Store` metadata; it is unrelated to notation behavior but should be cleaned before a release. The existing large-chunk build advisory remains non-blocking.

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
- Active implementation files never use numbered conflict-copy suffixes. Some historical numbered copies and tracked Finder metadata are still present in the clone; do not treat them as authoritative, and remove them in a dedicated repository-cleanup pass before release.
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

The FileMaker/archive catalog remains authoritative. Future integrations should pass stable library IDs or controlled URLs rather than treating raw filesystem paths as durable identity.

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

## Next product phase — Library and Queue

The next session should begin with a product model and mock, not immediate implementation.

### Product rulings to carry forward

- **Library** is a separate catalog/browser surface. It is not a list of 10–20 recordings in the left rail.
- **Current recording** belongs to Music/File context.
- **Queue** is temporary session order and may be collapsible.
- **Playlist** is a durable named collection and should follow the queue, not be conflated with it.
- Adding an item to the queue must not interrupt the recording already playing.
- Queue operations should eventually cover reorder, remove, clear, next/previous, repeat track, and repeat queue.
- Infinite A–B loops need an explicit exit policy before automatic queue advance.
- Selecting a recording should restore its saved workspace, including EQ, loop, markers, position, and waveform view.
- FileMaker/archive integration should use stable record identity.

### Recommended implementation order

1. Mock and approve Library, current recording, Queue, and later Playlist boundaries.
2. Define a pure queue/session controller with direct smoke coverage.
3. Build minimal add-without-interrupting, reorder, remove, clear, next/previous, and repeat behavior.
4. Connect the archive/FileMaker adapter through stable record IDs.
5. Add durable named playlists only after the transient queue feels correct.
6. Build Practice Sets on the same sequencing foundation: excerpts, repetitions, timed steps, rests, and speed ladders.
7. Consider authenticated community EQ submission/voting only after the LAN archive workflow and ownership rules are established.

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
