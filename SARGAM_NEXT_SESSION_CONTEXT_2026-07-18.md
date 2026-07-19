# Sargam — Next Session Context & Handoff

**Updated:** 2026-07-18  
**Project:** Sargam notation editor/player + Vilambit practice player  
**Owner and musical authority:** Manik Khan  
**Assistant name:** Quill / Q

## 1. Purpose of this document

This is the authoritative handoff for the next work session. It summarizes the decisions, implementation state, syntax, test checkpoint, deployment workflow, and open work from the long 2026-07-18 build session.

Read this first, then consult:

- `CONTEXT.md` for the broader project history and architecture
- `docs/design-spec.md` for requirements and musical rulings
- `docs/build-plan.md` for code contracts
- `docs/notation-structure.md` for the new notation features
- `docs/vilambit-integration.md` for the Vilambit phase plan

When this handoff conflicts with an older test-count or recent-state statement in `CONTEXT.md`, this handoff is newer.

---

## 2. Current source of truth

The authoritative working copy should be the **GitHub Desktop clone** of:

```text
Manik-Khan/sargam
```

Recommended local path:

```text
~/Documents/GitHub/sargam
```

The latest assistant-prepared checkpoint is:

```text
sargam-aligned-folded-systems.zip
```

The latest small update is:

```text
sargam-aligned-folded-systems-changed-files.zip
```

The latest prepared code passed:

```text
336 passed, 0 failed
npm run build succeeded
```

**Important:** the folded-system alignment fix was prepared and tested, but at the moment this context was written it had not yet been visually confirmed by Manik in a new export. Confirm whether it was copied, tested, committed, and pushed before beginning new work.

For a new session, prefer a fresh ZIP of Manik's actual GitHub Desktop clone after the latest push. Exclude:

```text
node_modules/
dist/
.git/
.DS_Store
```

---

## 3. What was built in this session

### A. Multi-beat ranged slides

New syntax:

```text
~(.D.n.D S.n.D .n)
```

Meaning:

- Keep the spaces and beat structure exactly as written.
- Draw one meend/slide arc from the first note in the range to the last.
- Do not compress the notes into one beat.

The Slide toolbar command wraps a multi-beat selection with `~(...)`. Compact one-cluster slides still use forms such as `~mg`.

### B. First-ending playback without printed volta notation

New structural marker:

```text
|1
```

Example:

```text
@4 ||: S .n .D .n | S - - | m - | g - | g - m | D - | - - |1 m g R :||
```

Playback:

1. First pass includes `m g R`.
2. Second pass repeats only the material before `|1`.
3. Playback then continues into the next written line.

Ruling:

- `|1` is playback structure.
- It is intentionally hidden from normal notation and print.
- A later visual annotation layer will display printable notes such as `→ Start Line 1.a` without placing them inside the music syntax.

### C. Ordinary bars are soft phrase dividers

A typed ordinary bar:

```text
|
```

is **not** a required tala-vibhag boundary.

It is an author-facing phrase/layout divider. Tala divisions remain automatically derived from:

- the active tala,
- the line's `@N` start,
- and elapsed matras.

This removed false diagnostics such as “Division 2 has 4 beats; this tal expects 2” when Manik was using bars for phrase grouping.

### D. Compact, navigable diagnostics

The diagnostics area is now collapsed/toggleable instead of permanently consuming the lower portion of the page.

It now:

- groups repeated messages,
- uses clearer language,
- has a limited-height scrolling panel,
- disappears when there are no issues,
- lets the user click a diagnostic to focus the editor and select the reported token or source line.

### E. Explicit microbeat hold slots remain visible

Internal dashes are not merely playback duration; they are printed rhythmic information.

Examples:

```text
DnS-    → D n S –
g---    → g – – –
-.nS    → – .n S
g-S     → g – S
gm-     → g m –
```

Implementation ruling:

- Every explicitly written internal dash is preserved as a separate visual slot.
- The under-arc spans the complete written subdivision.
- Hold slots do not create extra MIDI attacks.
- `event.writtenSlots` records explicit written holds.
- Bracket hierarchy remains separate: `[SR g]` may give `g` half a beat, but must not invent a dash that the user did not write.

Adjacent full-beat dashes are also rendered as separate centered marks rather than one fused em dash.

### F. Gat return cues

Terminal return cues are zero-time playback structure.

#### Automatic tala-aligned return

```text
gat
```

Return to the nearest preceding section labelled `Gat` at the tala position where the current line lands.

This solves the case where a taan already includes the Gat's pickup/mukhra and lands on sam; playback should not repeat the pickup.

#### Explicit target matra

```text
gat@1
gat@4
```

Enter the preceding Gat at that cycle matra.

#### Full written Gat

```text
gat!
```

Replay the Gat from its written beginning, including its pickup.

All forms:

- are valid only at the end of a musical line,
- consume no beat,
- print as a compact cue,
- replay the Gat once,
- resume at the following written line,
- suppress nested return cues during the inserted replay to prevent recursion.

### G. Responsive musical systems

A single source line remains one semantic line for:

- editing,
- playback,
- looping,
- return cues,
- serialization.

But it may fold into several visual systems in preview and export.

Breaks happen only between whole matras. Preferred breakpoints are:

1. a written soft `|`,
2. an automatically calculated sam or khali,
3. another automatically calculated vibhag boundary,
4. the latest safe whole-beat edge that fits.

The layout must never break through:

- a beat/microbeat cluster,
- `~(...)`,
- `[[...]]`,
- `( )xN`,
- a note and its explicit hold slots,
- another load-bearing ornament or repeat span.

Preview and export use the same system planner. Whole source lines are no longer globally shrunk with CSS `zoom`.

### H. Export and folded-row alignment

The first responsive-system version introduced a continuation indent. In the supplied PDF, folded continuation rows on page 2 were visibly shifted right compared with surrounding systems.

The latest alignment fix removes that hanging indent. Every folded system should now begin at the same left notation origin as:

- its first system,
- neighboring notation lines,
- and the page's established notation grid.

This latest visual result still needs Manik's browser/PDF confirmation.

### I. Bageshri is now the starter composition

The default Kirwani example was replaced with Manik's complete Raga Bageshri composition.

It demonstrates:

- Rupak,
- `@4` pickup placement,
- repeated Gat structure,
- `|1`,
- ranged slides,
- explicit microbeat holds,
- long taans,
- responsive systems,
- `gat`, `gat@N`, and return alignment.

The example lives in:

```text
src/examples/bageshri.js
```

Copied document identity fields were removed. New users must not inherit Manik's original:

```text
id
created
modified
```

Existing browser autosaves intentionally continue to restore before the starter example appears.

### J. Vilambit integration Phase 1

The original monolithic `public/vilambit.html` was split without changing the iframe-based behavior.

Current assets:

```text
public/vilambit.html
public/vilambit/vilambit.css
public/vilambit/vilambit-app.js
public/vilambit/vendor/signalsmith-stretch.js
public/vilambit/vendor/libflac.js
```

The Vilambit iframe remains:

- always mounted,
- full-size in the shared app stage,
- hidden with `visibility`, never `display:none`,
- granted `allow="autoplay"`.

This preserves waveform initialization and allows Vilambit playback/looping to continue while the user returns to Notation.

The seek-before-first-play fix remains essential:

- before engine selection, seeking writes both the media element position and paused buffer position;
- `pos()` trusts the paused position while the engine is `none`;
- first play reconciles the chosen engine with that stored position.

Do not replace only `public/vilambit.html` with a fresh monolithic Vilambit export; that would discard the split assets and can regress the seek fix.

---

## 4. Current notation syntax cheat sheet

```text
@4                     Start the line at tala matra 4
|                      Soft phrase/layout divider
||: ... :||            Repeat the written line
|1                     Start first-pass-only ending material
~mg                    Compact slide within one cluster
~(S R g m)             One slide spanning several written beats
[SR g]                  Hierarchical subdivision; no invented hold dash
DnS-                    Four written micro-slots: D n S hold
--                     Two separate full-beat holds
(S R g)x3               Phrase repeat
[[ ... ]]               Krintan grouping
' S / .S                Upper/lower octave conventions already supported
gat                     Tala-aligned return to preceding Gat
gat@1                   Return to preceding Gat at matra 1
gat!                    Replay preceding Gat from its written beginning
```

---

## 5. Important code map

### Pure engine — no React/browser APIs

```text
src/engine/model.js
src/engine/tala.js
src/engine/parse.js
src/engine/serialize.js
src/engine/render.js
src/engine/layout.js
src/engine/schedule.js
src/engine/files.js
```

Recent load-bearing areas:

- `parse.js` — `~(...)`, `|1`, soft bars, `writtenSlots`, `gat`/`gat@N`/`gat!`
- `serialize.js` — round-trip preservation of all new syntax
- `render.js` — discrete hold slots, return cues, folded visual systems
- `layout.js` — safe system-break planning and width estimation
- `schedule.js` — first endings and Gat replay/entry behavior

### React/browser shell

```text
src/shell/App.jsx
src/shell/ProblemsPanel.jsx
src/shell/problems.js
src/shell/sargam.css
src/shell/audio.js
src/shell/dsp.js
```

### Examples/static assets

```text
src/examples/bageshri.js
public/vilambit.html
public/vilambit/
```

### Tests

The runner automatically discovers:

```text
smokes/*.smoke.js
```

Recent suites include:

```text
smokes/notation-structure.smoke.js
smokes/problems-panel.smoke.js
smokes/rhythmic-fidelity.smoke.js
smokes/layout-systems.smoke.js
smokes/vilambit-assets.smoke.js
```

---

## 6. Binding musical/product rulings

1. Manik is the authority on the notation tradition. Never invent grammar or tala/raga behavior to make implementation easier.
2. Tala markers and divisions are derived automatically. Typed `|` is a soft phrase/layout hint.
3. Explicit dashes are ink and time. Preserve their exact count visually.
4. Playback duration alone is not enough to reconstruct written subdivision.
5. Do not print structural `|1` volta brackets in Manik's desired notation.
6. Visual annotations such as `→ Start Line 1.a` should not be inserted into a music syntax line.
7. Long lines may fold visually, but never mid-beat or through an ornament/span.
8. Preview and export should share one layout engine.
9. Gat return behavior must be based on tala position, not guessed from note names.
10. Smokes first, then implementation, then Manik's visual/ear verification.

---

## 7. GitHub Desktop and file-update workflow

### Normal workflow

```text
Fetch/Pull → create or select branch → apply files → review Changes → test → commit → push
```

Do not replace the cloned `sargam` folder itself; it contains the hidden `.git` connection.

### Warning about Finder

Dragging a **partial update folder** over an existing same-named folder and choosing **Replace** may delete destination files that are absent from the partial update.

Safe options:

1. Replace the changed files individually in matching folders, or
2. Use macOS `ditto` to merge the update tree without deleting unrelated files.

Example:

```bash
ditto ~/Downloads/UPDATE-FOLDER/ ~/Documents/GitHub/sargam/
```

### Generated/unwanted files

Do not commit:

```text
node_modules/
dist/
.DS_Store
assistant patcher scripts
ZIP archives
```

`.DS_Store` is Finder metadata and should be covered by `.gitignore`.

---

## 8. Standard verification commands

From the GitHub Desktop clone:

```bash
cd ~/Documents/GitHub/sargam
npm install        # needed for a fresh clone/checkpoint
npm run smoke
npm run build
npm run dev
```

Expected latest checkpoint:

```text
336 passed, 0 failed
```

Vite usually serves:

```text
http://localhost:5173/
```

Stop the dev server with:

```text
Control + C
```

---

## 9. Browser/ear regression checklist

Before calling the current wave complete, verify:

### Notation

- `~(.D.n.D S.n.D .n)` stays distributed across beats with one top arc.
- `|1` affects playback but does not print a numbered volta bracket.
- Ordinary `|` produces no false vibhag errors.
- Diagnostics collapse, group duplicates, and navigate to source.
- `DnS-`, `g---`, and `--` show countable separate hold slots.
- Long Lines 5, 5B, 6, and 6B fold without compressing ornaments.
- Folded continuation rows align to the same left origin in preview and PDF.

### Playback

- First ending: full pass, shortened second pass, then next line.
- `gat` enters the Gat at the landing tala position.
- `gat@1` enters on matra 1.
- `gat!` replays the complete written Gat.
- The inserted Gat replay resumes at the following line and does not recurse.

### Vilambit

- Load audio.
- Seek ahead before first play.
- Press Play and confirm it starts at the selected point.
- Set an A–B loop.
- Switch to Notation and confirm it continues.
- Switch back and confirm state is preserved.

---

## 10. Known state and next recommended work

### Immediate confirmation

1. Confirm the latest folded-system alignment fix in the browser.
2. Export Bageshri again and inspect page 2, especially 4A, 5B, 6, and 6B.
3. Confirm the latest update is committed and pushed.
4. Update the root `CONTEXT.md` test count and recent-state prose after Manik approves the visual result.

### Recommended next product phase: positioned page annotations

Manik wants printable notes such as:

```text
→ Start Line 1.a
Gat
```

These should be visually positioned near a beat/boundary or after a line, but **not embedded inside the music syntax line**.

Recommended model:

- annotation text object,
- musical anchor (section/line/matra/boundary),
- placement above/below/before/after,
- small x/y offset,
- printable flag,
- stored in hidden layout metadata in the same `.md` document,
- edited through a future Layout/Grid mode.

Avoid absolute page-pixel coordinates with no musical anchor; they will drift when lines reflow or paper size changes.

### Other future work

- Further export polish: system justification/equal spacing and page-density controls if Manik wants more uniform use of the page.
- Grid/page-layout editor.
- Vilambit Phase 2: extract a directly testable player core.
- Vilambit Phase 3: `postMessage` bridge for position, loops, markers, and notation annotations.
- Vilambit Phase 4: native React view while keeping the imperative audio controller mounted.

---

## 11. Session-start instructions for the next assistant

1. Ask whether the aligned folded-system fix was visually approved and pushed.
2. Inspect the actual current repo before editing; do not rely only on this prose.
3. Run `npm run smoke` and `npm run build` before making changes.
4. Preserve all notation rulings in Section 6.
5. For layout work, use Bageshri as the primary stress-test corpus.
6. Do not commit or push on Manik's behalf; return tested files/checkpoints for his review.
7. Narrate failures plainly. A plausible hypothesis is not a diagnosis.

---

## 12. Short session summary

The project moved from a working single-line notation renderer into a more musically faithful composition system:

- multi-beat slides,
- nonprinting first endings,
- soft phrase bars,
- usable diagnostics,
- exact printed microbeat holds,
- tala-aware Gat returns,
- responsive notation systems,
- shared preview/export layout,
- Bageshri as the default complete example,
- and a maintainable first-stage Vilambit integration.

The next session should begin by confirming the latest export alignment, then move into anchored printable annotations and page-layout editing.
