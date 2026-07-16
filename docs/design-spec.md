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

A composition file is plain text: **directives**, **section labels**, **music lines**, **lyric lines**, **bol lines**, separated by structure described below. Default file extension: `.txt`.

### 3.1 Directives

`key: value` lines. At the top of the file they form the header; mid-document they apply from that point forward (enabling tal changes and free passages).

- `tal:` — required before the first metered music line. Values: a tal name, or `free` (unmetered — vibhag validation and tick playback off for the following material).
- `title:`, `raga:` — optional metadata.
- `sa:` — playback pitch of Sa. Default `C#`.
- `tempo:` — bpm per matra. Default `60`.
- `id:`, `created:`, `modified:` — written and maintained automatically by the app on save (the Supabase-shaped identity). Hand-editing them is legal but never necessary.

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

- **`~` — slide/meend.** Marks connection; never affects timing. Within or prefixing a cluster (`~SR`, `S~R`): the slide arc covers the cluster. At a token edge with a space (`N~ 'S` or `N ~'S`): the arc spans across the matra boundary into the neighboring note. Chains freely (`d~P~m`). Renders as the over-arc, extending to the destination note when the connection says so — the distinction between "slide ends, next note freshly articulated" (`...D N`) and "slide lands the note" (`...D~ N`) is carried by one character.
- **`[[ ... ]]` — krintan.** A span annotation that may contain `/`, spaces, and `|` — krintans legally cross beats and barlines: `[[dP/mg/RS]]`. Renders as the square over-bracket across the full span.
- Neither is typically typed by hand — see §5 (selection commands) — but both are ordinary text and always hand-editable.

### 3.7 Lyric lines (`"`)

Tokens attach **left to right to matras that begin with a struck note**, skipping sustain and rest matras — per vibhag when the lyric line includes `|` dividers, otherwise across the whole line. Extra matras in a vibhag stay blank (the syllable carries, matching the pages — "hi" rides through the held notes without repeating). `.` in a lyric line is an explicit skip, for placing a syllable on a later note. A cluster is one matra and receives one syllable.

### 3.8 Bol lines (`>`)

Instrumental stroke marks, typed as words, rendered as the handwriting's symbols (M's correction, 2026-07-16, superseding the earlier `l`/`-`/`v` shorthand): `da` renders as the vertical tick `|` under its note, `ra` as the horizontal tick `—`, `diri` as `^`, `chikari` as `v`. A `.` token is an explicit gap — the note event under it carries no mark, mirroring lyric skips. Tokens attach **per note event** in order — including each note inside clusters — skipping sustains and rests. Da diri diri da with a gap: `> da diri . diri da`.

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
- **Repeats** render `||: :||` and `( )xN`; with the cursor inside a repeat, the landing report shows inline.
- **Diagnostics:** unparseable fragments render as dimmed literal text in place; a problems strip below the preview lists issues with line/position ("line 4, vibhag 2 has 5 matras"). The strip is the single voice for all parse feedback.
- **Playback cursor:** highlights the sounding matra cell, auto-scrolls.
- **Not in v1:** pixel-faithful handwriting reproduction (this is a clean typeset rendering of the same conventions); print/PDF export (backlog; cheap once rendering is right).

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

Transport: play/pause/stop; tempo control; **loop a selected line or section** (the practice case); play-from-cursor.

## 7. Files, persistence, errors

- **Save/open `.txt`** via the browser file picker. Continuous **autosave to browser storage** so a crash or accidental close loses nothing; explicit unsaved-changes indicator; recent-files list.
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
2. **M2 — keep your music:** `files.js` — open/save, autosave, recent, identity directives.
3. **M3 — hear your music:** `schedule.js` — melody + tick + cursor; transport; loop; landing reports live.
4. **M4 — write comfortably:** selection commands (krintan, tihai, slide, octave, repeats) + `/` menu.
5. **M5 — harden:** remaining tal definitions verified with M; free-section polish; smoke suite to full breadth.

Phase 2: grid editor (separate design cycle). 

## 10. Deferred / backlog (explicitly out of v1)

True cross-rhythm spans (3:4, 5:4 across beats — model already stores exact fractions so this is additive), theka samples, volta/second-time endings ("2nd x" and "1st line" on the Desh page — spotted, wanted eventually), kan/grace notes (the superscript notes in the handwriting), print/PDF export, Supabase sync, notation themes/pixel-faithful styling, structured (grid) editing.

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
