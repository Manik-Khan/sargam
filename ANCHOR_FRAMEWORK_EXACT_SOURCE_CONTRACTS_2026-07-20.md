# Sargam Anchor Framework — exact source contracts

## Exact Anchor Framework source contracts (2026-07-20) <!-- SARGAM_EXACT_SOURCE_CONTRACTS_2026_07_20_V3 -->

This section records exact current identifiers that must be inspected before future patches.

- `src/engine/render.js` uses the symbol table name `BOL_SYMBOL`.
- Binding symbols: Da `|`, Ra `—`, Diri `V`, chikari `^`.
- Diri spans two consecutive attacks; it is not a one-note symbol.
- The legacy render smoke contains assertion comments `diri on g` and `chikari on m`. Patch those semantic assertions directly; do not locate the smoke by its title.
- The Anchor Framework meter field is identified by `id="cmd-anchor-meter"`; placeholder text is not a stable API.
- `ExportView.jsx` uses measured two-pass rendering: an initial render for width measurement, then a final render with `maxSystemEm`.
- Future installers must be tested against verbatim files from the current clone, not rewritten fixtures. Avoid guards based on variable names, exact whitespace, headings, test titles, or UI prose unless those are the actual contract.
- All edits must be computed and validated before any file is written.

