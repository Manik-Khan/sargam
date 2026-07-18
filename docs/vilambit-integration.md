# Vilambit integration phases

## Phase 1 — split the monolith without changing behavior

Completed in this checkpoint.

`public/vilambit.html` remains the stable iframe entry point used by Sargam. Its
first-party CSS and JavaScript, plus the two generated vendor engines, now live
in separate static assets:

- `public/vilambit/vilambit.css`
- `public/vilambit/vilambit-app.js`
- `public/vilambit/vendor/signalsmith-stretch.js`
- `public/vilambit/vendor/libflac.js`

The files are still loaded as ordinary blocking scripts in their original
order. The iframe remains always mounted and is hidden with `visibility`, not
`display:none`, so looping playback survives a switch back to Notation.

The seek-before-first-play correction remains in `vilambit-app.js`:

- while the engine is `none`, `seekTo()` writes both the media element and the
  paused buffer position;
- `pos()` trusts the paused position before engine selection;
- first play reconciles the selected engine with that stored position.

This phase deliberately does **not** convert the player UI or audio engine to
React. It only creates maintainable file boundaries while preserving behavior.

## Phase 2 — testable player core

Extract pure position, clamping, loop, marker, and transport helpers from
`vilambit-app.js` into importable modules. Add direct smoke coverage for the
pre-play seek path instead of relying only on source extraction.

## Phase 3 — Sargam/Vilambit bridge

Add a small `postMessage` contract for current position, A–B loop boundaries,
markers, filename, and playback state. This can support actions such as
inserting a Vilambit timestamp or marker into a notation/layout annotation.

## Phase 4 — native Sargam view

Move the visible controls to React while keeping decoded buffers, Web Audio,
WASM engines, media elements, animation frames, and object URLs in an
imperative player controller. The view must remain mounted across tab changes.
