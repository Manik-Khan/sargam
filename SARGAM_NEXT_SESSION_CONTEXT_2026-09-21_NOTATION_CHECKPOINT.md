# Sargam — Next-session context, September 21, 2026

## Current repository and scope

Implementation lives only in `/Users/khansolo/Documents/GitHub/sargam`.
At the start of this documentation update, remote preflight passed on clean
`main`: local HEAD, origin/main and live GitHub main all matched
`5139fb4431a4` (`updating bols and writing`). Earlier changes are now in history:
`ca7629efd5f0` contains the notation fixes; `18a3d876a656` contains the earlier
issue/Jhampak work. Do not treat prior handoff statements about uncommitted
implementation as the current Git state. Deployment has not been verified.

This is the latest handoff. It supersedes older current-state and next-action
claims, while retaining the July 30 accepted shell and print lifecycle.
Read `CONTEXT.md`, `AGENTS.md`, and the relevant feature guide before editing.
Run `npm run repo:preflight:remote` at the start of future implementation work.
Preserve unrelated changes; do not commit, push, or deploy without authorization.
The ChatGPT project mirror and its old `sargam-diri-span-workspace` are reference
material, not the implementation checkout. Synced files under `sources/` are
read-only. FileMaker remains separate from Sargam.

## User decisions to preserve

- **Typing remains essential.** Buttons are optional shortcuts over ordinary
  editable notation Markdown. The conversation mock was a demonstration;
  only the controls installed inside Sargam change the composition.
- **Clicking selects and seeks.** Markdown notes, rendered notes/subdivisions,
  Grid Write cells, and Beginning use the same playhead behavior: keep playing
  only if already playing. A stopped or paused player stays silent. Dragging a
  text selection and programmatic source reveals do not scrub playback.
- **Jhampak is 8½ beats.** Grouping is 2 + 3 + 2 + 1½; the last half-beat is
  automatic, followed by sam. Show `½`, not a full beat 9 followed by decimals.
  Ashta Jhaptal / Ashta Jhaptaal are recognized aliases. Khali at 6 is still
  provisional; do not invent further musical rulings.
- **Recording preparation stays on the user's computer.** No recording uploads
  for decoding and no extra installed user app. The optional decoder is a
  same-origin WebAssembly download, used for unsupported local audio. This does
  not promise support for every file, damaged media, or real video conversion.
- Keep the green/warm-paper shell, source-based identities, distinct musical
  and recording transports, and approved print-preview lifecycle.

## Implemented and verified in the preceding work

### Text Write controls and shorthand

The Selected notes panel exposes Slide, Krintan, Kan / grace, None, per-note
bol selectors, existing bol passes, and the actual written shorthand. Selecting
an entire ornament lets the controls replace or remove its wrapper. Directly
typed ornaments update the same controls. Grid Write retains direct cell typing
and its existing per-note bol menus. Writing focus hides secondary controls.

| Intent | Direct shorthand |
| --- | --- |
| Slide in one beat | `~(Gm)` |
| Slide across two beats | `~(G m)` |
| Krintan | `[[Gm]]` |
| Grace G into destination m | `{G}m` |
| Krintan within a subdivided beat | `[-[[RS]]-.n]` |
| Bols on timed notes | `> da ra . diri` |
| One diri across the next two attacks | `> di-ri` |

Existing compact spellings remain valid. Control edits validate against the
parser and preserve notes, octaves, cell count, and cell durations. Invalid
partial scopes are disabled with an explanation. Kan controls take connected
notes within one beat; deliberate structural changes remain available by typing.

When notes become graces, surviving destination/following bols keep their note
identities across every pass. Bols on newly untimed notes are removed with a
message. A spanning diri is removed as a whole if its endpoints no longer
survive together. Gap chikari follows its original written hold/rest slot; edits
that remove that slot are rejected. One Undo restores the complete ornament
edit, bol changes, and selection. The older bol-capture scanner still limits
some source forms; surface its error rather than guessing an attack.

See [writing controls](docs/notation-writing-controls.md).

### Notation playback and formatting

Source clicks use parsed attack identities and rendered clicks use exact slot
offsets. Grace clicks belong to their timed destination. A rendered attack
reveals the corresponding note in Markdown; programmatic Grid Write focus does
not rewind a subdivision seek. Native instrument voices queued before a seek
or pause are cancelled alongside cursor timers and soundfont voices.

Width calculation excludes preview padding. Graph-paper rows reserve more
height for extra bol passes and lyrics. Expanded cells, cross-cell diri spans,
and their final measured endpoints align in preview and export. Ornament
anchors use the destination glyph instead of the first small grace note.

A matra is one logical selectable cell, but dense contents may occupy two or
three physical graph columns. Do not reintroduce a strict one-square rule.
Protected ornaments/phrases are not split merely to fit the page; an oversized
indivisible phrase can still overflow. Extreme density and long grace runs need
live review. These repairs are not a complete visual acceptance sign-off.

See [notation repairs](docs/notation-repairs-2026-09-20.md).

### Earlier completed repairs

Save completion preserves newer edits, writes are serialized, and workspace
checkpointing continues during playback. Queue commits only after matching
playable readiness and restored workspace acknowledgement. MusicXML shares
performed traversal for mixed tala, Gat returns and pickups. Native decoding
uses bounded header reads, a 64 MiB estimated PCM limit, and a 15-second deadline;
format failure can start the existing local fallback immediately.

See [audit repairs](docs/audit-repairs-2026-09-20.md) and
[audio compatibility](docs/audio-compatibility.md). The original September 20
audit is historical evidence, not a list of still-unfixed implementation defects.

## Verification and next acceptance work

Latest implementation verification: **708 smoke checks passed, 0 failed;
production build passed (127 modules)**. Real React interactions were exercised
in jsdom; CodeMirror undo/redo and notation/bol transformations have regression
coverage. The existing large-bundle advisory remains. Automated results do not
establish audible output, pixel-perfect layout, or physical printing.

Next, use [release checklist](docs/release-checklist.md) with real compositions:

1. Type and select each shorthand form; replace/remove ornaments, assign bols
   across passes, Undo/Redo, and switch Text/Grid Write at narrow and full widths.
2. Click different notes inside `Gm` while paused and playing; ensure selection,
   source reveal, audio and playhead agree. Selection drags must not scrub.
3. At 60 BPM in Jhampak, use
   `@3 ||: G - Gm | R- S | .N.D .N|S - :||`.
   The final S is sam at 6.5 seconds from this line's beginning, and each pass
   lasts 8.5 beats. Inspect repeats and the next line's continuation too.
4. Compare Cells, Graph Paper and all PDF styles with lyrics, multiple bol
   passes, dense subdivisions, kan/krintan and cross-cell diri. Save a multipage
   PDF and compare it to the export preview; cancel/reopen printing twice.
5. Test successive local audio/video replacements and the original failing
   M4A when available. Check preparation/cancellation, seeking, pitch/speed,
   A–B loops, and the absence of recording uploads in the Network panel.
6. Save while typing, close/reopen while listening, and exercise slow/broken
   archive Queue loads. Inspect mixed-tala/Gat/pickup MusicXML in a reader.

Chrome computer-use access was previously denied; no browser acceptance or
permission bypass was performed. The original failing M4A remains unavailable
for direct codec confirmation. Bundle profiling/splitting and broader visual,
keyboard/accessibility, storage-failure and real deployment acceptance remain.
