# Sargam — Vilambit Source Workspace Wave 1B

**Date:** 2026-07-23
**Wave:** Marker/Loop Workflow and UI Cleanup
**Baseline:** exact post–Source Workspace Wave 1 clone supplied by Manik

## Purpose

Wave 1 added zoom, pan, follow-playhead, and precise A/B controls. Wave 1B cleans up that interface and makes markers useful as loop-building landmarks rather than passive bookmarks.

## Shipped behavior

### Dedicated waveform toolbar

Zoom and pan remain attached to the waveform rather than occupying the Loop card:

- Zoom in/out
- Fit loop
- Show all
- Pan backward/forward
- Follow playhead
- Visible source-window time range

### Compact loop editor

A and B now each have a contained row with:

- exact timecode input;
- Playhead → A / Playhead → B;
- ±10 ms and ±100 ms nudging;
- current duration;
- Loop on/off and Clear in the card header.

Direct waveform behavior remains:

- drag empty waveform space to make an A–B region;
- drag A or B to refine it;
- drag markers to move them;
- double-click/tap empty waveform space to seek.

### Marker-driven loops

Every marker row now provides:

- click its time to seek;
- **Set A**;
- **Set B**;
- **Loop → next**;
- delete.

`Loop → next` copies the current marker into A and the next marker at a later timestamp into B, turns looping on, and seeks to A. Duplicate marker timestamps are skipped so a zero-length loop is never created. The last marker disables this action when no later marker exists.

Fast marker gestures:

- click marker: seek;
- Shift-click marker: Set A;
- Option/Alt-click marker: Set B.

These gestures work on marker rows and waveform marker lines.

Marker boundaries are copied into the loop. They are not permanently bound: moving or deleting a marker later does not silently rewrite an already-created loop.

When a chosen marker would cross the opposite existing boundary, the chosen marker remains exact and the incompatible opposite boundary is cleared. This supports the intended workflow: choose a marker as A, then choose any valid B afterward.

## Files changed

- `public/vilambit.html`
- `public/vilambit/vilambit.css`
- `public/vilambit/vilambit-app.js`
- `public/vilambit/vilambit-core.js`
- `smokes/vilambit-marker-loop.smoke.js` (new)

## Verification in the isolated workspace

```text
365 dependency-available checks passed
0 failed
34 focused Vilambit checks passed
0 failed
public/vilambit/vilambit-app.js passed node --check
public/vilambit/vilambit-core.js passed node --check
```

Eleven smoke modules require packages such as `jsdom` or SpessaSynth that were not available because dependency installation stalled in the isolated environment. The authoritative full gate remains:

```bash
npm run smoke
npm run build
```

## Browser acceptance checklist

1. Open a long recording and confirm the waveform toolbar remains above the waveform and does not crowd the Loop card.
2. Drag across the waveform and verify a new A–B selection appears.
3. Refine A/B with the time fields and ±10/±100 ms controls while looping.
4. Add three markers at different times and label them.
5. Click marker 1 → **Set A**, then marker 2 → **Set B**; verify the marker times are copied exactly.
6. Click marker 1 → **Loop → next**; verify A=marker 1, B=marker 2, the playhead seeks to A, and loop mode is on.
7. Use **Loop → next** on marker 2; verify it advances to marker 3.
8. Confirm the final marker’s **Loop → next** button is disabled.
9. Shift-click a marker time to set A; Option/Alt-click another to set B.
10. Repeat the modifier gestures on marker lines in the waveform.
11. Drag a marker after creating a loop and confirm the loop does not move with it.
12. Verify existing Sargam linked-loop, extraction, clip playback, and portable-project behavior still works.
