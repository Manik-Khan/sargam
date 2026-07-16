# Sargam — Session Context (updated 2026-07-16, evening)

Read this with `docs/design-spec.md` and `docs/build-plan.md` at session start. The spec is the requirements authority; the plan pins code contracts; this file says where things stand.

## State: Milestone 1 COMPLETE · Milestone 2 BUILT (pending M's eyeball on the live site)

**Suite: 121 passed, 0 failed** (27 tala + 50 parse/serialize + 17 render + 27 files). `npm run smoke` is the gate. Shell verified by Vite build + a jsdom mount check (boot, dirty dot, autosave slot, restore-on-reload) + M's eyeball.

**Deployment (settled 2026-07-16):** live at **https://sargam-notation.netlify.app** — Netlify builds from `Manik-Khan/sargam` main (`npm run build` → `dist`), auto-deploys on every GitHub upload, same rhythm as ToK. `sargam.manikkhan.com` is the eventual custom-domain move. Source drops go to GitHub; built-app zips are only for double-click local use and must NEVER be unzipped into the repo folder (that overwrote root `index.html` with the built one on 2026-07-16 — repaired same day; the correct source `index.html` points at `/src/main.jsx`).

- **M1 (Waves 1–3)** — engine (`model`/`tala`/`parse`/`serialize`/`render`), live editor+preview, problems strip. Corpus confirmed by screenshot.
- **M2 "keep your music"** — `src/engine/files.js` (3 seams: `ensureIdentity` pure text transform; `createStore(storage, clock)` autosave slot + recents + per-id snapshots; `createFileIO(env)` FSA/download). Shell: `Toolbar.jsx` (New/Open/Save/Recent▾, filename, dot: filled=unsaved hollow=saved), `platform.js` (the ONLY place browser APIs are real — pickers, download shim, `openViaInput` fallback), `App.jsx` wiring (Cmd+S, 500ms-debounced autosave of raw text, restore-on-load, dismissible notice strip, New/Open confirm on unsaved).

## Decisions this session (2026-07-16, all M-approved)

1. **`.md` is the default extension**; `.txt` still accepted. Spec §3 amended.
2. **Frontmatter form** (spec §3.1 amended): header may be `---`-fenced — makes files first-class Obsidian/Codex citizens. Only a `---` on line 1 opens a fence; body `---` still parses as sustains (pre-amendment, a `---` line parsed as three sustains — fences typed into the old app would have rendered as music). `doc.frontmatter: bool` added to the model (additive); serialize preserves the form.
3. **Identity:** `id:` = `crypto.randomUUID()`, timestamps ISO 8601 UTC. `modified:` bumps on explicit save only. **Save writes editor text verbatim + surgical identity edit — never `serialize(parse(text))`.** Autosave (slot `sargam.current`) never mutates text.
4. **Safari/download fallback is first-class** (mobile path); UI narrates it. Chrome saves in place via FSA. Recents restore from the autosaved snapshot in v1 (FSA handle persistence = IndexedDB, deferred); narrated as such.
5. **Testing burden moved to Claude's sandbox**: Claude runs the suite against M's actual repo (zip or GitHub) before every handover; M's part is the eyeball. Terminal optional for M.

## Open items for next session

- **M's eyeball on M2 (live site after the drop deploys):** toolbar layout/sizing, dot vs. glyph, Recent menu feel, notice strip tone, Cmd+S, the unsaved-confirm flow. All CSS/copy tweaks.
- **FSA from `file://`** never verified (moot if Netlify is the only play surface).
- **Deploy verification marker:** post-deploy asset hash must differ from `index-BmDWLZvZ.js` (the frozen-bundle incident). This drop's local build produced `index-CRIgjmhB.js` — Netlify's should match or be newer.
- **Rendering ground truth:** the two notation scans (Kirwani khyal, 1979 Desh) still not uploaded — compare when M provides.
- **Known v1 limits (accepted):** mid-doc non-tal directives collapse into the header on serialize; tildes inside bracket-form matras dropped; zero-music-token line reads as section label; barless lines skip vibhag validation; recents don't reopen from disk.
- **Next milestone: M3 — hear your music.** `schedule.js`, melody + tick + cursor tracks, transport, loop, play-from-cursor. Bardic lessons: AudioContext clock, lookahead scheduler, synchronous start on play gesture. Performance corollary governs sound. Gets its own planning pass + smokes-first.

## Working rules (unchanged, binding)

Engine is plain JS, never imports React (`render.js` produces DOM only; browser APIs injected via `src/shell/platform.js`). Smokes first, watch red, implement fresh; `node --check` + green suite before every handover; smoke green + M's eyeball = done. Surgical edits only. M deploys manually (GitHub upload → Netlify auto-builds); Claude never commits or pushes; outputs staged at bare repo paths; app zips never unzipped into the repo. Spec ambiguity mid-build: stop, ask M, amend the spec — never improvise the tradition. Terminal instructions (when needed): one command per numbered block with expected output.

## Repo map

`src/engine/`: `model.js` fractions/shapes (+`frontmatter` field) · `tala.js` · `parse.js` (frontmatter-aware) · `serialize.js` (form-preserving) · `render.js` · `files.js` (identity/store/fileIO). `src/shell/`: `App.jsx` pipeline+files wiring · `Toolbar.jsx` · `platform.js` · `EditorPane.jsx` · `PreviewPane.jsx` · `sargam.css`. `smokes/`: `run.js` + four suites. `docs/`: spec, plan. Root: `index.html` (Vite source — must reference `/src/main.jsx`), `CONTEXT.md`. M's copy: `/Users/khansolo/Sargam`. Live: sargam-notation.netlify.app.
