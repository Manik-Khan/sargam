# Sargam audit — September 16, 2026

## Scope and verification

Audited the authoritative checkout `/Users/khansolo/Documents/GitHub/sargam`,
branch `main`, base HEAD `42c0280d05a7`. The local, tracking, and live GitHub
commits matched. The repository preflight reported only existing uncommitted
changes; Manik explicitly authorized preserving and continuing on top of them.
Those repository safeguards and FileMaker-separation changes were preserved.
No commit, push, or deployment was performed.

Baseline: **625 checks passed, 0 failed**.
After the fixes: **643 checks passed, 0 failed**, and `npm run verify` completed
with a successful production build (121 modules). `git diff --check` passed.

This was a code and automated audit of notation, timing, rendering contracts,
print structure, project files, restoration, audio, Library/Queue, and the player.
The complete existing suite ran. New checks exercise the failures and fractional
timing rather than just checking whether new source text exists.

**Browser inspection was blocked:** the browser tool could not verify its
admin-enforced access policy for the local preview. No browser controls were
bypassed. Desktop/mobile appearance, real printing, actual audio, and interaction
acceptance have not been verified in this pass. There is no claim of a completed
visual, accessibility, security, or real-recording acceptance audit.

## Added: Jhampak

- 8½ beats, grouped 2 + 3 + 2 + 1½.
- Manik's bols: Dhi Na | Dhi Dhi Na | Tun Na | Di Di Na.
- The final three strokes last half a beat each; khali on 6 is provisional.
- New-composition choice and notation-key guidance.
- Explicit half-beat cells (`S:1/2`, `-:1/2`, `.:1/2`, `[S R]:1/2`), retaining
  existing full-beat notation unchanged.
- Half-beat duration is preserved through repeats, continuations, holds,
  Grid Write edits, source anchors, local meter clicks, slides, and krintan.
- Score/print show ½; staff export uses 17/8 and integer event durations.
- Two successive cycles tested at 60 and 120 BPM, including sam and khali.
- Jhampak currently uses the existing click fallback. The named bols do not
  constitute approval of a new sample-to-bol sound map.

See [Jhampak usage and acceptance](jhampak.md).

## Audit fixes completed

| Finding | What changed | Evidence |
| --- | --- | --- |
| Staff export played the first ending on both repeat passes | Export now follows common + first ending, common + second ending | Regression compares exported pitches and playback order |
| Unmetered grid cells could be announced as tala matra 0 | Absent cycle coordinates stay absent; written-cell labels are used | Rendered free-time cell accessibility identity tested |
| Valid JSON of the wrong shape in recents could throw during Save or Remove | Recent-file data is checked and malformed entries are filtered | Objects, strings, numbers, null entries, and malformed records tested |
| Autosave failures were silently ignored | A failed recovery save displays a save-to-file notice and retains the pending draft for retry | Simulated storage failure and recovery tested |
| Closing/hiding before the 500 ms autosave delay could lose the latest draft | Pending local text is flushed on page hide, tab hiding, and unmount | Latest-text, timer cancellation, empty-document, and flush tests |
| Notation key described outdated barline and bol behavior | It now distinguishes written phrase dividers from derived tala divisions and lists supported stroke attachments | Copy checked against parser/renderer contracts |

The autosave change protects notation text in browser storage. It does not claim
to save portable media or guarantee asynchronous project-folder writes during
browser shutdown.

## Follow-up priorities

### 1. Queue load failures — reliability, next acceptance pass

`App.jsx` commits the queue's new current item before `load-library-source`
succeeds. If the bridge is unavailable, the user sees a notice, but the queue
transition has already happened. This is a code-level finding; the practical
failure behavior still needs reproduction with real project recordings.

Recommended next change: hold the requested transition pending until matching
source identity/readiness arrives; explicitly retain/recover the prior queue
state on load error. Test unavailable URLs, delayed loads, rapid Next clicks,
A–B exit, and restoration before autoplay. This needs focused player integration
work, so it was not folded into the Jhampak timing change.

### 2. Staff export beyond a single tala — correctness

`western.js` still chooses one initial time signature for an entire document.
Its flattening does not resolve Gat return cues as `schedule.js` does. Changing
tala mid-composition or using a Gat return can therefore make the staff export
differ from intended playback. The first/second ending defect is fixed, but
this broader export limitation remains.

Recommended next change: give staff export the same performed sequence as
playback and emit time-signature changes at section boundaries, with pickup and
return-cue cases covered explicitly.

### 3. Initial download — performance

The generated main JavaScript bundle is **1,223.06 kB**, **409.42 kB gzip**.
The existing large-chunk build advisory remains. No timing measurements were
possible in this browser session, so this is a bundle-size finding, not a claim
about measured load speed.

Recommended next change: profile first load, then load infrequently used export
and instrument functionality on demand. Keep the accepted notation/player
layout and mounted-player behavior intact.

## Manual acceptance before release

1. Create a Jhampak document and play the example in `jhampak.md` for two cycles.
   Confirm the half-beat ending, next sam, and provisional khali at 6 by ear.
2. Edit a half-beat note in Grid Write and switch back to Text Write. Confirm
   the suffix and timing remain, and that explicit `:1` restores a full beat.
3. Inspect Clean, Cells, and Graph Paper, including a printed/PDF composition;
   check that ½ labels do not collide with notes, octave dots, or tala markers.
4. Open/close the new-composition form and inspect it on narrow and wide screens.
5. Follow `docs/release-checklist.md` for real-recording Library/Queue and project
   restoration. Browser-side autosave warning and tab-hide behavior also need
   acceptance in the supported browser.

The local preview was served at `http://127.0.0.1:5173/`. The published site is
unchanged until Manik uses the normal repository/hosting release workflow.
