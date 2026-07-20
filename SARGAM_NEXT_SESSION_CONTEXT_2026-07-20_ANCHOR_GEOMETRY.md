# Sargam — Next Session Context & Handoff

**Updated:** 2026-07-20, after visual rejection of the Anchor/Notation Continuity wave  
**Project:** Sargam notation editor/player + Vilambit practice player  
**Owner and musical authority:** Manik Khan  
**Assistant name:** Quill / Q  
**Supersedes:** `SARGAM_NEXT_SESSION_CONTEXT_2026-07-20.md` and all older current-state paragraphs

## 1. Read this first

This is the authoritative handoff for the next session. The task is **not** to add another annotation feature. The task is to stabilize the geometry and musical model beneath the existing anchor work.

Read this document, then inspect the actual clone:

```text
~/Documents/GitHub/sargam
```

Do not reconstruct the source from package prose. Several guarded installers failed because they were tested against paraphrased fixtures. Read the real files before editing.

---

## 2. Current source of truth and session-start gate

The GitHub Desktop clone is authoritative. The working tree likely contains:

- Vilambit core + iframe bridge + practice bar;
- CodeMirror editor with Clean/Structure modes;
- generated anchor metadata in Markdown comments;
- point/span anchor tools;
- experimental notation-continuity code;
- a direct repair to `smokes/notation-continuity.smoke.js` so it exports `smokes`.

Start with:

```bash
cd ~/Documents/GitHub/sargam
npm install
npm run smoke
npm run build
```

Known prior result:

```text
vite build succeeded
91 modules transformed
```

The final smoke count after the direct `smokes` export repair was not explicitly confirmed. Record the actual number before changing code.

Also inspect Git status and recent changes. Do not assume every assistant package was committed or pushed.

---

## 3. What is accepted and working

### Vilambit practice bridge

The compact Notation-side practice bar is visible and working. It reports the loaded recording, position, duration, play state, loop, and opens the full Vilambit view. Vilambit remains the sole recording engine and stays mounted while switching tabs.

Preserve:

- iframe always mounted;
- inactive view hidden with `visibility`, never `display:none`;
- `allow="autoplay"`;
- seek-before-first-play reconciliation;
- versioned, narrow postMessage contract;
- source-window and origin validation.

### CodeMirror editor

CodeMirror replaced the plain textarea. Existing shell code still expects textarea-like behavior for selection, commands, dictation, editor navigation, and scroll positioning.

Clean/Structure modes are conceptually approved:

- **Clean:** generated anchor metadata is folded/hidden.
- **Structure:** the same underlying Markdown is fully visible and editable.
- Saving must preserve the exact source in either mode.

### Anchor persistence

Generated anchor records survived ordinary notation editing. Manik explicitly confirmed: **“The diri marks held.”** This means the persistence/reconciliation direction is valuable even though the rendering geometry is not accepted.

### Binding articulation rulings

```text
Da       |
Ra       —
Diri     V
Chikari  ^
```

Diri is a two-attack gesture: Da then Ra in succession. The V connects two consecutive attacks. For `gg`, both g notes are the Diri; it is not a symbol beneath only the second g.

---

## 4. Rejected visual wave — do not call these shipped

Manik reviewed Preview, Export, and Print screenshots and rejected the current geometry.

### A. Diri

Current failure:

- the V record persists;
- Preview placement is inconsistent;
- Export/Print includes the V, but it can drift vertically or center under the wrong region;
- marks look like floating overlays rather than notation attached to two attacks.

Required behavior:

- two arms align with the exact x-coordinates of the two consecutive attacks;
- the point of the V is centered between them;
- it lives in a dedicated articulation lane;
- Preview and Export/Print use identical geometry;
- folding and repeat gutters cannot alter its attachment.

Canonical regression source:

```text
.D--.n -S gm D - ~(D m) P-D- m-gg R-S- gat
```

Place one Diri across the two g attacks in `m-gg`.

### B. Meter spans

Current failure:

- selection authoring feels promising;
- the actual rendered arch does not align with the selected notes;
- the label may be centered under the wrong coordinates;
- vertical spacing is insufficient and collides conceptually with ordinary under-arcs.

Required behavior:

- use exact attack/boundary geometry, not textarea selection rectangles or post-render container guesses;
- use the same slot-edge logic as the ordinary one-beat under-arc;
- provide a distinct, lower meter lane with enough space;
- drag handles snap to valid musical anchors;
- Preview and Export/Print are identical;
- custom positive integer/ratio values remain accepted; suggestions are not an allowlist.

Canonical regression source:

```text
@8 ||: .D--.n -S gm D - ~(D m) [[g---RS R-]] S- :||
```

Canonical spans:

- `4/3` over the actual opening pickup range selected by Manik;
- `6` from the first attack of `g---RS` through the landing R on khali.

Do not make Manik hand-author raw offsets such as `@0..3/2`. Visual placement is the normal interface; generated metadata is implementation detail.

### C. Repeated local slides

Current failure:

```text
@8 {n~}D--{n~}D
```

The n grace can float above the slide and the construct is not represented as two independent ornamented destinations.

Binding musical behavior:

- metric rhythm must be exactly the rhythm of `D--D`;
- first D occupies the written `D--` duration;
- second D is the later attack;
- each D has its own untimed `n → D` approach;
- two local slides, not one combined grace run or one large meend;
- playback must strike/bend both destinations correctly;
- notation must show both approaches cleanly.

This needs a first-class parser/model/schedule/render representation. Do not patch it only with CSS or a post-render SVG.

### D. Repeat gutters

The intended ruling remains:

- `||:` and `:||` belong in equal outside gutters;
- they must not squeeze the matra grid or shift a repeated line relative to ordinary lines;
- all systems should share the same notation origin and column arrangement.

The continuity package attempted this, but Manik did not accept or explicitly verify it after the final package. Re-test against Preview and Print before declaring it done.

### E. Tala markers during playback

An attempted correction made `3`, `+`, `2`, `0`, etc. align to attacks/boundaries, but an earlier version re-applied geometry during every playback cursor update, causing visible sideways motion/zooming.

Binding behavior:

- marker geometry is computed only when notation/layout changes;
- playback highlighting must never re-run marker alignment or mutate layout;
- attack on boundary: marker aligns to that attack;
- boundary during sustain/slide: marker aligns to a small metric boundary tick, not a fake attack.

The latest attempted fix is unverified; test it explicitly.

### F. Bounded Gat return

Experimental syntax was added conceptually/code-wise:

```text
gat@8..@1
```

Intended meaning: enter the preceding Gat at matra 8, play the mukra through the end of matra 10, then resume the next written line on sam. It should display simply as `gat`.

This is musically useful, but it is **not yet accepted**. Verify parser, scheduling, repeats, line continuation, display, and ear behavior before treating it as a settled ruling.

---

## 5. Architectural diagnosis

The failed wave attempted to render Diri and meter as independent overlays after notation had already been laid out. That is the likely source of drift.

The next implementation should establish a single **notation geometry map** produced by the core render/layout pass.

At minimum, expose stable geometry for:

```text
line/system identity
matra identity and absolute tala position
timed attack identity
visual slot start/end
fractional boundary positions
ornament destination identity
repeat gutter bounds
lower-lane baselines
```

Consumers:

- note DOM;
- tala numerals and boundary ticks;
- ordinary under-arcs;
- Diri/Da/Ra/chikari;
- meter spans and handles;
- playback cursor/highlighting;
- Preview click targeting;
- Export/Print;
- future text annotations and audio timestamp ranges.

**Compute geometry once. Render every attachment from it.** Do not render notes and then guess attachment positions from broad bounding boxes.

---

## 6. Next phase: Anchor Geometry Stabilization Wave

### Step 1 — Freeze and inspect

- Run the current suite/build.
- Save screenshots of the three canonical failures.
- Inspect actual current `render.js`, layout planner, PreviewPane, ExportView, anchor overlay, anchors model, repeated-slide code, and schedule code.
- Identify which marks are rendered in core DOM versus post-render overlay.

### Step 2 — Build a pure geometry contract

Create a testable structure shared by Preview and Export. It should map exact musical identities to positions within each rendered system.

Tests must not depend on browser pixel values alone. Smoke semantic facts such as:

- Diri endpoints resolve to attack A and attack B;
- meter span begins/ends at the selected anchor identities;
- a repeated destination ornament produces two timed destination events and two approach ornaments;
- repeat gutters do not change the matra-grid width/origin;
- marker alignment is not invoked by cursor-only updates.

Use browser geometry tests only for final x/y alignment.

### Step 3 — Move attachments into the notation render pass

Prefer integrated render lanes over independent overlays:

```text
marker/ornament-above lane
note lane
articulation lane: | — V ^
ordinary subdivision-arc lane
short text annotation lane
meter-arch lane
meter-label lane
```

Reserve height only where needed, but keep lane baselines deterministic.

### Step 4 — Reimplement Diri

Render a V from two attack anchors. One model record, two endpoints, one glyph/path. Preview and Export use the same function.

### Step 5 — Reimplement meter spans

Use anchor start/end positions and the ordinary under-arc edge logic. Make handles an editing decoration over the same geometry, not the source of geometry.

### Step 6 — Implement repeated local slides correctly

Add a real model representation for an untimed approach attached to each timed destination inside one beat cluster. Update parse, schedule, render, serialize/round-trip behavior, and tests together.

### Step 7 — Verify the secondary continuity features

- repeat gutters;
- stable tala markers during playback;
- bounded Gat return by ear and browser behavior;
- export/print parity.

### Step 8 — Manik acceptance gate

A feature is done only when:

```text
smokes green
build green
Preview visually correct
Export/Print visually identical
playback correct by Manik's ear
```

---

## 7. Canonical regression corpus for the next session

### Diri

```text
.D--.n -S gm D - ~(D m) P-D- m-gg R-S- gat
```

### Meter and krintan

```text
@8 ||: .D--.n -S gm D - ~(D m) [[g---RS R-]] S- :||
```

### Repeated local approaches

```text
@8 {n~}D--{n~}D
```

### Mukra return use case

```text
1.
D-n- D-mP -D-m -gm- g-R- Sg-R -S-.n gat@8..@1

2.
D ...
```

### Repeat-grid alignment

Compare one repeated line and one otherwise identical nonrepeated line. Their first matra and every corresponding division must share the same x-coordinate.

---

## 8. Exact source contracts and known gotchas

### Symbols

```text
BOL_SYMBOL
Da       |
Ra       —
Diri     V
Chikari  ^
```

Diri is a two-attack span.

### Export

`src/shell/ExportView.jsx` uses a measured two-pass render: an initial render for measurement and a final render with calculated `maxSystemEm`. Any export decoration must be applied to the final render and must use the same geometry contract as Preview.

### Meter control

Stable ID:

```text
cmd-anchor-meter
```

Placeholder wording is not a contract.

### Smoke modules

Every file auto-discovered under:

```text
smokes/*.smoke.js
```

must export:

```js
export const smokes = [];
```

not `tests`.

### Installer reliability

Several packages failed safely because guards matched fixture-specific names. Future work should prefer one of these:

1. a patch generated against a fresh ZIP of the real clone;
2. direct changed files with an explicit manifest;
3. AST/semantic edits tested against verbatim current source.

Do not rely on:

- local variable names;
- exact whitespace;
- exact test titles;
- placeholder text;
- prose comments that are not explicitly the contract.

A guard failure must still leave all files untouched.

### CodeMirror compatibility

Existing app code expects textarea-like operations. Preserve:

- `selectionStart` / `selectionEnd` behavior;
- `setSelectionRange`;
- focus and scroll navigation;
- command-bar selection edits;
- dictation insertion;
- problem-panel navigation;
- exact text preservation.

---

## 9. Product rulings carried forward

- Text remains the source of truth.
- Generated anchor metadata may live in Markdown-safe HTML comments.
- Clean mode hides/folds generated records; Structure mode exposes them.
- Visual editing is the normal interface for anchors; manual metadata editing is advanced use.
- Anchor records must survive harmless edits, flag ambiguity, and never jump silently to unrelated notes.
- Preview and Export/Print must share layout and attachment geometry.
- Tala positions never change because of a local meter annotation.
- Meter marking initially declares/validates/visualizes rhythm; it must not silently retime notation.
- Manik decides notation and performance semantics.

---

## 10. Do not do next

- Do not add more annotation types before geometry is stable.
- Do not patch Diri or meter with arbitrary CSS offsets.
- Do not make CodeMirror decorations the sole persistent anchor model.
- Do not silently relocate ambiguous anchors.
- Do not declare bounded Gat return settled from node tests alone.
- Do not write another installer from reconstructed prose; inspect the clone.
- Do not commit or push on Manik's behalf.

---

## 11. Short handoff

Vilambit integration and CodeMirror/metadata direction are valuable and should remain. Anchor records persist. The current failure is visual and architectural: Diri, meter spans, and repeated local slides were built before a single shared notation-geometry contract existed. The next session must stabilize that contract, integrate attachment rendering into the notation layout pass, and verify Preview/Export/playback with Manik's real Jhaptal composition before extending the annotation system.
