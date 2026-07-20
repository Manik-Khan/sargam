# Anchor Geometry Stabilization — Wave 1 candidate

**Date:** 2026-07-20  
**Status:** automated gates green; awaiting Manik's Preview / Export / Print / ear review

## Baseline and result

Input clone:

```text
413 passed, 0 failed
vite build succeeded — 91 modules transformed
```

Wave 1 candidate:

```text
418 passed, 0 failed
vite build succeeded — 93 modules transformed
```

The existing Vite chunk-size warning remains informational and was not addressed in this geometry wave.

## Root causes found in the real clone

1. Anchor overlay x-coordinates were measured from `.sr-line-block`, whose border box includes the equal repeat-gutter padding, but applied inside lower lanes whose origin begins at the block's inner content edge. That coordinate-space mismatch shifted Diri and meter horizontally.
2. Lower lanes were appended only when used and in call order. A legacy meter lane could therefore appear before the articulation lane and push Diri to a different vertical position.
3. Preview and Export rescanned source Markdown after rendering to recreate attack identities. This duplicated parser knowledge and could drift from the parsed model.
4. Meter continuations estimated fractional positions from whole cell rectangles instead of resolving exact written-slot edges.
5. The repeated local-slide source pitch was top-aligned above its approach curve rather than sitting at the beginning of the local `n → D` gesture.

## What changed

- Added `src/engine/notation-geometry.js`, a pure model-to-geometry contract for exact attacks and written slot boundaries.
- `render.js` now stamps attack ordinal, note, octave, exact start/end time, and metric boundary metadata directly from the parsed model.
- Added `src/shell/score-geometry.js`, the single browser adapter used by both anchor and legacy-meter rendering.
- Diri endpoints now resolve to the centers of the two actual note glyphs.
- Meter spans now run from the left edge of the first selected slot to the right edge of the last selected slot; folded continuations resolve exact slot/boundary positions.
- Every rendered system now owns one deterministic lower-lane stack in this order:
  1. articulation;
  2. legacy meter;
  3. anchored meter.
- Preview and Export keep the same overlay mounting seam, but no longer rescan source text to invent attack geometry.
- Repeated local approaches retain their existing first-class parser/schedule model; CSS now seats the `n` at the start of its local curve instead of floating above it.
- Added five semantic regression checks in `smokes/anchor-geometry.smoke.js`, including an explicit lane-relative coordinate test.

## Files changed

```text
src/engine/render.js
src/shell/anchor-overlay.js
src/shell/meter-overlay.js
src/shell/sargam.css
```

## Files added

```text
src/engine/notation-geometry.js
src/shell/score-geometry.js
smokes/anchor-geometry.smoke.js
ANCHOR_GEOMETRY_WAVE_1_2026-07-20.md
```

## Acceptance check

Use the canonical sources from the handoff and verify:

- Diri arms meet the two `g` glyph centers in `m-gg`, with the V point centered between them.
- Diri remains at the same vertical baseline whether or not a meter span exists on the line.
- Meter `6` begins at the first written slot of `g---RS` and ends after the selected landing `R` slot.
- Preview, Export preview, browser Print, and Save as PDF match.
- `{n~}D--{n~}D` shows two separate local approaches and sounds with `D--D` timing.
- Repeat gutters and tala-marker stability should still be rechecked; they are not declared accepted by this package.
