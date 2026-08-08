# Sargam — Project Context & Handoff

**Updated:** 2026-08-07, after the direct Grid Write and release-stabilization pass. The July 30 product rulings below remain binding.

**What this is:** the broad project memory for Sargam — Manik Khan's web app for writing, rendering, hearing, printing, transcribing, and practicing Hindustani classical notation. Read this with `SARGAM_NEXT_SESSION_CONTEXT_2026-07-30_PRINT_PLAYER_CHECKPOINT.md`, then inspect the actual clone at `/Users/khansolo/Documents/GitHub/sargam`.

Manik is the musical and product authority. Never invent raga, tala, bol, ornament, notation, or AACM archival semantics.

## August 7 stabilization note

- **Graph Grid** is the existing Rhythm Grid developed into a clearer working surface: every rendered matra carries its tala-matra coordinate and subdivision count, and retains a visible selected-cell state while its Markdown source line remains authoritative.
- **Grid Write** is the companion direct editor. It exposes one input box per written matra, rewrites only the corresponding Markdown music line, updates the score and playback model immediately, keeps invalid/incomplete drafts out of the source, and supports adding a matra to an existing line. Text Write remains available for headings, attachment lines, and broader structural edits.
- Grid users can persist either **Cells** (only written matras are boxed) or **Graph Paper** (an actual matrix in which every written cell is exactly one matra and trailing empty columns are real cell elements) across both the rendered score and Grid Write. PDF export separately offers Clean, Matra cells, and the same real-cell Graph Paper matrix. Subdivisions, kan/approach ornaments, and repeat endings remain inside their owning matra; five-to-eight-slot beats wrap internally rather than taking neighboring cells. Four-note cells use compact internal tracks with a safety inset from vibhag dividers, while `||:` / `:||` receive protected edge space instead of covering the first or last note. Graph-paper structure labels and written cues use a restrained printer-safe tint so grid lines do not run through prose. The view changes without changing Markdown, timing, or playback math. Tala markers remain inset in their upper-left coordinate lane instead of following delayed attacks into vibhag dividers.
- The graph-grid preference and the PDF page, typeface, grid, and ink choices persist locally.
- `docs/release-checklist.md` is now the repeatable writing, playback, print, and restoration acceptance gate.
- Stale numbered copies and committed Finder metadata were removed. Do not restore them.
- Verification at this checkpoint: **570 checks passed, 0 failed**; the production build succeeded with the existing non-blocking large-chunk advisory.
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

- Diri as a two-consecutive-attack `V`;
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
