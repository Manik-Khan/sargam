# Sargam — Next Session Context & Handoff

**Updated:** 2026-07-19  
**Project:** Sargam notation editor/player + Vilambit practice player  
**Owner and musical authority:** Manik Khan  
**Assistant name:** Quill / Q  
**Supersedes:** `SARGAM_NEXT_SESSION_CONTEXT_2026-07-18.md`

## 1. Purpose

This is the authoritative handoff for the next Sargam work session. It records the current tested checkpoint, the print/layout improvements, editor navigation, tabla and melody-audio work, binding pitch rulings, current limitations, and the agreed next phase: **Vilambit Phase 2 — Player Core and Practice Bridge**.

Read this first, then consult:

- `CONTEXT.md` for the broader project history
- `docs/design-spec.md` for notation/product requirements
- `docs/build-plan.md` for code contracts
- `docs/notation-structure.md` for structural notation syntax
- `docs/vilambit-integration.md` for the original Vilambit roadmap
- `docs/soundfont-prototype.md` for the sampled-instrument implementation

When this handoff conflicts with an older test count or recent-state paragraph, this file is newer.

---

## 2. Current source of truth

The authoritative working copy is Manik's **GitHub Desktop clone**:

```text
Manik-Khan/sargam
```

Typical local path:

```text
~/Documents/GitHub/sargam
```

Latest assistant-prepared checkpoint:

```text
sargam-sampled-voice-latency-fix-full-checkpoint.zip
```

Latest changed-files package:

```text
sargam-sampled-voice-latency-fix-changed-files.zip
```

Verified checkpoint:

```text
370 passed, 0 failed
npm run build succeeded
```

Manik visually/aurally confirmed that the sampled-instrument latency correction worked.

Before beginning the next phase:

1. Confirm the latency-fix files are in the GitHub Desktop clone.
2. Run `npm run smoke` and `npm run build`.
3. Commit and push the stable audio checkpoint.
4. Inspect the actual current clone before editing; do not reconstruct from this prose alone.

For a future handoff, prefer a fresh ZIP of the actual clone after the latest push. Exclude:

```text
node_modules/
dist/
.git/
.DS_Store
```

---

## 3. Current product state

Sargam is now a functioning notation, playback, print, and practice environment:

- text remains the source of truth;
- notation renders in Manik's conventions;
- playback follows tala, ornaments, repeats, first endings, and Gat returns;
- long lines fold into safe visual systems;
- exports make substantially better use of the printable width;
- clicking notation seeks playback and locates the corresponding editor line;
- errors navigate to their source location;
- notation playback supports click, sampled tabla, several sampled instruments, tone controls, and tanpura;
- Vilambit remains mounted and continues playing while the user returns to Notation.

The next major value comes from making Vilambit and Notation exchange state.

---

## 4. Printing and responsive layout

### Full-width export packing

The export no longer relies only on an overly conservative fixed width. The browser measures the available notation area and the rendered matra widths, then packs more complete matras into each system before folding.

The existing browser **Print / Save as PDF** workflow was preserved. Do not reintroduce the abandoned change that replaced the print-page geometry or altered the browser's print capability.

### Rupak folding ruling

For Rupak, automatic continuation systems begin on **sam**, not at internal markers `1` or `2`. A long line may fold visually, but not through a beat, microbeat cluster, meend, repeat span, explicit hold slots, or another protected object.

### Current limitation

There is no manual Print Layout editor yet. The agreed order is:

1. make automatic packing strong enough for ordinary compositions;
2. later add musically anchored custom system/page breaks, density controls, and positioned print annotations.

Do not build arbitrary pixel dragging. Manual breaks and notes should anchor to musical identities such as line, matra, or boundary.

---

## 5. Preview-to-editor navigation

Clicking rendered notation now does two related things:

1. seeks playback to the clicked musical location;
2. scrolls to and focuses the corresponding source line in the editor.

The source line is temporarily selected/highlighted so the user can identify it among similar passages. The selection safely collapses before typing so an accidental keystroke does not replace the entire line.

Relevant files:

```text
src/shell/PreviewPane.jsx
src/shell/editor-nav.js
src/shell/App.jsx
smokes/editor-nav.smoke.js
```

This solves the problem of losing the correct source line as compositions become long.

---

## 6. Hidden structural display

These remain distinct in source and playback:

```text
gat
gat@1
gat@4
gat!
```

But preview and print display all Gat return forms simply as:

```text
gat
```

The `@N` and `!` distinctions are implementation/playback instructions, not observer-facing musical language.

Likewise, `|1` remains nonprinting first-ending structure.

---

## 7. Playback volumes and modes

Quieter defaults were introduced so notation playback can be compared with class recordings without constant system-volume changes:

```text
Melody: 40%
Tala:   25%
Tanpura: 16%
```

The browser remembers user choices locally.

Current tala modes:

```text
Click | Tabla | Off
```

Current tanpura modes:

```text
Off | Sa–Pa | Sa–ma
```

Tanpura is synthesized, reads the composition's `sa:`, and is independent of tala tempo.

Relevant files:

```text
src/shell/Transport.jsx
src/shell/audio.js
src/shell/tone.js
src/shell/sargam.css
```

---

## 8. Sampled tabla prototype

### Asset library

Tabla samples live under:

```text
public/audio/tabla/mmiron-cc0/
```

The package preserves:

```text
raw/
processed/
samples.json
README.md
SOURCE_AND_LICENSE.md
```

The approved first sounds are:

```text
na-open
ghe_7
ghe_3
ghe_4
tun_3
```

The source pack is CC0. Raw files are preserved; processed files were peak-reduced for headroom and given only a short terminal fade.

### Current Rupak pattern

Only Rupak has an approved/provisional sampled pattern:

```text
Tin Tin Na | Dhin Na | Dhin Na
```

Implementation:

- `tun_3` supplies the resonant dayan sound;
- `na-open` supplies open Na;
- Dhin layers approved Ghe with approved open Na;
- `ghe_7`, `ghe_3`, and `ghe_4` rotate to avoid exact repetition.

Relevant file:

```text
src/shell/tabla.js
```

Other talas intentionally fall back to the click until Manik approves their bols and mappings.

### Open tabla issue

The current sample kit has a fixed acoustic tuning. In keys far from the sample's resonance, tabla and melody can sound mismatched. This has not yet been solved.

Possible later approaches:

- small global tabla pitch correction for nearby keys;
- several recorded tabla tunings;
- automatic choice based on the composition's `sa:`;
- manual Sa/Pa tuning selection.

Do not silently retune or invent a mapping without Manik's ear approval.

---

## 9. Melody voices and tone controls

### Binding pitch ruling

**Changing the instrument may change timbre, articulation, and effects, but never the composition's pitch.**

A written `Sa A` must sound as A in every voice. There are no automatic whole-step or octave shifts. Western transposing instruments are used only as timbres and still reproduce Sargam's concert pitch.

Optional harmonium coupler and sub-octave are additive layers: the written pitch remains present.

### Current voices

Native Sargam synthesis:

```text
Current pluck
Neutral tone
```

SpessaSynth + local GeneralUser GS SoundFont:

```text
Reed organ / harmonium
Violin
Cello
English horn
Sitar
Shamisen
Koto
```

Canonical definitions:

```text
src/shell/voices.js
```

The sampled preset bank is bundled locally at:

```text
public/audio/soundfonts/generaluser/GeneralUser-GS-v1.471.sf2
```

The matching SpessaSynth AudioWorklet processor is bundled at:

```text
public/vendor/spessasynth/spessasynth_processor.min.js
```

NPM dependencies are pinned:

```text
spessasynth_lib  4.3.0
spessasynth_core 4.3.0
```

### Current tone settings

Each voice remembers its own:

```text
Touch / velocity
Brightness
Attack
Release
Room / reverb
Chorus
```

Neutral Tone additionally offers:

```text
Pure sine | Rounded triangle
Soft | Bell-like | Sustained | Short-pluck envelope
```

It always follows the written pitch. The earlier octave selector was removed.

Harmonium additionally supports:

```text
Upper coupler
Sub-octave layer
```

The rejected Soft Practice voice was removed. Its fixed-frequency resonance had introduced an unrelated out-of-tune pitch.

### GeneralUser licensing note

The bank is suitable for prototyping and is locally bundled, but its documentation notes uncertainty about the provenance of some inherited samples. Revisit that issue before treating GeneralUser GS as the final commercial-distribution sound library.

---

## 10. Sampled-instrument latency correction

Manik reported sampled voices sounding roughly a second behind the notation while Current Pluck remained aligned. This was an integration problem, not one second of silence inside the samples.

The corrected player now:

- uses a 300 ms audio lookahead for AudioWorklet scheduling;
- gives a ready sampled voice a hidden 60 ms startup lead;
- queues preset/pitch/controller preparation before note-on;
- avoids resending a large controller-message burst for every note;
- waits for actual AudioContext event time before moving the visible cursor;
- requests an interactive-latency `AudioContext` where supported;
- waits for SoundFont preparation rather than allowing an instrument to enter late;
- preserves a reliable Current Pluck fallback during failed loading.

Relevant files:

```text
src/shell/audio.js
src/shell/soundfont.js
src/shell/platform.js
src/shell/App.jsx
smokes/audio.smoke.js
smokes/tone.smoke.js
```

Manik confirmed this correction fixed the audible alignment.

Do not reduce the sampled-voice lookahead back to the older 100 ms value without device testing. Do not move the visual cursor when an event merely enters the lookahead queue.

---

## 11. Audio architecture

### Pure/event side

```text
src/engine/schedule.js
```

Produces timed note, tick, and cursor events. It owns musical timing, not browser audio.

### Browser playback side

```text
src/shell/audio.js
```

Owns:

- lookahead transport;
- gains and mutes;
- click/tabla selection;
- native pluck and neutral tone;
- sampled-voice dispatch;
- tanpura scheduling;
- loop/seek/play/pause;
- actual-time cursor delivery.

### Native DSP

```text
src/shell/dsp.js
```

Contains the local pluck, tanpura, and click/tick rendering.

### Sampled voice adapter

```text
src/shell/soundfont.js
src/shell/voices.js
src/shell/tone.js
```

SpessaSynth is the playback engine; GeneralUser GS supplies presets. The adapter converts the scheduler's exact frequency into the nearest MIDI note plus pitch bend.

---

## 12. Vilambit current state

Vilambit Phase 1 is already complete.

Current assets:

```text
public/vilambit.html
public/vilambit/vilambit.css
public/vilambit/vilambit-app.js
public/vilambit/vendor/signalsmith-stretch.js
public/vilambit/vendor/libflac.js
```

The iframe remains:

- always mounted;
- full-size in the shared stage;
- hidden with `visibility`, never `display:none`;
- granted `allow="autoplay"`.

This preserves waveform initialization and lets a recording continue playing/looping while the user returns to Notation.

The seek-before-first-play fix is binding:

- before an engine is selected, seeking writes both media and paused-buffer positions;
- `pos()` trusts the paused position while the engine is `none`;
- first play reconciles the chosen engine with that saved position.

Do not replace only `public/vilambit.html` with a new monolithic export.

---

## 13. Agreed next phase

# Vilambit Phase 2 — Player Core and Practice Bridge

The next phase should not visually rewrite Vilambit. Preserve the working player and build a narrow, testable communication layer.

### Step A — Extract a testable Vilambit controller core

Separate calculations/state for:

```text
loaded source
duration
current position
play / pause
seek
playback speed
pitch adjustment
loop A / B
markers
```

from direct DOM manipulation in `public/vilambit/vilambit-app.js`.

The first extraction must preserve current sound and UI behavior exactly.

### Step B — Define a narrow iframe message contract

Vilambit should report state such as:

```text
ready
source loaded
current position
duration
playing / paused
loop A / B
speed
pitch
markers
errors
```

Sargam should be able to request:

```text
play
pause
seek
set loop
clear loop
jump to marker
open/full Vilambit view
```

Use versioned structured messages. Validate message origin/source. Do not expose the entire internal player object across the iframe boundary.

### Step C — Compact Notation-side practice bar

First visible feature:

```text
Recording name        42:21 / 1:56:34
[Play] [−5s] [+5s]   Loop 42:18–42:38   [Open Vilambit]
```

The existing full Vilambit interface remains mounted and remains the owner of recording playback. The compact bar is a remote control/state display, not a second audio engine.

### Step D — Attach recording ranges to notation

After the bridge is stable, a notation line or annotation can reference:

```json
{
  "audioSourceId": "summer-class-2026-07-18",
  "lineId": "taan-4a",
  "startSeconds": 2538.4,
  "endSeconds": 2557.9
}
```

Clicking **Play class example** should:

1. activate/load the complete recording;
2. seek to the linked timestamp;
3. play, stop, or loop at the stored end;
4. leave the full source recording intact.

No clipped duplicate is required.

---

## 14. Phase after the bridge: anchored annotations

Annotations should be musically anchored, not stored as absolute page pixels.

Potential anchors:

```text
document
section
stable line identity
matra
note/token
boundary
audio source + timestamp/range
```

Potential display/permission flags:

```text
screen only
print
teacher layer
student layer
private
resolved
```

An annotation may eventually contain:

```text
“Listen to how the meend reaches n.”
Recording range: 42:24.2–42:28.7
```

Comment threads are a later server feature. Build local anchored annotation identities first so comments can attach without redesigning the model.

---

## 15. Longer-term roadmap

After Vilambit core/bridge, practice bar, timestamp links, and local annotations:

1. portable project package containing notation, metadata, annotations, and optional audio;
2. installable offline PWA and asset caching;
3. stable server-hosted audio identities and versions;
4. accounts and permissions;
5. teacher/student layers;
6. comment threads, corrections, and resolved status;
7. manual Print Layout mode with musically anchored system/page breaks.

Suggested portable project shape:

```text
Bageshri.sargam-project
  notation.md
  project.json
  annotations.json
  audio/
```

Avoid embedding audio as base64 inside Markdown.

---

## 16. Offline and compatibility status

Sargam's core assets, Vilambit engines, tabla samples, SoundFont, and SpessaSynth processor are now local to the project. After dependencies are installed, the clone can run through a local browser server without relying on external sound sites.

The hosted site is not yet a fully installable offline PWA because there is no service worker/cache manifest.

Recommended support priority:

```text
Current macOS + current Safari/Chrome
Windows 10/11 + current Chrome/Edge/Firefox
```

Windows 7 may receive best-effort degraded support, but it should not constrain the main architecture. Vilambit and SoundFont processing are the most demanding parts on older hardware.

---

## 17. Current smoke suites

The test runner auto-discovers:

```text
smokes/*.smoke.js
```

Current suites include:

```text
audio.smoke.js
commands.smoke.js
dictation.smoke.js
dsp.smoke.js
editor-nav.smoke.js
files.smoke.js
layout-systems.smoke.js
notation-structure.smoke.js
parse.smoke.js
print-width.smoke.js
problems-panel.smoke.js
render.smoke.js
rhythmic-fidelity.smoke.js
schedule.smoke.js
spessasynth-assets.smoke.js
tabla.smoke.js
tala.smoke.js
tone-ui.smoke.js
tone.smoke.js
vilambit-assets.smoke.js
western.smoke.js
```

Latest prepared checkpoint:

```text
370 passed, 0 failed
npm run build succeeded
```

The suite is necessary but not sufficient. Audio changes require Manik's ear; rendering and print changes require Manik's visual verification.

---

## 18. Standard commands

From the GitHub Desktop clone:

```bash
cd ~/Documents/GitHub/sargam
npm install
npm run smoke
npm run build
npm run dev
```

Vite commonly serves:

```text
http://localhost:5173/
```

Stop the server with:

```text
Control + C
```

For a clean lockfile installation on a fresh clone:

```bash
npm ci
```

---

## 19. GitHub Desktop/file workflow

Normal flow:

```text
Fetch/Pull
→ create/select branch
→ merge changed files
→ review Changes
→ test
→ commit
→ push
```

Do not replace the cloned `sargam` folder; it contains `.git`.

For a prepared changed-files folder:

```bash
ditto ~/Downloads/EXACT-EXTRACTED-FOLDER-NAME/ ~/Documents/GitHub/sargam/
```

Use the exact extracted folder name. Dragging the source folder into Terminal after typing `ditto ` is the safest way to avoid a path mismatch.

Do not commit:

```text
node_modules/
dist/
.DS_Store
ZIP archives
assistant patch scripts
```

---

## 20. Binding musical/product rulings

1. Manik is the authority on the notation tradition. Never invent raga, tala, bol, or notation behavior for implementation convenience.
2. Text is the source of truth.
3. Typed `|` is a soft phrase/layout divider; tala divisions derive automatically.
4. Explicit dashes are visible ink and time.
5. `|1` is playback structure and remains hidden in print.
6. `gat@N` and `gat!` remain distinct internally but display as `gat`.
7. A voice choice may never transpose the written melody.
8. SoundFont preset names and Western transposing-instrument conventions do not override Sargam's concert pitch.
9. Harmonium coupler/sub-octave are additive; the original written pitch remains.
10. Tabla thekas and sample mappings require Manik's approval.
11. Preview and export share the system planner.
12. Long lines may fold only at safe musical boundaries.
13. Annotations and layout notes should anchor musically, not to arbitrary page pixels.
14. Vilambit remains the recording-playback owner during bridge work.
15. Smokes first, then implementation, then Manik's visual/ear verification.
16. Assistants do not commit or push on Manik's behalf.

---

## 21. Session-start instructions for the next assistant

1. Read this document and `docs/vilambit-integration.md`.
2. Ask whether the latency checkpoint was committed and pushed.
3. Inspect the actual current repository.
4. Run `npm install`/`npm ci`, `npm run smoke`, and `npm run build`.
5. Do not begin with annotations or a Vilambit UI rewrite.
6. Begin with a behavior-preserving extraction of Vilambit's state/controller seams.
7. Write tests for pure position, loop, seek, marker, and state-transition logic before adding `postMessage`.
8. Preserve the always-mounted iframe and seek-before-first-play correction.
9. Deliver a small visible win in the same phase: the compact Notation-side practice bar.
10. Narrate failures plainly. A plausible hypothesis is not a diagnosis.

---

## 22. Short session summary

This session substantially strengthened Sargam as a listening and teaching tool:

- print systems fill the page more intelligently;
- Rupak folds at sam;
- notation clicks locate the matching editor line;
- internal Gat return syntax is hidden from observers;
- independent melody, tala, and tanpura volume controls were added;
- sampled Rupak tabla was introduced from approved CC0 strokes;
- multiple pitch-locked sampled melody voices were added through SpessaSynth;
- unified tone controls were added;
- SoundFont assets were localized for eventual offline use;
- a serious sampled-voice latency problem was found and corrected;
- Manik confirmed the final timing fix by ear.

The next session should convert Vilambit from a neighboring embedded tool into a controlled recording service for the notation view, beginning with a testable player core, a narrow iframe bridge, and a compact practice bar.

## Exact Anchor Framework source contracts (2026-07-20) <!-- SARGAM_EXACT_SOURCE_CONTRACTS_2026_07_20_V3 -->

This section records exact current identifiers that must be inspected before future patches.

- `src/engine/render.js` uses the symbol table name `BOL_SYMBOL`.
- Binding symbols: Da `|`, Ra `—`, Diri `V`, chikari `^`.
- Diri spans two consecutive attacks; it is not a one-note symbol.
- The legacy render smoke contains assertion comments `diri on g` and `chikari on m`. Patch those semantic assertions directly; do not locate the smoke by its title.
- The Anchor Framework meter field is identified by `id="cmd-anchor-meter"`; placeholder text is not a stable API.
- `ExportView.jsx` uses measured two-pass rendering: an initial render for width measurement, then a final render with `maxSystemEm`.
- Future installers must be tested against verbatim files from the current clone, not rewritten fixtures. Avoid guards based on variable names, exact whitespace, headings, test titles, or UI prose unless those are the actual contract.
- All edits must be computed and validated before any file is written.
## Notation continuity + exact current contracts (2026-07-20)

- Essential anchor marks, including Diri V connectors, must appear in Preview, Export preview, Print, and Save as PDF.
- Repeat glyphs `||:` / `:||` live in equal outside gutters and never narrow or offset shared matra columns.
- Tala-marker alignment is static; never animate its correction during playback rerenders.
- `{n~}D--{n~}D` is one matra with the timing of `D--D`: 3/4 + 1/4. Each D has its own untimed local n→D approach.
- `gat@8..@1` replays the preceding Gat from matra 8 up to, but not including, the next matra 1, then resumes the next written line. It displays simply as `gat`.
- Current score symbols: Da `|`, Ra `—`, Diri `V` spanning two attacks, chikari `^`.
- Current source contracts: ExportView is measured/two-pass and anchor overlays mount only after the final packed render; meter input ID is `cmd-anchor-meter`.
- Installer rule: inspect current files and match semantic behavior. Do not require variable names, smoke titles, placeholder prose, or exact whitespace; test against current-source-shaped fixtures before handoff.
