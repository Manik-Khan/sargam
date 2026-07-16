# Sargam — Session Context (updated 2026-07-16)

Read this with `docs/design-spec.md` and `docs/build-plan.md` at session start. The spec is the requirements authority; the plan pins code contracts; this file says where things stand.

## State: Milestone 1 COMPLETE (pending final eyeball items below)

All three waves built TDD (smokes first, watched red, implemented fresh), verified on M's machine and in sandbox. **Suite: 87 passed, 0 failed** (27 tala + 43 parse/serialize + 17 render). `npm run smoke` is the gate; `npm run dev` for live work; `npm run build` → `dist/` is the double-clickable/deployable artifact (`base: './'` set in `vite.config.js` on 2026-07-16 for M's static-site workflow).

- **Wave 1** — `model.js` (exact fractions), `tala.js` (5 tals, data-driven markers), Vite scaffold, smoke runner.
- **Wave 2** — `parse.js` (full §3 grammar, never throws, diagnostics with vibhag resync), `serialize.js` (canonical text, derived bars, round-trip stable). Appendix A parses with zero problems; canonical output byte-identical to source except `~PS…` → `P~S…` (same span, flagged to M, no objection).
- **Wave 3** — `render.js` (matra-cell CSS grid; derived markers/barlines; octave dots + register tints; SVG under-arcs/meend/krintan; landing reports; dim sustains; dimmed passthrough), shell wired (`App.jsx` → parse → `PreviewPane` ref mount, problems strip). M confirmed the corpus rendering by screenshot 2026-07-16.

## Decisions and amendments this session (2026-07-16)

1. **Tal checkpoint closed.** Five drafts accepted as shipped. Chachar = 14 matras `[3,4,3,4]` per M ("we call 14 beats chachar; some call it 16"), alias adachautal retained. Any future change is a data-only edit in `src/engine/tala.js`.
2. **Spec §3.8 amended (bols) — M's tradition correction.** Input is words, rendering is the handwriting's symbols: `da`→`|`, `ra`→`—`, `diri`→`^`, `chikari`→`v` (chikari added). `.` = explicit gap, mirroring lyric skips. Old `l`/`-`/`v` shorthand retired → diagnostic. Serialize emits words with `.` gaps. Build-plan contract line amended to match.
3. **Failures narrate — free sections.** `|` typed under `tal: free` now produces a problems-strip message explaining that the section is unmetered and how to meter it (this was the cause of M's "markers and bars not working": `tal: free` applies forward until re-declared).

## Open items for next session

- **M's eyeball verdicts (CSS-only fixes):** bol symbol size/weight (13px ink — do `^`/`v`/`—` read right against the handwriting?); `_` holds render as per-matra dim em-dashes, not one continuous line to the barline (refinement queued if it reads wrong); register tints are default blue `#2b5f8a` / red `#a8382e`.
- **Rendering ground truth:** the two notation scans (Kirwani khyal, 1979 Desh) were never uploaded this session — compare when M provides them.
- **Known v1 limits (flagged, accepted):** mid-doc non-tal directives collapse into the header on serialize (M3 concern); tildes inside bracket-form matras are dropped; a line with zero valid music tokens reads as a section label (silent); barless lines skip vibhag validation by design.
- **Next milestone: M2 — keep your music.** `files.js` (File System Access API + download fallback), autosave to localStorage, unsaved indicator, `id`/`created`/`modified` maintenance. Gets its own smokes-first pass.

## Working rules (unchanged, binding)

Engine is plain JS, never imports React (`render.js` produces DOM only). Smokes first, watch red, implement fresh; `node --check` + green suite before every handover; smoke green + M's eyeball = done. Surgical edits only. M deploys manually (GitHub upload; never commit `node_modules/` or `dist/`); Claude never commits or pushes; outputs staged at bare repo paths. Spec ambiguity mid-build: stop, ask M, amend the spec — never improvise the tradition. Terminal instructions: one command per numbered block with expected output; after replacing the folder from a zip, `npm install` is always required (the zip excludes `node_modules`).

## Repo map (quick orientation)

`src/engine/`: `model.js` fractions/shapes · `tala.js` tal data+arithmetic · `parse.js` text→model · `serialize.js` model→canonical text · `render.js` model→DOM. `src/shell/`: `App.jsx` pipeline+strip · `EditorPane.jsx` textarea · `PreviewPane.jsx` ref mount · `sargam.css` theme (CSS vars in `:root`). `smokes/`: `run.js` + three suites. `docs/`: spec, plan, this file. M's copy: `/Users/khansolo/Sargam`.
