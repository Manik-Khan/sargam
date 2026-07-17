# Sargam — Session Context (updated 2026-07-16, evening)

Read this with `docs/design-spec.md` and `docs/build-plan.md` at session start. The spec is the requirements authority; the plan pins code contracts; this file says where things stand.

## State: M1 · M2 · M2.5 COMPLETE (incl. alignment/tilde/hang/property waves, eyeballed live) · KAN SHIPPED · M3 WAVE A (schedule engine) SHIPPED — Wave B (audio shell) NEXT

**Suite: 202 passed, 0 failed** (27 tala + 84 parse/serialize + 34 render + 35 files + 22 schedule). `npm run smoke` is the gate. Shell verified by Vite build + jsdom mount check (boot, dirty dot, autosave slot, restore-on-reload).

**Live: https://sargam-notation.netlify.app** — Netlify builds `Manik-Khan/sargam` main (`npm run build` → `dist`), auto-deploys on every GitHub upload, same rhythm as ToK. `sargam.manikkhan.com` is the eventual custom-domain move.

**M2 confirmed working in real use (screenshot 2026-07-16):** M notated a practice file ("Tanja Practice 07-16-26.md") — toolbar, Save, identity injection (`id`/`created`/`modified` written into the doc), filename + dot, clean render, no problems. M2 is closed.

- **M1 (Waves 1-3)** — engine (`model`/`tala`/`parse`/`serialize`/`render`), live editor+preview, problems strip.
- **M2 "keep your music"** — `src/engine/files.js` (3 seams: `ensureIdentity` pure text transform; `createStore(storage, clock)` autosave slot + recents + per-id snapshots; `createFileIO(env)` FSA/download). Shell: `Toolbar.jsx`, `platform.js` (the ONLY place browser APIs are real), `App.jsx` wiring (Cmd+S, 500ms-debounced autosave of raw text, restore-on-load, notice strip, unsaved confirm).

## M2.5 — "share your music" — BUILT 2026-07-16 (spec §3.1/§4.1/§4.2/§9/§10)

The wave that makes Sargam a complete *notation* tool before playback. All four slices shipped; engine smoked first (watched red), shell verified by Vite build + an extended jsdom mount check (Export/layout controls present, landing report silent at rest then correct with the cursor on the tihai line, layout toggle persists to `sargam.pref.layout`, export paper mounts with the raga heading and invokes print, form preview updates live, Create writes the frontmatter, Blank document yields an empty doc).

1. **Export view** — SHIPPED. `renderExport(doc)` in `render.js`; `ExportView.jsx` overlay + `@media print` scoped by `.app-root.is-exporting`. Button opens the notation alone — no toolbar, no editor, no problems strip, identity directives hidden — then the browser print dialog (*Save as PDF* = the artifact; a printer = paper). Offline, Safari-safe, zero dependencies, same engine output. **Header layout (M):** raga is the main title; the other metadata runs as a list down the far right. `title:` survives as the composition name under the raga — raga is the axis, title disambiguates the many pieces in one raga (Recent menu and filenames need it).
2. **Layout toggle** — SHIPPED. `store.getPref/setPref('layout')`; DOM order is preview-then-editor with CSS `order` preserving side-by-side as it shipped; the stacked editor uses native `resize: vertical` rather than a JS divider. Side-by-side <-> notation-on-top with the editor as a bottom strip (M's preference: more room for notation). Small toolbar control, remembered across sessions.
3. **Landing-report fix — SHIPPED. This was Claude's bug, not a design choice.** `render.js:169` appends the report unconditionally; spec §4 says it shows *"with the cursor inside a repeat."* Wording is also wrong: emitted `x2 lands on matra 8`; §3.9 pins `3rd P lands on matra 9 (khali)` — name the note and the cycle position. Fix needs cursor plumbing: textarea `selectionStart` -> source line -> `renderDocument(doc, opts)` (the `opts` seam already exists for M3's `activeCursor`).
4. **New-document form** — SHIPPED. `newDocumentText(fields)` in `files.js` (pure, smoked); `NewDocDialog.jsx`. Fields: Raga · Tala · Composition (Vocal/Instrumental buttons) · Speed (Vilambit/Madhya/Drut buttons) · BPM. Writes correct frontmatter so directive names never have to be remembered — same principle as the selection commands ("the machine maintains the syntax"). **Must be skippable:** a blank-document escape hatch beside the create button; the scratchpad is the daily case and five fields is friction on it.

**Settled in the form design:** the "BPM" field writes the **existing `tempo:` directive** — it is already bpm-per-matra (spec §3.1). Do NOT introduce a second `bpm:` directive; one value, one key, corpus untouched.

## Kan/ornament grammar (M, 2026-07-16 — spec §3 amended, SHIPPED)

`{graces}X` — braces hold the grace run, the note after owns the beat: `{'S}n`, `{dP}m`, `{P'SN'R'SN'S}N`. Internal cluster tildes are shorthand for the same (`'S~n`, `d~P~m` — note after the LAST tilde is the destination). Graces render small+raised with the connecting curve; playback slides the run, graces steal ≤ half the beat off the destination's front (1/12 matra each), grid never moves. **Semantic change, M-ruled:** internal tilde WAS within-matra meend; that meaning now belongs only to the leading form `~N'S`, and serialize emits leading form (the old canonical `P~S` would reparse as a kan). Orphan `{run}` narrates. Braces inside `[ ]`/`[[ ]]` unsupported v1 (narrates as unrecognized). Kan span type: `'kan'` (renders via the meend arc path, class `sr-arc-kan`).

## M3 Wave A — schedule.js (SHIPPED, engine only)

`scheduleDocument(doc, {tempo?}) → {events, duration, lineStarts}`. Events sorted by t: `note` (t/dur seconds from exact fractions, ch/semitone/octave/freq, grace?, glideFrom? for meend), `tick` (accent sam|khali|vibhag|plain from tala.js data, none in free), `cursor` (per played matra, carries sourceLine). Repeats unroll (`||: :||` ×2, `(…)xN`); whole-matra sustains extend the ringing note; rests silence it. `parseSa`: letter+accidental+optional octave, bare letter = octave 3 (sarod `C`→C3≈131Hz, sitar `D`, vocal `A3`=220 — M's anchors); default stays `C#` pending M. `SEMITONES` table confirmed by M: S0 r1 R2 g3 G4 m5 M6 P7 d8 D9 n10 N11. Grace sliver constants in schedule.js (`GRACE_FRACTION` 1/12, `GRACE_CAP` 1/2) — ear-pass tunables.

**Wave B (NEXT, needs transport mock → M approval first):** WebAudio voices + lookahead scheduler (~25ms/~100ms) in the shell (`platform.js` pattern), synchronous start on gesture (Bardic), transport UI (play/pause/stop, tempo, loop line/section, play-from-cursor via `lineStarts`), track toggles (melody/tick), cursor highlight via `opts.activeCursor` (render seam exists). Then Wave C: the ear pass (timbre, tick sounds, glide shaping, kan feel) — judged by M, never "good enough for verification."

## Settled by M, 2026-07-16 (was open — now binding)

1. **`laya:`** is the key for vilambit/madhya/drut.
2. **No prefill, ever.** `laya:` and `tempo:` are independent: a composition may have been *taught* at a specific bpm, and that is provenance worth recording on its own rather than deriving from a laya class.
3. **`composition:`** = vocal/instrumental. **`type:` is a different axis** M named: what the *document* is — a composition, an alap, a transcription. Reserved in the spec and in `KNOWN_KEYS`; not in the form yet — M's call whether it joins.
4. **All header metadata is optional/selectable.** The form emits only filled fields; nothing filled = a blank document.

**Found while building:** `laya:`/`composition:` already parsed and round-tripped before this wave — the parser accepts any `key: value`. The only engine change needed was `KNOWN_KEYS` in `serialize.js` (canonical order: … tempo, composition, type, laya, id …), which keeps Appendix A byte-stable.

## Open items

- **M's eyeball on M2.5 (live):** export page (raga heading size, the far-right meta list, print margins), the stacked layout's editor height, the form's field order and copy, the landing report's tone. All CSS/copy.
- **Does `type:` join the form?** (composition / alap / transcription). Spec reserves it; one field to add when M says.
- **M's eyeball on M2 chrome:** toolbar sizing, dot vs. glyph, Recent menu feel, notice tone. All CSS/copy tweaks — redline anytime.
- **Mocks:** inline visual mocks did NOT render on M's client this session. **New mock channel: stage mocks as standalone double-clickable HTML files in the outputs** (the app-zip channel works). Mock -> approve -> build still binding for the export view and the layout toggle.
- **Rendering ground truth:** the two notation scans (Kirwani khyal, 1979 Desh) STILL not uploaded (third session running) — they'd settle kan sizing and grouping-mark questions on sight.
- **Kan eyeball:** grace size (.55em) / raise (translateY -0.7em) / curve are CSS tunables pending M's eye (kan-check.html staged 2026-07-16).
- **Known v1 limits (accepted):** mid-doc non-tal directives collapse into the header on serialize; tildes inside bracket-form matras dropped; zero-music-token line reads as a section label; barless lines skip vibhag validation; recents restore from autosave snapshot, not disk.
- **NEXT — M3 "hear your music":** `schedule.js`, melody + tick + cursor tracks, transport, loop, play-from-cursor. Bardic lessons: AudioContext clock, lookahead scheduler, synchronous start on the play gesture. Performance corollary governs sound. Own planning pass, smokes first. The cursor plumbing M2.5 slice 3 builds is the same machinery M3 needs.
- **Grid editor stays last** (Phase 2, own mock->approve->build): it gets materially easier to design once playback's cursor/highlight machinery exists.

## Working rules (unchanged, binding)

Engine is plain JS, never imports React (`render.js` produces DOM only; browser APIs injected via `src/shell/platform.js`). Smokes first, watch red, implement fresh; `node --check` + green suite before every handover; smoke green + M's eyeball = done. Mock -> approve -> build for all UX/layout. Surgical edits only. M deploys manually (GitHub upload -> Netlify auto-builds); Claude never commits or pushes; outputs staged at bare repo paths; **built-app zips are never unzipped into the repo folder** (that overwrote root `index.html` with built output on 2026-07-16 — repaired same day; source `index.html` must reference `/src/main.jsx`). **Claude runs the suite against M's actual repo before every handover; M's part is the eyeball — the terminal is optional for M.** Spec ambiguity mid-build: stop, ask M, amend the spec — never improvise the tradition.

## Repo map

`src/engine/`: `model.js` fractions/shapes (+`frontmatter`) · `tala.js` · `parse.js` (frontmatter-aware) · `serialize.js` (form-preserving) · `render.js` (+`renderExport`; landing report cursor-scoped) · `files.js` (+`newDocumentText`, `get/setPref`). `src/shell/`: `App.jsx` · `Toolbar.jsx` · `platform.js` · `EditorPane.jsx` (reports cursor line) · `PreviewPane.jsx` · `NewDocDialog.jsx` · `ExportView.jsx` · `sargam.css`. `smokes/`: `run.js` + four suites. `docs/`: spec, plan. Root: `index.html` (Vite source), `CONTEXT.md`. M's copy: `/Users/khansolo/Sargam`. Live: sargam-notation.netlify.app.
