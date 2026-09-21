# Named notation controls and direct shorthand

Approved by Manik after the interactive control proposal. Implementation base:
`/Users/khansolo/Documents/GitHub/sargam`, `main`, `ca7629efd5f0`.
September 21 checkpoint: this implementation is now in matching local/tracking/live
main at `5139fb4431a4`. Deployment is unverified.

Text Write remains the source of truth. Open **Note tools** in the Text/Grid
toolbar. Select notes in the editor, then choose
Slide, Krintan, Kan / grace, or Remove ornament in **Note tools → Selected notes**. Select the complete
written ornament to replace or remove it. The written-shorthand preview shows
the actual music line and its editable bol lanes. These buttons act inside
Sargam; the earlier conversation mock does not modify compositions.

| Intent | Type directly |
| --- | --- |
| Slide within a beat | `~(Gm)` |
| Slide across beats | `~(G m)` |
| Krintan | `[[Gm]]` |
| Grace G into destination m | `{G}m` |
| Grace P into m inside Gm | `G{P}m` |
| Approach m from P without a separate P strike | `G{P~}m` |
| Slide across a bar; hold stays in R’s beat | `~(Gm | R)-` or `~(Gm | R-)` |
| Scoped krintan inside a beat | `[-[[RS]]-.n]` |
| Per-note bols | `> da ra . diri` |
| Diri across two successive attacks | `> di-ri` |

September 21 inline-ornament repair (base `f0d5043e4b3e`): an attached
brace ornament no longer starts a new beat in the middle of a cluster. The
small grace and curve belong at their destination. Each grace run borrows
playback time from its own destination; a dense run cannot make the destination
negative. Saved notation retains each grace's position, including multiple
runs and bracketed subdivisions. Scoped slide curves and source indices follow
the selected notes inside a beat.

An attached dash after `~(...)` extends the last cluster inside the slide;
a space before the dash still creates a separate beat. Bare `(…)` remains
phrase-repeat syntax requiring `xN`; `G(P)m` is not an alias.

**Next UI proposal:** replace the immediate-action ornament row with a command
list and preview of the highlighted notation. Show the actual rendered result,
its musical intention and exact shorthand, then Apply. This is a mock awaiting
review, not a shipped panel. Preserve selection stability and direct typing.

Existing compact spellings remain supported. No parser grammar was removed or
redefined. Grid Write retains its editable cells and existing per-note bol
menus. The selection panel lives in Text mode, in a manually opened inspector below
the source. Focus mode hides it alongside the other secondary controls. See
[the compact workspace layout](compact-workspace-layout.md) for the new toolbar
locations. Selection itself never opens or expands the inspector.

September 21 selection regression repair (base `face6d601d62`): the panel now
reserves the same compact height for empty, short and long selections, with
internal scrolling and a keyboard-focusable scroll region. Extra bol rows and
shorthand cannot move the editor. During a pointer drag the source selection
remains live, while control and score-line updates wait for release. Releasing
outside the editor, cancelling, switching to keyboard selection, and unmounting
all finish or cancel pending work. The existing workspace divider can still
resize the score/source split.

Controls parse and validate candidate edits before writing them. They preserve
notes, octaves, cell count and each cell's duration, including Jhampak's inferred
half-beat. A partial selection that would change those boundaries is disabled;
the explanatory tooltip identifies the problem. Direct typing remains available
for deliberate structural/rhythmic changes. The Kan control accepts connected
notes in one beat, with the last note as destination.

Changing timed notes into graces remaps every existing bol pass to the surviving
note identities. Bols on newly untimed grace notes are removed with a message;
destination and following-note bols remain attached correctly. A spanning diri
whose endpoints no longer survive together is removed as a whole. Gap chikari follows its original written hold/rest slot when earlier attack
counts change. An edit that would remove its slot is blocked instead of guessing
a new position; that case remains an explicit music-and-bol-lane text edit.

The per-note bol selectors expose existing passes and use the established bol
writer. Diri labels distinguish two strikes on one note from the next-note span.
Bol placement may be unavailable where the older capture scanner cannot resolve
a source line; its existing error is shown rather than silently misplacing a bol.

Ornament and bol control edits use one isolated CodeMirror history transaction.
Undo restores the notes, bol lanes and selection together. Direct source typing
keeps ordinary CodeMirror undo behavior.

Completed verification: `npm run verify` — **726 checks passed, 0 failed;
production build passed (132 modules)**. Regressions exercise direct-typed/control
parity, replacing/removing wrappers, per-pass bol remapping, surviving diri
endpoints, Jhampak duration, invalid partial selections, gap-chikari protection,
atomic undo/redo, real React button/select interactions in jsdom, and pointer
gesture completion/cancellation with CodeMirror selection state.

Live acceptance still required: open a real composition in Chrome/Safari, type
and select notation, apply each ornament, change bols, undo, switch Text/Grid
Write, and check that the bounded panel leaves both score and source usable at
small window sizes. Drag forward and backward across multiple notes/lines,
release outside the editor, and confirm that the source stays under the pointer
while bol controls scroll independently. Browser visual/audio acceptance is not established by jsdom.
No commit, push, or deployment is part of this implementation.
