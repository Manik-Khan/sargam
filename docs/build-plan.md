# Sargam — Milestone 1 Build Plan

**Goal:** Build M1 ("see your music") of the Sargam notation app: a Vite + React app where typed sargam text renders as live AACM-convention notation with derived tal markers, backed by a smoke-tested framework-agnostic engine.

**Architecture:** Text is the single source of truth. Engine modules (`src/engine/`) are plain JS with no React imports — parse, tal arithmetic, model, serialize, render. React (`src/shell/`) is a thin shell around them. One-directional flow per keystroke: text → parse → model → render.

**Tech stack:** Vite 5, React 18, plain JS (no TS), node smoke runner (no test framework), jsdom for render smokes only.

**Authority documents:** `docs/design-spec.md` (approved by M, 2026-07-15) is the requirements source. This plan pins the *code contracts* the spec leaves to implementation. Where they disagree, the spec wins; flag the disagreement to M.

---

## Global constraints (apply to every task)

- Engine files never import React or touch the DOM — except `render.js`, which produces DOM but never imports React.
- M deploys manually (GitHub upload → local). Claude never commits or pushes. Stage all outputs with exact repo paths under a `Sargam/` folder.
- `node --check` on every JS file + green smokes before every handover. Smoke green + M's eyeball = done.
- Surgical edits only in later waves; never touch unrelated code.
- Failures narrate; disabled controls state why.
- Terminal instructions to M: one command per numbered code block, stating what it does and the expected output.
- M is the authority on the tradition: tal definitions ship as drafts until M verifies them (Wave 1 includes this checkpoint).
- Durations are exact fractions (`{num, den}` ints), never floats.
- `node_modules` is never staged; `.gitignore` covers it.

## Repo structure (locked)

```
Sargam/
  package.json
  vite.config.js
  index.html
  .gitignore
  docs/
    design-spec.md
    build-plan.md          ← this file
  src/
    main.jsx
    shell/
      App.jsx
      EditorPane.jsx
      PreviewPane.jsx
    engine/
      model.js
      tala.js
      parse.js
      serialize.js
      render.js
  smokes/
    run.js
    tala.smoke.js
    parse.smoke.js
    render.smoke.js        ← Wave 3
```

`package.json` essentials: `"type": "module"`; scripts `dev`/`build`/`preview` (vite) and `"smoke": "node smokes/run.js"`; deps `react`, `react-dom`; devDeps `vite`, `@vitejs/plugin-react`, `jsdom`.

---

## Code contracts

### Fractions (in `model.js`)

```js
export const frac = (num, den = 1) => ({ num, den });   // always ints
export function fracAdd(a, b)   // reduced result
export function fracEq(a, b)
export function fracCmp(a, b)   // -1 | 0 | 1
export function fracToNumber(a) // ONLY for final render/schedule output
```

### Model shapes (plain JSON-able objects)

```js
Document   { directives: {tal, title, raga, sa, tempo, id, created, modified},
             sections: [Section] }
Section    { label: string|null, tal: string,          // tal name or 'free'
             lines: [Line] }
Line       { kind: 'music',
             startMatra: int,                          // 1-based; default 1
             lineRepeat: bool,                         // ||: :||
             matras: [Matra],
             spans: [Span],                            // meend, krintan
             phraseRepeats: [PhraseRepeat],
             lyrics: [{matraIndex, text}],             // resolved per spec §3.7
             bols:   [{ref: EventRef, mark: 'da'|'ra'|'diri'}],  // spec §3.8
             passthrough: [{col, text}],               // unparsed fragments, rendered dim
             sourceLine: int }
Matra      { events: [Event] }                          // event durs sum to exactly 1
Event      { type: 'note',    dur: Frac, ch: string, octave: int }   // ch keeps case: 'S','r','M'…; octave -2..2
           { type: 'rest',    dur: Frac }
           { type: 'sustain', dur: Frac }               // continuation of previous note
EventRef   { matraIndex: int, eventIndex: int }          // both 0-based within the line
Span       { type: 'meend'|'krintan', from: EventRef, to: EventRef }
PhraseRepeat { times: int, fromMatra: int, toMatra: int }   // 0-based, inclusive, within the line
Problem    { line: int, col: int|null, msg: string }
```

Notes: `_` (hold to vibhag end) parses into the right number of whole-matra sustains using the current tal — it does not survive as its own event type, but `serialize.js` must re-emit it (store `holdToVibhag: true` on the first generated sustain event to round-trip). Lyric/bol attachment is resolved in `parse.js` per spec rules so `render.js` stays dumb.

### tala.js

```js
export const TALS   // keyed by name, aliases included
// Tal { name, matras, vibhags: [ints], markers: [strings], samVibhag: int, khaliVibhags: [ints] }
export function getTal(name)                 // null if unknown
export function wrapMatra(tal, n)            // any int → 1..matras
export function vibhagOfMatra(tal, m)        // 0-based vibhag index
export function markerAtMatra(tal, m)        // marker string if m starts a vibhag, else null
export function landing(tal, startMatra, phraseMatras, times)
       // → { matra, marker|null, isSam, isKhali }  — the matra the FINAL repetition's last matra occupies
export function validateSpans(tal, startMatra, barSegmentLengths)
       // → [Problem-like {segmentIndex, expected, got}]
```

**Draft tal data (M VERIFIES in Wave 1 — clap patterns and marker conventions; do not call correct until he signs off):**

```js
tintal:   { matras: 16, vibhags: [4,4,4,4],       markers: ['+','2','0','3'] }
jhaptal:  { matras: 10, vibhags: [2,3,2,3],       markers: ['+','2','0','3'] }
rupak:    { matras: 7,  vibhags: [3,2,2],         markers: ['0','1','2'] }    // khali-marked sam — the reason markers are data
ektal:    { matras: 12, vibhags: [2,2,2,2,2,2],   markers: ['+','0','2','0','3','4'] }
chachar:  { matras: 14, vibhags: [3,4,3,4],       markers: ['+','2','0','3'], aliases: ['adachautal'] }
```

The chachar/ada chautal entry is the least certain (M noted the names are used interchangeably; the structures may actually differ) — ask M explicitly.

### parse.js / serialize.js

```js
export function parseDocument(text)   // → { doc: Document, problems: [Problem] } — NEVER throws
export function serializeDocument(doc)  // → string (canonical text)
```

Round-trip requirement (spec §2): `parseDocument(serializeDocument(parseDocument(t).doc))` is deep-equal stable; for well-formed input, meaning is preserved exactly (whitespace may normalize).

Full grammar: spec §3. The rules most likely to be fumbled — read them twice:
- `~` and `[[ ]]` NEVER affect rhythm; only spaces, `/`, brackets, and dashes do (spec principle 4).
- `.` attached before a letter = mandra prefix; standalone = rest; rest inside a beat needs `[ ]` (spec §3.4–3.5).
- Unspaced run = one-matra cluster, evenly divided; `-` inside a cluster = one slot; `SRgmP D` vs `SRgmP- D` both put D on beat 2.
- `N~ 'S` = meend across two matras; `N~'S` unspaced = a two-note one-matra cluster with a slide. Space decides rhythm; `~` only draws the arc.
- Directives are legal mid-document and apply forward; `tal: free` = unmetered section (no validation, no markers).

### render.js

```js
export function renderDocument(doc, opts)  // → HTMLElement (detached; caller mounts it)
// opts: { activeCursor?: {sectionIndex, lineIndex, matraIndex} }   // playback highlight, M3
```

Requirements per spec §4 + the approved mock (2026-07-15 conversation): matra-cell grid per line, barlines at vibhag boundaries, derived markers above vibhag-start cells, octave dots above/below letters, register tint (mandra cool / taar warm, dots load-bearing), automatic under-arc on subdivided matras, SVG over-arcs for meend spans (into the destination note), square over-bracket for krintan (may cross barlines), sustains dimmer than notes, `_` as a line to the barline, lyric row (blank through carried syllables), bol ticks, `||: :||` and `( )xN` glyphs, landing report line for phrase repeats, dimmed passthrough for unparsed fragments. React's `PreviewPane` mounts the returned element in a ref and swaps it per parse.

### Smoke harness (`smokes/run.js`)

Each `*.smoke.js` exports `export const smokes = [{ name, fn }]`; `fn` throws on failure (use `node:assert/strict`). Runner imports every `smokes/*.smoke.js`, runs sequentially, prints `PASS/FAIL name`, summary line `N passed, M failed`, exits 1 on any failure. `render.smoke.js` constructs a jsdom `window` and passes `window.document` availability via `globalThis` before importing `render.js`.

---

## Wave 1 — skeleton and arithmetic

**Files:** `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `src/main.jsx`, `src/shell/App.jsx` (placeholder two-pane layout, textarea wired to state, preview pane showing "engine pending"), `src/engine/model.js`, `src/engine/tala.js`, `smokes/run.js`, `smokes/tala.smoke.js`, `docs/design-spec.md`, `docs/build-plan.md`.

- [ ] Write `tala.smoke.js` first (failing), including at minimum:

```js
// markers derive from start offset — the Kirwani facts
const t = getTal('tintal');
assert.equal(markerAtMatra(t, 1), '+');
assert.equal(markerAtMatra(t, 9), '0');
assert.equal(markerAtMatra(t, 14), null);
// vistar @7: matra of 3rd cell (line position 3) = wrapMatra(t, 7+2) = 9 → khali
assert.equal(markerAtMatra(t, wrapMatra(t, 9)), '0');
// sthayi @7, 16 matras: line position 11 → matra 1 → sam
assert.equal(wrapMatra(t, 7 + 10), 1);
// tihai: (SR gm P)x3 from sam → last matra 9, khali
const l = landing(t, 1, 3, 3);
assert.equal(l.matra, 9); assert.equal(l.isKhali, true); assert.equal(l.isSam, false);
// rupak's khali-marked sam
assert.equal(markerAtMatra(getTal('rupak'), 1), '0');
// every tal: vibhags sum to matras
for (const tal of Object.values(TALS)) assert.equal(tal.vibhags.reduce((a,b)=>a+b,0), tal.matras);
// fractions
assert.deepEqual(fracAdd(frac(1,5), frac(4,5)), frac(1,1));
```

- [ ] Implement `model.js` (fractions + shape docs as JSDoc), `tala.js`; run smokes to green.
- [ ] Scaffold Vite app; `npm run dev` shows the two-pane placeholder.
- [ ] Stage all files; hand over with M's terminal steps: (1) `npm install` — expect dependency tree, no errors; (2) `npm run smoke` — expect `N passed, 0 failed`; (3) `npm run dev` — expect local URL, two-pane placeholder.
- [ ] **M checkpoint: verify the five tal drafts** (clap patterns, markers, the chachar/ada chautal question). Corrections are data edits only.

**Done when:** smokes green on M's machine, dev server renders, tal data signed off (or corrections queued for Wave 2 handover).

## Wave 2 — the parser

**Files:** `src/engine/parse.js`, `src/engine/serialize.js`, `smokes/parse.smoke.js`.

- [ ] Write `parse.smoke.js` first. Must cover, with exact expected values:
  - The full Appendix A corpus (spec): 5 sections; sthayi line `startMatra 7`, `lineRepeat true`, 16 matras; alap section `tal 'free'`, no problems.
  - Clusters: `'SRgmP'` → 5 note events, each `dur frac(1,5)`; `'SRgmP-'` → 6 slots, final P `dur frac(2,6)` reduced `frac(1,3)`; `'-P'` → sustain slot then P.
  - Octaves/rests: `'.d'` → note `ch 'd', octave -1`; standalone `'.'` → rest matra; `"'S.S"` → taar S then mandra S in one cluster; `'..d'` → octave -2.
  - Brackets: `'[. . S R]'` → 4 slots, two rests then two notes, each `frac(1,4)`; `'[SR g]'` → slot 1 subdivides (S,R at `frac(1,4)` each), g at `frac(1,2)`.
  - Sustains: `'S - -'` → note + two whole-matra sustains; `'S _ | _ |'` under tintal from sam → sustains filling to each vibhag end, `holdToVibhag` set.
  - Meend: `'N~ ' + "'S"` (across matras) → one meend span, `from` N's ref, `to` 'S's ref; `"N~'S"` unspaced → one matra, 2 events, meend span within it.
  - Krintan: `'[[dP/mg/RS]]'` → 3 matras, krintan span from first event to last, crossing matra bounds.
  - Repeats: `'(SR gm P)x3'` → `PhraseRepeat {times 3, fromMatra 0, toMatra 2}`.
  - Lyrics: the Appendix A sthayi lyric line resolves "hi" to the P matra of vibhag 3 and blanks after; "ma- ne" to `.d` and `P` (struck-note rule, per-vibhag).
  - Bols: `'> l - l v l -'` against a suitable line → marks `da,ra,da,diri,da,ra` attached per note event.
  - Diagnostics, never throws: a 5-matra vibhag → one Problem naming line + segment; nested `( )xN` → Problem; unknown token → passthrough + Problem; `parseDocument('')` → empty doc, no throw.
  - Round-trip: for every well-formed corpus input, serialize→reparse deep-equal.
- [ ] Implement `parse.js` then `serialize.js`; green; `node --check` all files; stage and hand over.

**Done when:** all parse smokes green including round-trips; Appendix A parses with zero problems.

## Wave 3 — see your music

**Files:** `src/engine/render.js`, `smokes/render.smoke.js`, `src/shell/EditorPane.jsx`, `src/shell/PreviewPane.jsx`, modify `src/shell/App.jsx`.

- [ ] Write `render.smoke.js` first (jsdom): render Appendix A →
  - sthayi row has 16 matra cells + repeat glyph cells; marker `'0'` above cell index 2, `'3'` above 6, `'+'` above 10, `'2'` above 14 (0-based cells; the `@7` arithmetic made visible);
  - `.d` cell contains a below-dot node; `'S` cell an above-dot node; mandra cell carries the cool-register class, taar the warm;
  - `mg` cell contains an under-arc node; one meend over-arc SVG spanning the N→'S cells; krintan sample renders one over-bracket spanning 3 cells;
  - sustain cells carry the dim class; free-section (alap) rows render with no markers and no barlines;
  - the tihai line renders a landing-report node containing "matra 9";
  - a deliberately broken document renders its bad fragment as dimmed passthrough text and the problems data is exposed for the strip.
- [ ] Implement `render.js`; green.
- [ ] Wire the shell: textarea (EditorPane) → `parseDocument` on change → `renderDocument` mounted in PreviewPane ref; problems strip below the preview listing `line N: msg`; parse debounced only if typing feels laggy (measure first — likely unnecessary).
- [ ] Manual eyeball script for M: type the Kirwani sthayi from scratch and watch markers/arcs appear; introduce a 5-matra vibhag and watch the strip narrate it without the preview dying.

**Done when:** the approved mock is real — Appendix A typed into the pane matches the layout M signed off, smokes green, M's eyeball passes. **End of Milestone 1.**

---

## After M1 (pointers, not plans — each gets its own planning pass)

- **M2 — keep your music:** `files.js` (File System Access API with download fallback), autosave to localStorage, unsaved indicator, `id/created/modified` maintenance.
- **M3 — hear your music:** `schedule.js`, melody + tick + cursor tracks, transport, loop, play-from-cursor. Bardic lessons apply: `AudioContext` clock, lookahead scheduler, synchronous start on the play gesture. Performance corollary governs sound quality.
- **M4 — write comfortably:** selection commands (krintan `Cmd+K`, tihai wrap, slide, octave toggles, line repeat) + `/` menu, writing canonical text through the textarea's edit APIs so native undo survives.
- **M5 — harden:** free-section polish, verified tal breadth, smoke corpus expansion.
- **Phase 2 — grid editor:** separate mock → approve → build cycle; edits the model, `serialize.js` writes back.

## Session-start ritual (next session)

1. M uploads (or Claude retrieves) `docs/design-spec.md` and this file, plus the two notation scans (Kirwani khyal, 1979 Desh) — the rendering ground truth.
2. Claude reads both docs fully before writing anything; confirms the wave in progress; builds smokes-first; stages with exact `Sargam/` repo paths.
3. Any spec ambiguity discovered mid-build: stop, ask M, amend the spec — don't improvise the tradition.
