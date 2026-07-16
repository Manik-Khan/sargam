# Sargam — Session Context (updated 2026-07-16, evening)

Read this with `docs/design-spec.md` and `docs/build-plan.md` at session start. The spec is the requirements authority; the plan pins code contracts; this file says where things stand.

## State: M1 COMPLETE · M2 COMPLETE (eyeballed live) · M2.5 NEXT (specced, not built)

**Suite: 121 passed, 0 failed** (27 tala + 50 parse/serialize + 17 render + 27 files). `npm run smoke` is the gate. Shell verified by Vite build + jsdom mount check (boot, dirty dot, autosave slot, restore-on-reload).

**Live: https://sargam-notation.netlify.app** — Netlify builds `Manik-Khan/sargam` main (`npm run build` → `dist`), auto-deploys on every GitHub upload, same rhythm as ToK. `sargam.manikkhan.com` is the eventual custom-domain move.

**M2 confirmed working in real use (screenshot 2026-07-16):** M notated a practice file ("Tanja Practice 07-16-26.md") — toolbar, Save, identity injection (`id`/`created`/`modified` written into the doc), filename + dot, clean render, no problems. M2 is closed.

- **M1 (Waves 1-3)** — engine (`model`/`tala`/`parse`/`serialize`/`render`), live editor+preview, problems strip.
- **M2 "keep your music"** — `src/engine/files.js` (3 seams: `ensureIdentity` pure text transform; `createStore(storage, clock)` autosave slot + recents + per-id snapshots; `createFileIO(env)` FSA/download). Shell: `Toolbar.jsx`, `platform.js` (the ONLY place browser APIs are real), `App.jsx` wiring (Cmd+S, 500ms-debounced autosave of raw text, restore-on-load, notice strip, unsaved confirm).

## M2.5 — "share your music" (M's calls, 2026-07-16; spec amended §3.1/§4/§7/§9/§10)

The wave that makes Sargam a complete *notation* tool before playback. Four slices:

1. **Export view** (spec §4.1 new). Button opens the notation alone — no toolbar, no editor, no problems strip, identity directives hidden — then the browser print dialog (*Save as PDF* = the artifact; a printer = paper). Offline, Safari-safe, zero dependencies, same engine output. **Header layout (M):** raga is the main title; the other metadata runs as a list down the far right. `title:` survives as the composition name under the raga — raga is the axis, title disambiguates the many pieces in one raga (Recent menu and filenames need it).
2. **Layout toggle.** Side-by-side <-> notation-on-top with the editor as a bottom strip (M's preference: more room for notation). Small toolbar control, remembered across sessions.
3. **Landing-report fix — this was Claude's bug, not a design choice.** `render.js:169` appends the report unconditionally; spec §4 says it shows *"with the cursor inside a repeat."* Wording is also wrong: emitted `x2 lands on matra 8`; §3.9 pins `3rd P lands on matra 9 (khali)` — name the note and the cycle position. Fix needs cursor plumbing: textarea `selectionStart` -> source line -> `renderDocument(doc, opts)` (the `opts` seam already exists for M3's `activeCursor`).
4. **New-document form** (spec §3.1 amended). Fields: Raga · Tala · Composition (Vocal/Instrumental buttons) · Speed (Vilambit/Madhya/Drut buttons) · BPM. Writes correct frontmatter so directive names never have to be remembered — same principle as the selection commands ("the machine maintains the syntax"). **Must be skippable:** a blank-document escape hatch beside the create button; the scratchpad is the daily case and five fields is friction on it.

**Settled in the form design:** the "BPM" field writes the **existing `tempo:` directive** — it is already bpm-per-matra (spec §3.1). Do NOT introduce a second `bpm:` directive; one value, one key, corpus untouched.

## Open questions — ASK M FIRST, do not improvise (tradition authority)

1. **Directive key for speed:** `laya:` (the tradition's word) or `speed:` (plain English)? M's call.
2. **Does laya prefill BPM?** If choosing Vilambit/Madhya/Drut should set a starting `tempo:` number, M supplies the numbers — ranges vary by gharana and tal and Claude must not assert them. Default if M declines: laya and tempo stay independent, no prefill.
3. **Directive key + semantics for Vocal/Instrumental:** key name (`composition:`? `type:`?), and does the flag *do* anything in v1 (e.g. gate lyric vs bol lines, or later M4 selection commands) or is it pure metadata? Metadata-only is the safe default.

## Other open items

- **M's eyeball on M2 chrome:** toolbar sizing, dot vs. glyph, Recent menu feel, notice tone. All CSS/copy tweaks — redline anytime.
- **Mocks:** inline visual mocks did NOT render on M's client this session. **New mock channel: stage mocks as standalone double-clickable HTML files in the outputs** (the app-zip channel works). Mock -> approve -> build still binding for the export view and the layout toggle.
- **Rendering ground truth:** the two notation scans (Kirwani khyal, 1979 Desh) still not uploaded — compare when M provides.
- **Known v1 limits (accepted):** mid-doc non-tal directives collapse into the header on serialize; tildes inside bracket-form matras dropped; zero-music-token line reads as a section label; barless lines skip vibhag validation; recents restore from autosave snapshot, not disk.
- **After M2.5 — M3 "hear your music":** `schedule.js`, melody + tick + cursor tracks, transport, loop, play-from-cursor. Bardic lessons: AudioContext clock, lookahead scheduler, synchronous start on the play gesture. Performance corollary governs sound. Own planning pass, smokes first. The cursor plumbing M2.5 slice 3 builds is the same machinery M3 needs.
- **Grid editor stays last** (Phase 2, own mock->approve->build): it gets materially easier to design once playback's cursor/highlight machinery exists.

## Working rules (unchanged, binding)

Engine is plain JS, never imports React (`render.js` produces DOM only; browser APIs injected via `src/shell/platform.js`). Smokes first, watch red, implement fresh; `node --check` + green suite before every handover; smoke green + M's eyeball = done. Mock -> approve -> build for all UX/layout. Surgical edits only. M deploys manually (GitHub upload -> Netlify auto-builds); Claude never commits or pushes; outputs staged at bare repo paths; **built-app zips are never unzipped into the repo folder** (that overwrote root `index.html` with built output on 2026-07-16 — repaired same day; source `index.html` must reference `/src/main.jsx`). **Claude runs the suite against M's actual repo before every handover; M's part is the eyeball — the terminal is optional for M.** Spec ambiguity mid-build: stop, ask M, amend the spec — never improvise the tradition.

## Repo map

`src/engine/`: `model.js` fractions/shapes (+`frontmatter`) · `tala.js` · `parse.js` (frontmatter-aware) · `serialize.js` (form-preserving) · `render.js` (landing report at ~line 162) · `files.js`. `src/shell/`: `App.jsx` · `Toolbar.jsx` · `platform.js` · `EditorPane.jsx` · `PreviewPane.jsx` · `sargam.css`. `smokes/`: `run.js` + four suites. `docs/`: spec, plan. Root: `index.html` (Vite source), `CONTEXT.md`. M's copy: `/Users/khansolo/Sargam`. Live: sargam-notation.netlify.app.
