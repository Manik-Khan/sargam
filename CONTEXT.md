# Sargam — Project Context & Handoff (final update 2026-07-16)

**What this is:** a complete D&D-session-style handoff for Sargam — M's web app for writing, rendering, and hearing Hindustani classical notation. Written so that *anyone* can pick the project up cold: M working alone, a future AI assistant, a human collaborator. Read this with `docs/design-spec.md` (the requirements authority) and `docs/build-plan.md` (code contracts). If you are an AI assistant: the working rules at the bottom are binding; M is the authority on the tradition — never improvise raga/tala/notation semantics, ask him.

## Where things stand: M1 · M2 · M2.5 · KAN · M3 (Waves A+B+C) ALL SHIPPED

Sargam is a **working instrument**: type notation → see it rendered in the hand's own conventions → press Space and hear it, with tal ticks, loop-a-line practice, click-to-position, kan ornaments that slide, meends that bend, export to PDF, save/autosave, and a Netlify deployment.

- **Live:** https://sargam-notation.netlify.app (Netlify auto-builds `Manik-Khan/sargam` main: `npm run build` → `dist`). Custom-domain move to `sargam.manikkhan.com` whenever wanted (Domain management, same as tok.manikkhan.com).
- **Suite: 233 passed, 0 failed** — seven suites (tala 27 · parse/serialize 91 · render 37 · files 40 · schedule 26 · audio 9 · dsp 6). `npm run smoke` is the gate; green suite + M's eyeball/ear = done.
- **Verified against the handwriting** (2026-07-16, two scans: 5-16-82 exercise page; Jaijaiwanti med. tintal): kan, arcs, octave marks, sustains, vibhag numerals all match. Divergences backlogged (below).

## How to work on this alone (M — this section is for you)

1. `npm install` once per fresh checkout; `npm run dev` for live editing; `npm run smoke` before trusting any change; `npm run build` before deploying (or just push to GitHub — Netlify builds).
2. **The smoke suite is your safety net.** 233 checks encode every ruling you made. If you (or any future helper) change engine code and the suite stays green, the notation semantics survived. If a smoke fails, either the change is wrong or the ruling changed — update the smoke ONLY with a comment saying which ruling superseded it (see the "SUPERSEDED" comments in parse.smoke.js for the pattern).
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

- **Dictation (`src/engine/dictation.js`, SHIPPED 2026-07-16, 18 smokes):** `spokenToAtoms(input, {raga}) → {atoms, problems}` + `atomsToText(atoms, {separator})`. Type/say `sa ga ma pa dha ni sa` → `S G m P D N S`; raga defaults (`RAGA_SCALES` — DATA, Bhairavi present from M, **never invent a raga's notes**); explicit `komal`/`shuddh`/`tivra` override; octave words `low`/`high` + `mandra`/`madhya`/`taar` (ONE-SHOT — M may prefer sticky); bare notation letters accepted and mixable with words (M's own example did this). **UI SHIPPED** (`src/shell/DictateBar.jsx`, "Dictate" button): type syllables → live preview → Insert at the text cursor; "one beat" checkbox toggles the separator (M's open ruling on the default). **Mic button is an honest experiment**: Web Speech API, Chrome-only, en-US-trained (sargam WILL mangle — extend `ALIASES` in dictation.js from what you actually see), and it SENDS AUDIO TO A SERVER — the one place Sargam breaks its offline principle; opt-in per use, never passive, and the UI says so. Typing needs none of it. The durable answer remains an on-device model (see spec §10: Web Speech API breaks the offline principle; on-device model is the right answer and needs training data M is uniquely able to record). M's open rulings noted in the module's comments.
- **Western notation (`src/engine/western.js`, SHIPPED 2026-07-16, 15 smokes; "Staff ↗" button in the toolbar):** `spellDegree(saValue, ch, octave) → {step, alter, octave, midi}` and `documentToMusicXML(doc) → string`. **The spelling rule (the part that needs sargam):** each degree owns a LETTER — Sa=tonic letter, Re=2nd, Ga=3rd, Ma=4th, Pa=5th, Dha=6th, Ni=7th — komal/tivra become the accidental. Sa=C → komal ga = E♭; Sa=D → the same komal ga = F natural. No key-signature guessing: sargam states the scale degree that Western spelling has to infer. XML: time sig from the tal (tintal 16/4, rupak 7/4), one measure per avartan, notes crossing barlines split + tied, sustains lengthen notes, rests emit, kans become `<grace slash="yes"/>` acciaccaturas (correct — a kan is crushed), tempo → metronome mark, raga/laya/year/etc → miscellaneous-fields. **Known limits:** no `<time-modification>` tuplet markup yet (durations are exact; importers infer the beaming) — that's the natural next increment; free sections flow in 4/4; single staff, treble clef, no key signature (accidentals are explicit — arguably right for this music).
- **Western note-name toggle SHIPPED** ("SRG"/"CDE" button, persisted as pref `noteNames`): `renderDocument(doc, {noteNames:'western'})` swaps ONLY the letter — same grid, same octave dots, same tints, same arcs; the text stays sargam always. Export view honors it. This is a reading aid, NOT staff notation.
- **A LIVE staff toggle is a separate milestone**, not an increment: it needs VexFlow (a real dependency) plus a full tuplet/beam/ledger layer. MusicXML gets ~80% of the value today and is verifiable in node, which is why it went first. If someone builds the toggle, `spellDegree` + `flatten()` in western.js are the foundation and already do the musical thinking.
- **M4 — write comfortably:** selection commands (wrap selection in `{ }` / krintan / tihai / octave shift / repeats) + the `/` menu. The notation all exists; M4 is typing ergonomics. Own planning pass + mock first.
- **M5 — harden:** verify the remaining tal definitions WITH M (data-only edits in `src/engine/tala.js`), free-section polish, broaden smokes.
- **Grid editor:** Phase 2, own design cycle; the playback cursor machinery it needs now exists.
- **Backlog with scan evidence (spec §10):** render phrase repeats as the hand's square-bracket + `2x`; landing rendered as the tiny `(+)` above the landing note (as on the 1982 page — M has hand-computed these in margins for decades); khali as `°`; cross-rhythm ("stretch tihai evenly 3/7" — the model's exact fractions were built for it); volta endings; sampled voices; Supabase sync; image export.
- **Open rulings (M's, whenever):** the laya ladder wording (spec §3.1 has a PROPOSED 7-rung spectrum marked as inference — correct it, then update the New-doc form's options to match); whether `type:` (composition/alap/transcription) joins the form; ~~whether the default `sa:` moves from C# to C~~ — RULED: default is C (M, 2026-07-16, "I have the key as C"); `DEFAULT_SA` exported from schedule.js, imported by western.js and render.js; "Key (Sa)" field in the New Doc form with the three anchors. NOTE the trap that surfaced it: `key: C` in the frontmatter prints on export (provenance tier) but does NOT drive pitch — only `sa:` does.

## The settled rulings (all M's, 2026-07-16 unless noted — binding on any future collaborator)

- **Text is the source of truth.** Save writes the editor text verbatim + surgical identity edit; never serialize(parse(text)). The transport BPM knob WRITES `tempo:` for the same reason.
- **`laya:`** = the tradition's word for speed (full spectrum, no numbers). **`tempo:`** = the literal playback bpm. Independent; never prefill either from the other.
- **`composition:`** vocal/instrumental. **`type:`** reserved: what the document IS (composition/alap/transcription). All header metadata optional.
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
