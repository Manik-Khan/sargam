# Named notation controls and direct shorthand

Approved by Manik after the interactive control proposal. Implementation base:
`/Users/khansolo/Documents/GitHub/sargam`, `main`, `ca7629efd5f0`.

Text Write remains the source of truth. Select notes in its editor, then choose
Slide, Krintan, Kan / grace, or None in **Selected notes**. Select the complete
written ornament to replace or remove it. The written-shorthand preview shows
the actual music line and its editable bol lanes. These buttons act inside
Sargam; the earlier conversation mock does not modify compositions.

| Intent | Type directly |
| --- | --- |
| Slide within a beat | `~(Gm)` |
| Slide across beats | `~(G m)` |
| Krintan | `[[Gm]]` |
| Grace G into destination m | `{G}m` |
| Scoped krintan inside a beat | `[-[[RS]]-.n]` |
| Per-note bols | `> da ra . diri` |
| Diri across two successive attacks | `> di-ri` |

Existing compact spellings remain supported. No parser grammar was removed or
redefined. Grid Write retains its editable cells and existing per-note bol
menus. The new selection panel lives in Text Write; Writing focus hides it
alongside the other secondary controls.

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

Verification: run `npm run verify`. Regressions exercise direct-typed/control
parity, replacing/removing wrappers, per-pass bol remapping, surviving diri
endpoints, Jhampak duration, invalid partial selections, gap-chikari protection,
atomic undo/redo, and real React button/select interactions in jsdom.

Live acceptance still required: open a real composition in Chrome/Safari, type
and select notation, apply each ornament, change bols, undo, switch Text/Grid
Write, and check that the bounded panel leaves both score and source usable at
small window sizes. Browser visual/audio acceptance is not established by jsdom.
No commit, push, or deployment is part of this implementation.
