# Sargam — Project Context & Handoff (updated 2026-07-19)

**What this is:** a complete D&D-session-style handoff for Sargam — M's web app for writing, rendering, and hearing Hindustani classical notation. Written so that *anyone* can pick the project up cold: M working alone, a future AI assistant, a human collaborator. Read this with `docs/design-spec.md` (the requirements authority) and `docs/build-plan.md` (code contracts). If you are an AI assistant: the working rules at the bottom are binding; M is the authority on the tradition — never improvise raga/tala/notation semantics, ask him.

## Authoritative recent-state update (2026-07-19)

For the next session, read `SARGAM_NEXT_SESSION_CONTEXT_2026-07-19.md` first. It supersedes the 2026-07-18 handoff and older current-state/test-count prose below.

Latest prepared and ear-confirmed checkpoint:

```text
sargam-sampled-voice-latency-fix-full-checkpoint.zip
370 passed, 0 failed
npm run build succeeded
```

Major additions since the prior context:

- measured full-width print packing and Rupak continuation at sam;
- preview click → playback seek + matching editor-line focus/highlight;
- `gat@N` and `gat!` display/print simply as `gat`;
- remembered melody/tala/tanpura gains and Click/Tabla/Off tala modes;
- approved CC0 Rupak tabla prototype;
- pitch-locked native and SpessaSynth/GeneralUser melody voices;
- per-voice touch, brightness, attack, release, room, and chorus settings;
- local SoundFont/AudioWorklet assets;
- corrected sampled-voice/cursor latency, confirmed by M.

The agreed next phase is **Vilambit Phase 2 — Player Core and Practice Bridge**: extract testable Vilambit state, add a narrow iframe message contract, and build a compact Notation-side practice bar before timestamp-linked notation and anchored annotations.


## Vilambit is inside Sargam (integration Phase 1, 2026-07-18)

`public/vilambit.html` — M's practice player entry page (slow-without-pitch-change, Signalsmith Stretch WASM, A-B loop, markers, BPM detection; fully local, zero external URLs). Phase 1 split the former monolith into `public/vilambit/vilambit.css`, `public/vilambit/vilambit-app.js`, and the generated engines under `public/vilambit/vendor/`; Vite still ships the entry page and those assets verbatim into `dist/`. It renders in the **Vilambit tab** (toolbar, next to Notation). **Both views sit on one `.app-stage`, both always mounted at FULL SIZE (absolute, inset 0); the inactive one is veiled with `visibility`, NEVER `display:none`.** Two bugs taught this (M, 2026-07-16): (1) Vilambit calls `clientWidth`/`getBoundingClientRect` at startup — inside a display:none frame those are 0, its waveform never initializes, and it looks "blocked" when it was simply born with no dimensions; (2) `visibility:hidden` keeps media playing, which is the whole point. The iframe also **requires `allow="autoplay"`** — Vilambit drives a `<video>` through `createMediaElementSource` and a frame without that permission cannot start it. The mount check asserts node identity survives tab switches, which is the mechanism guaranteeing **the recording keeps looping while you notate**. Sargam's Space play/pause is guarded off while the Vilambit tab is up (the frame has its own keys). To update Vilambit after the Phase 1 split: preserve the separated asset layout or re-run the extraction before committing; do not overwrite only `public/vilambit.html` with a fresh monolithic export. **CAUTION: `public/vilambit.html` has been PATCHED (2026-07-16) — carry the fix forward or re-apply it.** The bug (M's report: "click ahead in the audio file before pressing play and it won't play; you have to refresh and press play first"): `state.engine` is `'none'` until `buildGraph()` runs on the FIRST PLAY, but `seekTo()` and `pos()` branch on it — so a seek before play wrote `media.currentTime` while the (audio-file) buffer engine reads `state.posPaused`, and the seek was silently discarded. Fix: while `engine === 'none'` a seek writes BOTH stores; `pos()` trusts `posPaused`; `togglePlay()` reconciles the two the moment the engine is chosen. Vilambit now has static integration smokes that verify the split asset order, engine presence, app test hook, and seek-before-first-play routing. The extracted JavaScript files also pass `node --check`; actual AudioContext/WASM playback remains a browser-and-ear verification. This is the transcription workflow the docs called "Vilambit and Sargam merged": loop the phrase there, write it here.


## Rhythmic fidelity + Gat return cues (2026-07-18)

Internal dashes inside one-beat clusters are now preserved as written visual slots instead of disappearing into duration. `DnS-` renders as four equal slots (`D n S —`), `g---` renders `g — — —`, and the under-arc spans the whole written subdivision. The model stores `event.writtenSlots` only when an explicit dash extends an event; playback timing and attack count are unchanged. This distinction matters because `[SR g]` gives `g` a half beat through bracket hierarchy but must NOT invent a printed dash, while `g---` explicitly asks for three visible holds. Serialization preserves both cases.

A terminal Gat token is zero-time return structure. Plain `gat` now enters the nearest preceding Gat at the tala position where the source line lands; `gat@N` explicitly enters at matra N; `gat!` replays from the Gat's written beginning. All forms render cleanly, replay once, resume at the next written line, ignore nested cues, and diagnose interior/missing targets precisely. The checkpoint suite is **335 passed, 0 failed**.


## Responsive systems + aligned returns (2026-07-18)

Long source lines are no longer globally reduced with CSS `zoom`. `src/engine/layout.js` plans one or more visual systems using estimated matra widths. It breaks only between whole matras, never through `~(...)`, `[[...]]`, `( )xN`, a beat cluster, or explicit micro-hold slots. Break priority: written soft `|`, automatically derived sam/khali, other derived vibhag boundaries, then the latest safe beat. Preview and export use the same planner; continuation systems keep absolute matra indices for click-to-seek, repeat glyphs stay at the outer edges, and print may paginate between systems while keeping each system intact. The default starter is now M's complete Raga Bageshri corpus (`src/examples/bageshri.js`) without copied identity fields. Existing autosaves still restore by design.

## Where things stand: M1 · M2 · M2.5 · KAN · M3 (Waves A+B+C) ALL SHIPPED

Sargam is a **working instrument**: type notation → see it rendered in the hand's own conventions → press Space and hear it, with tal ticks, loop-a-line practice, click-to-position, kan ornaments that slide, meends that bend, export to PDF, save/autosave, and a Netlify deployment.

- **Live:** https://sargam-notation.netlify.app (Netlify auto-builds `Manik-Khan/sargam` main: `npm run build` → `dist`). Custom-domain move to `sargam.manikkhan.com` whenever wanted (Domain management, same as tok.manikkhan.com).
- **Suite checkpoint: 335 passed, 0 failed** after responsive systems, Bageshri starter, and aligned Gat returns. `npm run smoke` is the gate; green suite + M's eyeball/ear = done. The runner auto-discovers every `smokes/*.smoke.js`, so the total will continue to grow.
- **Verified against the handwriting** (2026-07-16, two scans: 5-16-82 exercise page; Jaijaiwanti med. tintal): kan, arcs, octave marks, sustains, vibhag numerals all match. Divergences backlogged (below).

## How to work on this alone (M — this section is for you)

1. `npm install` once per fresh checkout; `npm run dev` for live editing; `npm run smoke` before trusting any change; `npm run build` before deploying (or just push to GitHub — Netlify builds).
2. **The smoke suite is your safety net.** Hundreds of checks encode the project rulings; the 2026-07-18 current checkpoint has 325. If you (or any future helper) change engine code and the suite stays green, the notation semantics survived. If a smoke fails, either the change is wrong or the ruling changed — update the smoke ONLY with a comment saying which ruling superseded it (see the "SUPERSEDED" comments in parse.smoke.js for the pattern).
3. **Sound tuning needs no programming.** Every audio constant is labeled and isolated (next section). Change a number, refresh, listen.
4. **Handing off to a future AI:** give it this file + the spec + the repo. That combination has been the whole memory system of this project; it works. State the working rules apply.

## The ear pass — tunables, all yours (Wave C is judged by your ear, never "good enough")

- `src/shell/dsp.js` — the voices:
  - `renderPluck`: `bright` (0..1, attack roundness), the `decay` line (ring length; currently longer for low notes), excitation seed.
  - `renderTick`: the `shapes` table — per-accent `dur`/`bright`/`gain`/`thump` (sam has a 180 Hz thump; khali is deliberately dull — marked by absence).
- `src/shell/audio.js` — the performance:
  - `PLUCK_S` (rendered ring length), the meend bend: `setTargetAtTime(1, at, Math.min(0.14, dur * 0.45))` — the two numbers are bend speed.
  - grace loudness (`0.55`), note level (`0.9`), note-off fade (`0.06`).
- `src/engine/schedule.js` — the feel:
  - `GRACE_FRACTION` (1/12 matra per kan grace) and `GRACE_CAP` (grace run ≤ 1/2 beat).
- **The endgame voice is your own sarod.** The track interface is sample-ready (spec §6 theka slot; melody can follow the same pattern): record one clean pluck per note (even Sa/Pa per octave, pitch-shifted between), host in the repo or Cloudinary, wire as buffers where `pluckBuffer()` sits today. No one else can source that sample set.

## Roadmap (spec §9) — what remains

- **Dictation (`src/engine/dictation.js`, SHIPPED 2026-07-16, 18 smokes):** `spokenToAtoms(input, {raga}) → {atoms, problems}` + `atomsToText(atoms, {separator})`. Type/say `sa ga ma pa dha ni sa` → `S G m P D N S`; raga defaults (`RAGA_SCALES` — DATA, Bhairavi present from M, **never invent a raga's notes**); explicit `komal`/`shuddh`/`tivra` override; octave words `low`/`high` + `mandra`/`madhya`/`taar` (ONE-SHOT — M may prefer sticky); bare notation letters accepted and mixable with words (M's own example did this). **UI SHIPPED** (`src/shell/DictateBar.jsx`, "Dictate" button): type syllables → live preview → Insert at the text cursor; "one beat" checkbox toggles the separator (M's open ruling on the default). **Mic button is an honest experiment**: Web Speech API, Chrome-only, en-US-trained (sargam WILL mangle — extend `ALIASES` in dictation.js from what you actually see), and it SENDS AUDIO TO A SERVER — the one place Sargam breaks its offline principle; opt-in per use, never passive, and the UI says so. Typing needs none of it. **Field fixes from M's live mic test (2026-07-16, "sa re ga ma pa" → "sorry I got my fire"):** (1) mic input parses with `caselessLetters: true` — spoken letters map to syllables and the raga decides the form (case carries no information in voice; typed keeps case, with lowercase s/p forgiven since no komal form exists); (2) **digits are the reliable spoken channel** — 1..7 and one..seven map to Sa..Ni with raga defaults, because recognizers nail numbers and mangle Sanskrit; (3) `ALIASES` accepts multi-word expansions and carries M's actual field data (sorry→sa re, got→ga, my→ma, fire→pa) — KEEP EXTENDING from real recognizer output; (4) insert now reads the LIVE textarea caret (the tracked one was stale-zero before the first click, so inserts landed inside the frontmatter), and a never-placed caret appends at the end instead of corrupting the header. The durable answer remains an on-device model (see spec §10: Web Speech API breaks the offline principle; on-device model is the right answer and needs training data M is uniquely able to record). M's open rulings noted in the module's comments.
- **Western notation (`src/engine/western.js`, SHIPPED 2026-07-16, 15 smokes; "Staff ↗" button in the toolbar):** `spellDegree(saValue, ch, octave) → {step, alter, octave, midi}` and `documentToMusicXML(doc) → string`. **The spelling rule (the part that needs sargam):** each degree owns a LETTER — Sa=tonic letter, Re=2nd, Ga=3rd, Ma=4th, Pa=5th, Dha=6th, Ni=7th — komal/tivra become the accidental. Sa=C → komal ga = E♭; Sa=D → the same komal ga = F natural. No key-signature guessing: sargam states the scale degree that Western spelling has to infer. XML: time sig from the tal (tintal 16/4, rupak 7/4), one measure per avartan, notes crossing barlines split + tied, sustains lengthen notes, rests emit, kans become `<grace slash="yes"/>` acciaccaturas (correct — a kan is crushed), tempo → metronome mark, raga/laya/year/etc → miscellaneous-fields. **Known limits:** no `<time-modification>` tuplet markup yet (durations are exact; importers infer the beaming) — that's the natural next increment; free sections flow in 4/4; single staff, treble clef, no key signature (accidentals are explicit — arguably right for this music).
- **Western note-name toggle SHIPPED** ("SRG"/"CDE" button, persisted as pref `noteNames`): `renderDocument(doc, {noteNames:'western'})` swaps ONLY the letter — same grid, same octave dots, same tints, same arcs; the text stays sargam always. Export view honors it. This is a reading aid, NOT staff notation.
- **A LIVE staff toggle is a separate milestone**, not an increment: it needs VexFlow (a real dependency) plus a full tuplet/beam/ledger layer. MusicXML gets ~80% of the value today and is verifiable in node, which is why it went first. If someone builds the toggle, `spellDegree` + `flatten()` in western.js are the foundation and already do the musical thinking.
- **M4 — CORE SHIPPED (2026-07-16, M's direct commission):** `src/engine/commands.js` (pure, 12 smokes) + `CommandBar.jsx` (format strip above the editor: ~ slide · {} kan · [[]] krintan · [] beat · ()×3 · ||: :|| · oct+/−) + `Legend.jsx` ("Key" toolbar button — the full notation reference, data-driven, doubles as the app teaching the notation). Select → click → grammar applied; result stays selected so commands stack. Octave shift is ARITHMETIC on existing marks ('S down → S, never .'S). NOTE: built without a prior mock (deviation from the mock-first rule, disclosed — terminal time pressure; UI reuses approved patterns). GOTCHA THIS CREATED (fixed same day): the `.app-editor-col` wrapper broke the layout — `.app-layout-side/.app-layout-stacked` rules targeted `.app-editor` as a DIRECT flex child of `.app-panes`, so order/flex/height stopped applying and the bottom editor vanished. The layout rules now target `.app-editor-col`; the textarea fills it. **If you ever wrap a pane again, move its layout rules with it.** REMAINING M4: the `/` menu; per-note octave handling inside bracket slots is untested territory; tihai as a first-class command (currently ()x3 covers it).

- **Notation structure wave (SHIPPED locally 2026-07-18):** `~(...)` draws one meend across multiple written matras without compressing them into one beat. `|1` marks first-pass-only ending material inside `||: ... :||`; the second pass stops at `|1` and continues to the following line. The structural volta element remains in the render model for testing but `.sr-volta-first` is hidden in normal view and print. Ordinary typed `|` is a soft phrase divider, not a mandatory tal-vibhag assertion; actual vibhags derive from tal + `@N` + matra position.
- **Diagnostics follow-up (SHIPPED locally 2026-07-18):** problems are collapsed by default, grouped, height-limited when opened, and clickable. Clicking focuses the textarea, scrolls to the source line, and selects the offending token when a precise column exists. False vibhag errors from phrase bars were removed at the parser level rather than merely hidden.
- **M5 — harden:** verify the remaining tal definitions WITH M (data-only edits in `src/engine/tala.js`), free-section polish, broaden smokes.
- **Grid editor:** Phase 2, own design cycle; the playback cursor machinery it needs now exists.
- **Backlog with scan evidence (spec §10):** render phrase repeats as the hand's square-bracket + `2x`; landing rendered as the tiny `(+)` above the landing note (as on the 1982 page — M has hand-computed these in margins for decades); khali as `°`; cross-rhythm ("stretch tihai evenly 3/7" — the model's exact fractions were built for it); second/third volta endings beyond the shipped first-ending exit; sampled voices; Supabase sync; image export.
- **Open rulings (M's, whenever):** the laya ladder wording (spec §3.1 has a PROPOSED 7-rung spectrum marked as inference — correct it, then update the New-doc form's options to match); whether `type:` (composition/alap/transcription) joins the form; ~~whether the default `sa:` moves from C# to C~~ — RULED: default is C (M, 2026-07-16, "I have the key as C"); `DEFAULT_SA` exported from schedule.js, imported by western.js and render.js; "Key (Sa)" field in the New Doc form with the three anchors. NOTE the trap that surfaced it: `key: C` in the frontmatter prints on export (provenance tier) but does NOT drive pitch — only `sa:` does.

## The settled rulings (all M's, 2026-07-16 unless noted — binding on any future collaborator)

- **Text is the source of truth.** Save writes the editor text verbatim + surgical identity edit; never serialize(parse(text)). The transport BPM knob WRITES `tempo:` for the same reason.
- **`laya:`** = the tradition's word for speed (full spectrum, no numbers). **`tempo:`** = the literal playback bpm. Independent; never prefill either from the other.
- **`composition:`** vocal/instrumental. **`type:`** reserved: what the document IS (composition/alap/transcription). All header metadata optional.
- **Avartan continuation (M, 2026-07-16 evening):** a metered music line CONTINUES its section's cycle position across written line breaks — the tradition's convention (M's Jaijaiwanti page does it in ink). `@N` remains the explicit override (and only explicit `@N`s serialize — `line.explicitStart`; auto positions are recomputed each parse, never fossilized into text). A LABELED section resets to sam; a blank line (which opens an unlabeled section) does NOT — spacing isn't a musical reset. Continuation counts WRITTEN matras (a `||: :||`'s second pass doesn't shift the next line's ink position). Vibhag validation, markers, playback ticks all follow automatically since they read `startMatra`.
- **Responsive notation (superseded 2026-07-18):** the old whole-line `zoom` fitter is gone. `layout.js` folds a semantic line into readable systems using soft bars and derived tala boundaries, never inside a beat or ornament. Preview/export share the planner; an indivisible object may scroll rather than shrink into illegibility.
- **Kan/ornament:** `{graces}X` — braces hold the run, the note after owns the beat. Internal tildes are shorthand (`'S~n`, `d~P~m`); the note after the LAST tilde is the destination. `{run} X` (spaced) attaches FORWARD — sounds before the beat, trimming the previous note. Leading `~mg` = within-matra meend (canonical form; the old `P~S` spelling now means kan). `m~ g` = two-beat cross-matra meend. Under-arc = subdivision of TIMED notes only; the writer chooses the look by the spelling.
- **Playback:** repeats unroll; graces never move the grid; meend = strike-then-bend; free sections tick-silent; sa anchors — sarod `C`, sitar `D`, vocal `A` (A3=220, chosen for mixed voice ranges); bare letters at octave 3.
- **Pitch table (M-confirmed):** S0 r1 R2 g3 G4 m5 M6 P7 d8 D9 n10 N11; capitals shuddha, lowercase komal, capital M tivra.

## Architecture spine (for whoever reads code next)

`src/engine/` is plain JS, imports no React, touches no browser API: `model.js` (exact fractions) · `tala.js` (tal DATA + arithmetic — new tals are data edits) · `parse.js` (text→model; never throws; watchdogged against non-advancing scans after the 2026-07-16 freeze bug) · `serialize.js` (model→canonical text; round-trip stable) · `render.js` (model→DOM; three-lane alignment invariant; export view) · `schedule.js` (model→timed events) · `files.js` (identity/store/fileIO/setDirective — browser surfaces injected). `src/shell/` is React + the ONLY browser touches: `platform.js` (pickers, download, AudioContext) · `audio.js` (lookahead player) · `dsp.js` (pure Karplus-Strong + ticks) · `App.jsx` and components. `smokes/run.js` auto-discovers `smokes/*.smoke.js`.

Hard-won gotchas: parse runs per keystroke — any non-advancing scanner branch = frozen browser (watchdog now guards); optional render lanes = misaligned rows (three-lane invariant now smoked); never unzip a built-app zip into the repo (it overwrote index.html once — source index.html must reference `/src/main.jsx`); Netlify deploys need the marker check (View Source, asset hash changed) before trusting your eyes.

## Working rules (binding)

Smokes first, watch red, implement, green; suite + M's eyeball/ear = done. Mock → approve → build for UX/layout. Surgical edits; read actual source before editing ("a plausible hypothesis is not a diagnosis"). M deploys (GitHub → Netlify); assistants never commit or push. Spec ambiguity: stop, ask M, amend the spec — **never improvise the tradition.** Failures narrate. All prior sessions' outputs staged at bare repo paths; suite run against M's actual code before every handover.

---

*Project history in brief: built across 2026-07-16 sessions from spec → parser/renderer (M1) → files/autosave (M2) → export/layout/form (M2.5) → kan ornament grammar (M's own) → full playback (M3 A/B/C). Corpus: Appendix A in the spec. M's copy: `/Users/khansolo/Sargam`. The two scans that verified the rendering are the 5-16-82 exercise page and the Jaijaiwanti tintal page — keep them with the project.*

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
