# Sargam notation continuity wave — 2026-07-20

This wave follows the Anchor Framework v1 checkpoint.

## Binding additions

- Da is `|`, Ra is `—`, Diri is an uppercase `V` spanning two consecutive attacks, and chikari is `^`.
- Anchor marks are essential notation and must render in Preview, Export preview, browser Print, and Save as PDF.
- `||:` and `:||` live in equal outside gutters; they never narrow or shift the shared notation columns.
- Tala markers are static geometry. Playback rerenders may not animate their alignment transform.
- `{n~}D--{n~}D` is one matra with the timing of `D--D`: first D = 3/4, second D = 1/4. Each D begins as a local slide from n; n adds no grid time and no separate strike.
- `gat@8..@1` means: enter the preceding Gat at cycle matra 8, replay until—but not including—the next cycle matra 1, then resume the next written line. Existing `gat`, `gat@N`, and `gat!` remain unchanged. All display and print simply as `gat`.

## Exact implementation contracts worth preserving

- `ExportView` uses a measured two-pass render. Anchor stamping/overlays belong after the final packed render, not the measurement render.
- The App export mount passes both raw `sourceText` and parsed `anchorMarks`.
- Marker alignment uses a static transform with no CSS transition.
- Repeat glyphs are absolutely positioned in reserved line gutters; every line reserves the same gutter whether or not it repeats.
- Future installers must match semantic seams and be tested against verbatim current files, not variable names, smoke titles, placeholder prose, or exact whitespace.
