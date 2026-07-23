# Sargam — Vilambit Source Workspace Wave 1

**Wave:** Precision source waveform and A–B controls
**Baseline:** User-supplied post–Phase 3C repository
**Browser acceptance required:** Yes

## Implemented

### Zoomable waveform window

- **Zoom + / Zoom −** around the playhead.
- **Fit A–B** with useful context around the loop.
- **Show all** restores the complete recording.
- **Pan** backward/forward by half the visible window.
- Ctrl/Cmd+wheel zooms around the pointer.
- Shift+wheel pans.
- The visible start, end, and duration are shown above the waveform.

All waveform interactions use the visible time window, not the full-file
coordinate system: selection, double-click seek, A/B handles, markers, speed
regions, beat grid, played waveform, and playhead.

### Playhead follow

**Follow playhead** keeps the current position inside a safe central portion of
the zoomed window. It moves the window in pages rather than rebuilding it every
animation frame. This keeps the cached waveform stable and avoids rhythmic
scrolling/layout churn.

### Precision A–B editing

- Time fields accept `42.5`, `42:17.500`, or `1:02:03.250`.
- Each boundary has ±10 ms and ±100 ms controls.
- Boundaries cannot cross; a 10 ms minimum gap is preserved where possible.
- Changes apply immediately to the active Vilambit loop engine.
- Loop duration is displayed down to milliseconds.
- Manual Vilambit session JSON now preserves loop-on state and waveform view.

### Rendering detail

When the source decodes to an AudioBuffer, the waveform is sampled directly
from the currently visible range. Zooming therefore reveals actual local
shape rather than magnifying a low-resolution whole-file image.

## Browser checklist

1. Load the same long recording used for Phase 3B acceptance.
2. Create and enable an A–B loop.
3. Click **Fit A–B** and verify the phrase fills most of the waveform with
   context on both sides.
4. Drag A and B while it loops; verify playback updates without stopping.
5. Use each ±10 ms and ±100 ms button and listen for precise boundary changes.
6. Type a timecode into A or B and press Enter.
7. Verify an invalid time such as `1:75` is visibly rejected.
8. Use Zoom +, Zoom −, Pan, and Show all.
9. Turn on Follow playhead in a zoomed view and play through the visible edge.
10. Verify double-click seek and marker dragging still land at the correct
    times while zoomed.
11. Return to Notation and confirm Attach Loop, Play Linked, Extract Clip, and
    clip-loop editing still work.
12. Save and reload a standalone Vilambit session JSON; confirm loop points,
    loop-on state, and waveform view return.

## Known boundary

For a video whose audio track cannot be decoded by Web Audio, the time-window
controls still work, but the waveform may remain a center line. Cached peaks
from streamed/large media are intentionally Wave 3; this wave does not pretend
to synthesize waveform data it does not have.

## Verification in the isolated workspace

- Changed plain JavaScript passes `node --check`.
- 362 dependency-available smoke checks pass, 0 fail.
- Six new focused checks cover waveform windows, follow behavior, precise
  timecode/boundary logic, and required UI wiring.
- The full npm gate could not run because the package mirror returned HTTP 503
  while restoring dependencies. Run `npm run smoke` and `npm run build` in the
  actual clone; those results are authoritative.
