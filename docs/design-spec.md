# 2026-07-15 — Sargam Notation App — Design Spec

Repo: **Sargam** (M's naming, settled 2026-07-15). App display name can differ; nothing below depends on it.

Status: **Approved by M — 2026-07-15.**

## 1. Purpose

A local-first web app for writing, rendering, and auditioning Hindustani classical notation in the AACM convention. You type sargam as plain text; the app renders it as clean typeset notation (arcs, octave dots, derived tal markers), plays it back over a tal reference so rhythm can be verified by ear and eye, and saves compositions as portable plain-text files.

Primary user: M, personally, from day one. The format and data model are designed so archive use, teaching/sharing, and Supabase sync can be added later without reshaping anything.

### Design principles

1. **Text is the single source of truth.** Everything else — rendering, playback, structured editing — derives from it or writes back to it.
2. **Derived, never typed.** Vibhag markers (`+ 2 0 3`), under-arcs on subdivided beats, sustain lines, and tihai landing reports are computed by the app. The user types music; the app does arithmetic.
3. **The snapshot principle — and the performance corollary.** The *notation* is a snapshot: it cannot capture everything, and the aural tradition carries the rest. Playback, however, should try its hardest to perform well: given the choice between sounding awesome-but-imperfect and sounding crappy-because-it-"shouldn't"-perform, awesome wins (M's explicit call). Rhythm is always rendered and played literally; ornament realization aims for musicality and is allowed to be an interpretation. Staging, not stance: rhythm-correct comes first, and the sound gets more musical with every pass.
4. **Rhythm comes only from separators.** Spaces, `/`, brackets, and dashes define time. `~` (slide) and `[[ ]]` (krintan) are annotations that never affect rhythm.
5. **M is the authority on the tradition.** Claude drafts tal definitions and notation conventions; M verifies them against how he learned them before they are considered correct. The tool encodes the tradition; it does not invent one.
6. **The engine never belongs to React.** All musical logic is plain framework-agnostic JS, testable in node/jsdom without mounting a component.

## 2. Architecture

One Vite + React app in its own new repo (M creates and names it; M deploys manually as always — Netlify later if/when sharing matters; fully offline until then).

```
src/
  engine/            plain JS modules — no React imports, ever
    model.js         composition data structures
    tala.js          tal definitions + all cycle arithmetic
    parse.js         text → model + diagnostics
    render.js        model → notation DOM/SVG
    schedule.js      model + tempo → timed Web Audio events
    serialize.js     model → canonical text
    files.js         open/save, autosave, recent files
  shell/             React — panes, transport, commands, menus
```

**Data flow (one-directional per keystroke):** text → `parse` → model → `render` + `schedule`. Nothing downstream mutates the model. The Phase 2 grid editor becomes a second *producer*: model edit → `serialize` → text, keeping both views in sync through one round-trip.

### model.js

- `Composition` → `Section[]` → `Line[]` → `Matra[]` → `Event[]`.
- Event types: **note** (degree, accidental class, octave offset), **rest**, **sustain**.
- Every event's duration is an **exact fraction of a matra** (rational, not float) — this is what keeps true cross-rhythm (3:4, 5:4 spans) possible later without a model change.
- Ornament spans (**meend**, **krintan**) reference a range of events and may cross matra and vibhag boundaries.
- Repeat blocks: line-level (`||: :||`) and phrase-level (`( )xN`), with computed landing positions.
- Per-line start offset (matra number in the cycle).
- Per-section meter flag: metered (a tal) or free.
- Lyric and bol attachments per line (see §3.7–3.8).

### tala.js

Tals are **data, not code**: `{ name, matras, vibhags: [lengths], markers: [symbols], sam: index, khali: [indices] }`. Ships with: **tintal** (proof target, fully exercised), **jhaptal, rupak, ektal, chachar/ada chautal** (definitions included in the same release; **M verifies clap patterns and marker conventions before they're called correct** — rupak's khali-marked sam is the reason markers are per-tal data).

Functions: marker placement for any start offset; cycle validation ("this line spans N matras"); landing-position arithmetic for repeats; vibhag boundary positions for rendering and for `_` (hold-to-end-of-vibhag).

### parse.js

Text → best-effort model + diagnostics list. **Never throws, never rejects a document.** Unparseable fragments become literal passthrough runs in the model (rendered dimmed) with a diagnostic (line, position, message). Mid-edit states are the normal state of a scratchpad.

### serialize.js

Model → canonical text. Requirement: `parse(serialize(parse(text)))` is stable, and for well-formed input, `serialize(parse(text))` preserves meaning exactly (whitespace may normalize). This round-trip is what makes selection commands and the future grid editor safe.

## 3. Notation format

A composition file is plain text: **directives**, **section labels**, **music lines**, **lyric lines**, **bol lines**, separated by structure described below. Default file extension: `.md` (`.txt` remains fully accepted — the format is identical; only the extension changed). *(Amended 2026-07-16, M's call: `.md` makes compositions first-class Obsidian/Codex citizens. Caveat accepted: markdown reading-view renderers will mangle music lines — `|` reads as tables, `_` as italics; source mode and plain editors are unaffected.)*

### 3.1 Directives

`key: value` lines. At the top of the file they form the header; mid-document they apply from that point forward (enabling tal changes and free passages).

- `tal:` — required before the first metered music line. Values: a tal name, or `free` (unmetered — vibhag validation and tick playback off for the following material).
- `title:`, `raga:` — optional metadata.
- `sa:` — playback pitch of Sa. Default `C#`. *(Amended 2026-07-16: accepts an optional octave — `C`, `C#`, `A3`, `Bb2`; a bare letter sits at octave 3, landing the anchors where the instruments live (M): sarod `C` → C3 ≈ 131 Hz, sitar `D` → D3, vocal classes `A` → A3 = 220 Hz — A3 chosen in M's classes to sit between male and female ranges. The default remains C# pending M's ruling on changing it.)*
- `tempo:` — bpm per matra. Default `60`. *(The app's only bpm value. The M2.5 new-document form labels its field "BPM" and writes this key — there is no separate `bpm:` directive.)*
- `laya:` — *(revised by M, 2026-07-16 evening)*. **The tradition's word for speed — the full spectrum, not a number.** Proposed ladder pending M's confirmation/edit: `ati vilambit` · `vilambit` · `madhya vilambit` · `madhya` · `madhya drut` · `drut` · `ati drut` — the middle rungs are Claude's inference from M's "includes medium fast, etc." and await M's exact wording. Free text is always legal. `laya:` and `tempo:` remain independent — no prefilling either way.
- *(Division of labor, M's ruling: `laya:` carries the tradition's speed word; `tempo:` carries the literal playback number. The transport's BPM field reads and WRITES `tempo:` — editing the knob edits the text, because text is the source of truth.)*
- `composition:` — *(settled 2026-07-16, M)*. Values: `vocal`, `instrumental`.
- `type:` — **reserved, not yet shipped** *(named 2026-07-16, M)*. A distinct axis from `composition:`: what the *document* is — a composition, an alap, a transcription. `composition:` says how it is played; `type:` says what it is. Values and form inclusion pending M.

All header metadata is **optional and selectable** *(M, 2026-07-16)* — a document carries the directives it needs and no more. (`tal:` retains its §3.1 status: required before the first *metered* music line; omitting it is legal and narrates one diagnostic, and `tal: free` is always available.)
- `id:`, `created:`, `modified:` — written and maintained automatically by the app on save (the Supabase-shaped identity). Hand-editing them is legal but never necessary. *(Pinned 2026-07-16: `id:` is `crypto.randomUUID()`; timestamps are ISO 8601 UTC. `modified:` bumps on explicit save only — autosave is crash protection and never mutates the text.)*

**New-document form** *(added 2026-07-16, M's design)*: New offers a short form — Raga · Tala · Composition (Vocal/Instrumental) · Laya (Vilambit/Madhya/Drut) · BPM — which writes correct frontmatter, so directive names never have to be memorized. This is §5's editing philosophy applied to the header: the machine maintains the syntax. **Every field is optional** — fill what applies, leave the rest; the form writes only what was filled. **The form is skippable entirely** — a blank-document option sits beside the create button, because the scratchpad is the daily case and a five-field gate is friction on it. Everything the form writes is ordinary text and stays hand-editable. *(Implementation note: `laya:` and `composition:` already parse and round-trip as ordinary directives — the only engine change the form needs is adding them to `serialize.js`'s `KNOWN_KEYS` so canonical order places them deliberately rather than trailing after `tempo:`.)*

**Frontmatter form** *(amended 2026-07-16)*: the header block may be wrapped in `---` fences (YAML-frontmatter style), making the file a first-class Obsidian note whose `title:`/`raga:`/`tal:`/`id:` are queryable by Dataview/Datacore. Only a `---` on **line 1** opens frontmatter; a `---` anywhere else is ordinary text. Inside the fences the directives are exactly the same `key: value` lines — no YAML features beyond that are parsed. The app inserts identity directives inside the fences when they exist, before the closing `---`. Fenced and unfenced headers are both canonical; serialize preserves whichever form the document uses.

### 3.2 Structure lines

- A **blank line** separates sections.
- A **bare text line** (`Sthayi`, `Boltans`, `Vistars`) is a section label.
- A line starting with `"` is a **lyric line** attaching to the music line above (§3.7).
- A line starting with `>` is a **bol line** attaching to the music line above (§3.8).
- Everything else is a **music line**.

### 3.3 Notes

- Chromatic set, exactly as M gave it: `S r R g G m M P d D n N` — capitals shuddha, lowercase komal, **capital `M` = tivra Ma**.
- Octave marks are **prefixes**: `.S` mandra, `'S` taar; doubled (`..S`, `''S`) for the octave beyond. Marks bind forward to the note that follows, so they compose inside clusters without ambiguity (`'S.S` = taar S then mandra S).
- Rendered output always draws proper dots below/above the letter; the typed prefix is input only.

### 3.4 Rhythm

- **Matra separators:** whitespace and `/` are equivalent. `SRg/mP` and `SRg mP` mean the same thing. Leading/trailing slashes are tolerated and meaningless.
- **One token = one matra.** An unspaced multi-note run (a **cluster**) is one matra divided evenly among its slots: `SRgmP` = five notes in one beat. The under-arc renders automatically on every subdivided matra — brackets are never needed for the arc.
- **`-` (dash):**
  - As a standalone token: sustain the previous note one full matra. `--` = two matras, counting by hyphen.
  - Inside a cluster: one subdivision slot of sustain. `P-` = P struck on the front half of the beat, held through the back half. So `SRgmP D` puts D on beat 2 after an even quintuplet; `SRgmP- D` also puts D on beat 2, but beat 1 divides in six with P leaning longer.
  - A cluster may *begin* with `-` (`-P` = previous note held through the first slot, then P).
- **`_` (underscore):** hold to the end of the current vibhag; renders as the long continuous line. Sam held to khali: `S _ | _ |` renders as `S—|—|`.
- **`.` (dot):**
  - As a standalone token: a one-matra rest.
  - Attached before a note letter: the mandra prefix (§3.3) — never a rest.
  - Rests *inside* a beat therefore require brackets (§3.5).
- **`|`:** vibhag boundary. Validated against the current tal and the line's start offset; markers are derived, never typed. Mismatches are diagnostics, not errors.
- **`@N`** at the start of a music line: this line begins on matra N of the cycle. Omitted = matra 1. Appears before `||:` when both are present.
- **Sustain line:** the renderer draws the continuous over-line on any note-plus-dashes run automatically. (If a musical case ever requires a held note *without* the line, an explicit marker will be added then — none is known now.)

### 3.5 Brackets — slotted beats

`[slot slot ...]` is one matra whose contents are **space-separated slots**, dividing the matra evenly by slot count. Exists for what clusters can't express:

- Rests inside a beat: `[. . S R]` — the off-beat entry; two silent quarters, then S–R.
- A slot may itself be a cluster: `[SR g]` divides the beat in half, with the first half subdivided again.

`[P -]` is equivalent to the cluster `P-`.

### 3.6 Ornaments and annotations (rhythm-transparent)

- **`~` — slide/meend.** Marks connection; never affects timing. **Prefixing** a cluster (`~SR`, `~mg`): the slide arc covers the (fully-timed, evenly-split) cluster — this is the canonical spelling of the within-matra meend. At a token edge with a space (`N~ 'S` or `N ~'S`): the arc spans across the matra boundary into the neighboring note, both notes fully timed. The distinction between "slide ends, next note freshly articulated" (`...D N`) and "slide lands the note" (`...D~ N`) is carried by one character.
- **`{ }` — kan/grace ornament** *(M's grammar, 2026-07-16 — promoted from the backlog)*. What's inside the braces is the grace run; the note (or cluster) immediately after the closing brace is the **destination and owns the beat**: `{'S}n` (one grace), `{dP}m` (double grace), `{P'SN'R'SN'S}N` (a long slid run into N). Graces render small and raised before the full-sized destination with the connecting curve, exactly as the handwriting has them; octave prefixes work inside the braces; spaces inside are allowed and ignored. Playback: the run is *slid*, not articulated — graces steal a small sliver off the destination's front (capped at half the beat), and the grid never moves. `{run}` with no destination narrates a problem. **Internal cluster tildes are shorthand for the same thing**: `'S~n` and `d~P~m` are kans — the note after the *last* internal tilde is the destination; everything before is grace. Shorthand parses in; braces serialize out (one canonical spelling). *Superseded meaning*: before this amendment an internal tilde meant a within-matra meend of fully-timed notes (`N~'S` = two half-notes); that meaning now belongs exclusively to the leading form (`~N'S`), and serialize emits the leading form for exactly this reason. Old files using internal tildes now read as kans — which is what M's own files meant by them.
- **`[[ ... ]]` — krintan.** A span annotation that may contain `/`, spaces, and `|` — krintans legally cross beats and barlines: `[[dP/mg/RS]]`. Renders as the square over-bracket across the full span.
- Neither is typically typed by hand — see §5 (selection commands) — but both are ordinary text and always hand-editable.

### 3.7 Lyric lines (`"`)

Tokens attach **left to right to matras that begin with a struck note**, skipping sustain and rest matras — per vibhag when the lyric line includes `|` dividers, otherwise across the whole line. Extra matras in a vibhag stay blank (the syllable carries, matching the pages — "hi" rides through the held notes without repeating). `.` in a lyric line is an explicit skip, for placing a syllable on a later note. A cluster is one matra and receives one syllable.

### 3.8 Bol lines (`>`)

Instrumental stroke marks: `l` = da (vertical tick under the note), `-` = ra (horizontal tick; safe collision — `-` only means ra on a `>` line), `v` = diri. Tokens attach **per note event** in order — including each note inside clusters — skipping sustains and rests. Da diri diri da: `> l v v l`.

### 3.9 Repeats

- `||: ... :||` wraps a whole line for repetition.
- `( ... )xN` wraps a phrase within a line — the tihai form: `(SR gm P)x3`. Not nested in v1 (nesting is a diagnostic).
- **Landing report:** for every phrase repeat, the app computes and displays where the final repetition ends — "3rd P lands on matra 9 (khali)". This is a headline feature, not decoration: it is how a tihai is checked before it's ever played.

### 3.10 Free (unmetered) sections

After `tal: free`: no vibhag validation, no derived markers, no tick track. Note spelling, clusters, slides, and krintans are written identically — a token is a pulse rather than a counted matra. Alap is the target case (the 1979 Desh page, top section).

## 4. Rendering — the live preview

Updates on every keystroke; never goes blank.

- **Layout unit: the matra cell.** Each line is a row of cells sized to the tal (free-flowing in unmetered sections), barlines at vibhag boundaries, derived markers above the first cell of each vibhag, computed from tal + start offset.
- **Arcs as SVG**, three distinct styles matching the handwriting: under-arc (automatic, subdivided matras), over-arc (`~` slides, extending into the destination when connected), square over-bracket (krintan, crossing barlines when it does). Arcs scale with their spans.
- **Octave dots** below/above each note. Register additionally **tints**: mandra cool (blue family), taar warm (red family) — defaults, adjustable later; dots remain load-bearing so print and colorblind reading never depend on color.
- **Sustains** render as the continuous line: within cells for counted dashes, stretching to the barline for `_`. Dashes render dimmer than notes so held time reads differently from struck time.
- **Lyrics** sit in a fixed row under their music line, blank through carried syllables. **Bols** render as the small ticks under their note events.
- **Repeats** render `||: :||` and `( )xN`; with the cursor inside a repeat, the landing report shows inline. *(2026-07-16 — the shipped `render.js` violates this on two counts, fixed in M2.5: it appends the report unconditionally rather than on cursor, and its wording (`x2 lands on matra 8`) names neither the landing note nor the cycle position. §3.9's form is authoritative: `3rd P lands on matra 9 (khali)`. Requires cursor plumbing: textarea `selectionStart` → source line → `renderDocument(doc, opts)`, reusing the `opts.activeCursor` seam.)*
- **Diagnostics:** unparseable fragments render as dimmed literal text in place; a problems strip below the preview lists issues with line/position ("line 4, vibhag 2 has 5 matras"). The strip is the single voice for all parse feedback.
- **Playback cursor:** highlights the sounding matra cell, auto-scrolls.
- **Not in v1:** pixel-faithful handwriting reproduction (this is a clean typeset rendering of the same conventions); print/PDF export (backlog; cheap once rendering is right).

### 4.1 Export view *(added 2026-07-16, M's call — promoted from backlog)*

The artifact you hand to someone, or keep. Export opens the notation **alone** — no toolbar, no editor, no problems strip, identity directives hidden — and invokes the browser print dialog: *Save as PDF* produces the file, a printer produces paper. Same engine output as the preview, so typography needs no second implementation; works offline; works in Safari; no dependencies.

**Header layout (M's design):** the **raga is the main title**. The remaining metadata (tal, composition type, laya, tempo, and the composition's `title:`) runs as a **list down the far right**. `title:` is not retired by this — raga is the organizing axis, `title:` is the piece's name and is what disambiguates the many compositions in one raga (the recent-files list and filenames depend on it).

Image export (PNG/SVG) is a later addition if wanted; print-to-PDF is v1.

### 4.2 Layout toggle *(added 2026-07-16, M's call)*

Two arrangements, switched from the toolbar and remembered across sessions: **side-by-side** (editor left, notation right — the shipped M1 layout) and **notation-on-top** (notation fills the page, editor becomes a strip along the bottom). M's preference is more room for the notation; the editor is consulted less than it is read from.

Approved mock (this conversation, 2026-07-15) is the layout reference: Kirwani sthayi line at `@7` with markers 0/3/+/2, tihai landing sample, cross-beat krintan sample, transport bar, problems strip.

## 5. Editing model

**Type plainly; select to structure; the machine maintains the syntax.**

- **Phase 1 editor:** a plain textarea (native undo preserved — commands write through standard editing APIs so Cmd+Z works).
- **Selection commands** (toolbar buttons + hotkeys + a `/`-triggered menu, all equivalent): operate on the current text selection and **write canonical text** — the user never types compound syntax by hand unless they want to. v1 set:
  - Krintan (`Cmd+K`): wraps selection in `[[ ]]`.
  - Tihai/repeat: wraps selection in `( )x3` (count editable).
  - Slide: applies `~` across the selection.
  - Mandra / taar: prefixes each selected note with `.` / `'` (and removes, when toggled off).
  - Line repeat: wraps the line in `||: :||`.
- Commands are core workflow, not conveniences: they are how dense structural passages (the krintan-tihai case) stay comfortable while text stays canonical. They are also the same selection-plus-command muscle the grid editor will reuse.
- **Phase 2 — grid editor:** a second view editing the model directly (cursor lives in the notation, keys insert notes, arrows walk matras), serializing back to text via `serialize.js`. **Gets its own mock → approve → build cycle before any code** — its design is *not* covered by this spec beyond the architectural guarantee that the model/serialize seam supports it.

## 6. Playback engine

One clock, many tracks. `schedule.js` flattens the model into a timed event list — onsets and durations as exact matra fractions, repeats unrolled, sustains merged into their notes — and plays it with the lookahead-scheduler pattern (~25ms timer scheduling ~100ms ahead against the AudioContext clock). Audio starts synchronously on the play gesture (the Bardic lesson).

Tracks, independently toggleable with per-track gain:

- **Melody** — synthesized tones that aim to be worth listening to: a plucked-style envelope with a timbre chosen by ear (M judges), not a raw test-tone oscillator. Pitch = sargam degree + octave offset + `sa:` setting; equal temperament in v1. The voice is expected to improve across passes; the track interface allows swapping synthesis without touching scheduling.
- **Tick** — accented sam, distinct (muted/hollow) khali, plain elsewhere; derived entirely from `tala.js`. Off in free sections.
- **Theka** — reserved slot: same track interface, plays one bol sample per matra when samples exist. **Absent in v1**; the interface exists so samples drop in without surgery. (Sample sourcing/hosting: later; Cloudinary is the known pattern.)
- **Cursor** — not audio; driven by the same event list so sound and highlight cannot drift.

Ornament playback per the performance corollary: meend = a genuine pitch glide shaped between the connected notes (frequency ramp with a curve, not a linear zip); krintan = its notes in rhythm in v1, with articulated realization (attack shaping) as an early follow-up — it should *sound like something*, even if the something is an interpretation. Free sections: melody only, nominal pace. Ornament sound quality is an evolving track of work, judged by M's ear, never by "good enough for verification."

Transport *(shipped 2026-07-16; mock approved with one redline)*: play/pause (Space)/stop; position/duration; **BPM field = the `tempo:` directive** (edits write the text surgically via `setDirective`; a doc with no `tempo:` gains one on first edit); loop off/line/section scoped to the text cursor's line; melody/tick mutes; live cursor highlight driven by the same event list as the sound. Free sections tick-silent.

## 7. Files, persistence, errors

- **Save/open `.md`** (and `.txt`) via the browser file picker. Continuous **autosave to browser storage** so a crash or accidental close loses nothing; explicit unsaved-changes indicator; recent-files list.
- **M2 decisions (settled 2026-07-16):** Save writes the editor text **verbatim** plus a surgical identity-directive edit — never `serialize(parse(text))`, which would reformat the user's layout. Autosave writes the raw text to a single current-document slot (debounced) and never mutates it. Chrome saves in place via the File System Access API; Safari uses the download fallback as a **first-class path** (each save downloads a copy; the UI says so plainly) — Safari matters because it is the eventual mobile path. Recents restore from the autosaved snapshot in v1, not the disk file (persisting FSA handles needs IndexedDB — deferred), and the UI narrates "restored from autosave". New/Open warn on unsaved changes. Fully offline: no network calls exist anywhere in v1.
- The app maintains `id:`, `created:`, `modified:` header directives automatically — the document identity that maps onto a Postgres row when Supabase sync arrives. **No auth, no network in v1.**
- **Failures narrate** (house rule): the problems strip speaks for the parser; playback refuses nothing — it plays what parsed and states what it skipped; any disabled control states why.

## 8. Testing and validation

Engine smokes run in node/jsdom with zero React:

- **Parser round-trips:** `parse → serialize → parse` stability across a corpus that includes the full Kirwani file (Appendix A) and constructed edge cases (off-beat entries, `_` holds, chained slides, cross-barline krintans, free sections, deliberately broken lines that must produce diagnostics, not throws).
- **Tala arithmetic against known answers:** the vistar's `g` on khali from `@7`; the sthayi's `.d` on sam from `@7`; `(SR gm P)x3` from sam landing on matra 9; rupak's marker layout; every shipped tal's marker positions for offsets 1..matras.
- **Schedule timing:** D's onset is the start of beat 2 in both `SRgmP D` and `SRgmP- D`; slot durations sum exactly to their matra; repeats unroll to the correct total span.
- `node --check` + green smokes before every handover; smoke green + M's eyeball = done. M deploys manually; Claude never commits or pushes.

## 9. Build order (Phase 1 milestones)

1. **M1 — see your music:** scaffold; `model` + `tala` + `parse` + `render`; text pane + live preview; diagnostics strip. (Kirwani file renders correctly.)
2. **M2 — keep your music:** `files.js` — open/save, autosave, recent, identity directives. *(Complete 2026-07-16.)*
2.5. **M2.5 — share your music** *(added 2026-07-16)*: export view (§4.1) + layout toggle (§4.2) + landing-report fix (§4) + new-document form (§3.1). The wave that makes Sargam a complete notation tool before sound arrives.
3. **M3 — hear your music:** `schedule.js` — melody + tick + cursor; transport; loop; landing reports live.
4. **M4 — write comfortably:** selection commands (krintan, tihai, slide, octave, repeats) + `/` menu.
5. **M5 — harden:** remaining tal definitions verified with M; free-section polish; smoke suite to full breadth.

Phase 2: grid editor (separate design cycle). 

## 10. Deferred / backlog (explicitly out of v1)

**Dictation / voice input (M's idea, 2026-07-16 — grammar SHIPPED as `src/engine/dictation.js`, front-ends open):** speak or type sargam syllables and have the tool write the notation. M's insight makes it tractable: **the raga declares the notes** — in Bhairavi "re" means komal re without saying so, because that is how the tradition already encodes it; you only name the accidental when you depart from the raga (`shuddh re`, `tivra ma`). Vocabulary is closed and tiny (7 syllables · 3 modifiers · octave words · bare notation letters, which M mixes in naturally). `RAGA_SCALES` is DATA like `tala.js` — adding a raga is a data edit, and Claude must never invent one. What remains open: (a) **input channel** — the Web Speech API is Chrome-only, English-trained (sargam syllables will mangle; the alias table is a speculative start) and, decisively, **sends audio to a server, which breaks this app's offline principle**; an on-device keyword-spotting model (TensorFlow.js) trained on M's own voice/students would be offline and far more accurate, but is a real ML project; the keyboard needs neither and works today. (b) **M's rulings**: default separator (spaced = one note per matra, useful for hand-editing; joined = one beat, which is how M wrote his examples); whether octave words should be sticky rather than one-shot; the spoken-command vocabulary ("slide in one beat" → ?). (c) Audio pitch-transcription: pitch detection is solved (`dominantPeriod` in dsp.smoke.js is already one) and Sargam is uniquely placed for it since the user declares Sa; rhythm is given if you play to the tick; but **meend/kan/gamak cannot be inferred from signal — they are musical intent** — so the honest target is assisted transcription (app proposes contour, M rules on the ornaments), which is Vilambit and Sargam merged.

True cross-rhythm spans (3:4, 5:4 across beats — model already stores exact fractions so this is additive; ground truth: the 1982 exercise page ends "or stretch tihai evenly 3/7"), theka samples, **render-style options from the 2026-07-16 scans** (phrase repeats drawn as the hand's square bracket + `2x` instead of parens; landing rendered as a small `(+)` above the landing note, as in the 1982 page; khali marker as `°` instead of `0`), sampled melody voice from M's own sarod recordings (track interface exists), volta/second-time endings ("2nd x" and "1st line" on the Desh page — spotted, wanted eventually), *kan/grace notes left this list 2026-07-16 — now §3 `{ }` ornaments* —, image (PNG/SVG) export — *print/PDF export left this list 2026-07-16, now M2.5 §4.1* —, Supabase sync, notation themes/pixel-faithful styling, structured (grid) editing.

---

## Appendix A — reference document (parser test corpus seed)

```
title: Kahe Ko (khyal) — R. 1732
raga: kirwani
tal: tintal
sa: C#
tempo: 72

Sthayi
@7 ||: .d P | mg R m m | P d N~ 'S | .d - P m | R - :||
" ka- he | ko ma- na na- | hi | ma- ne | re

Vistars
@7 S R | g - - - | - R g m | P -
@7 R m | g - - - | m R g m | P - d - | P -

Tihai
(SR gm P)x3

Krintan (cross-beat)
[[dP/mg/RS]] -

tal: free

Alap
~PS.NRS.N.D N
```

Expected derived facts (smoke assertions): sthayi `.d` at matra 11 of the line = sam; vistar `g` on khali; tihai's third `P` on matra 9; the alap section carries no markers and no tick.
