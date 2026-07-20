# Vilambit Phase 2A — player core extraction

This increment begins **Vilambit Phase 2 — Player Core and Practice Bridge** by isolating transport/state calculations from Vilambit’s DOM, media element, Web Audio graph, WASM engines, object URLs, and animation loop. It is deliberately a behavior-preserving seam, not a visual rewrite.

## New core

`public/vilambit/vilambit-core.js` exposes `globalThis.VilambitCore` for the existing classic-script player. The core owns pure calculations for:

- position and duration clamping;
- tempo and pitch limits;
- engine-specific current-position selection;
- seek routing;
- first-play position reconciliation;
- A–B loop normalization, setting, and clearing;
- stable marker add/move/remove ordering;
- a serializable public snapshot for the future iframe bridge.

The confirmed seek-before-first-play ruling is represented directly by `planSeek()`: while the engine is `none`, both `state.posPaused` and `media.currentTime` must be written.

`createPublicSnapshot()` is intentionally narrow. It exposes only source identity, duration, position, playing state, speed, pitch, loop, markers, readiness, and an error string. It cannot leak AudioContext nodes, decoded buffers, object URLs beyond the loaded/not-loaded boolean, DOM nodes, or the WASM engine object.

## Integration boundary

The installer loads the core before `vilambit-app.js` and routes the existing position, seek, loop normalization, tempo clamp, and marker ordering through it. The audio engine, UI, event listeners, iframe mount behavior, and keyboard controls remain owned by the existing player.

This increment preserves:

- the always-mounted iframe;
- `visibility`-based tab hiding;
- `allow="autoplay"`;
- seek-before-first-play behavior;
- the existing sound engines and player layout.

## Smoke coverage

`smokes/vilambit-core.smoke.js` directly exercises the pure core, including the pre-play seek path that the older static smoke could only recognize as source text. The asset smoke is updated to verify load order and that the browser app routes through the core.

## Next increment

Add a versioned `postMessage` adapter around this boundary:

```text
sargam.vilambit.v1
```

The child should publish the public snapshot and accept only validated commands such as play, pause, seek, set/clear loop, and jump to marker. Validate both `event.source` and the expected origin. Do not expose the internal `state` object.

Only after that contract is green should the Notation-side compact practice bar be added.
