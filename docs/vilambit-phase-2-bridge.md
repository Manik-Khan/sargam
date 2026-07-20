# Vilambit Phase 2 — v1 Practice Bridge

This increment keeps Vilambit as the only recording-playback engine. Sargam's Notation view receives a compact remote/state display; it does not create a second media element or audio graph.

## Envelope

Every message is structured and versioned:

```js
{
  channel: 'sargam.vilambit',
  version: 1,
  direction: 'command' | 'event',
  type: '...',
  payload: {}
}
```

Both sides validate the iframe window and same origin. The only exception is local `file:` testing, where browsers report the opaque origin `null`; messages still require the exact parent/frame window.

## Parent → Vilambit commands

- `request-state`
- `play`
- `pause`
- `toggle`
- `seek` — `{ seconds }`
- `skip` — `{ deltaSeconds }`
- `set-loop` — `{ a, b, on }`
- `clear-loop`
- `jump-marker` — `{ index }`

Unknown commands are rejected. The full player object, DOM, buffers, AudioContext, and WASM engine never cross the boundary.

`Open Vilambit` is intentionally a Sargam view action, not a player command. It reveals the already-mounted iframe and does not reload it.

## Vilambit → parent events

Event types are `ready`, `state`, and `error`. Their payload is the serializable snapshot produced by `VilambitCore.createPublicSnapshot`:

- ready / source loaded
- source name and kind
- duration and position
- playing / paused
- speed and pitch
- loop A/B/on
- markers
- error text

Vilambit publishes on meaningful state changes, four times per second while position is moving, and at least once per second as a heartbeat so a newly mounted or hot-reloaded parent cannot miss the initial state.

## Compact practice bar

The Notation view shows recording identity, current/duration, Play/Pause, ±5 seconds, loop range, errors, and `Open Vilambit`. The original full player remains mounted at all times and continues owning playback while hidden with `visibility`.

## Browser verification

1. Load a recording in Vilambit.
2. Return to Notation; confirm its name/duration appear.
3. Play, pause, and skip ±5 seconds from the compact bar.
4. Set an A–B loop in the full player; confirm the range and on/off state appear in Notation.
5. Use compact Play while the loop is active.
6. Press `Open Vilambit`; confirm the same recording, playhead, and loop remain intact.
7. Repeat the seek-before-first-play test: load, seek in full Vilambit before first Play, return to Notation, then press Play.
