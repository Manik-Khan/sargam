# Vilambit integration and shared-player roadmap

## Current architecture

`public/vilambit.html` remains the stable iframe entry point used by Sargam.
The player is split into:

- `public/vilambit/vilambit-core.js` — pure transport, loop, marker, and waveform-window calculations;
- `public/vilambit/vilambit-app.js` — browser media, Web Audio, WASM, canvas, and interaction controller;
- `public/vilambit/vilambit.css` — player presentation;
- generated engines under `public/vilambit/vendor/`.

The iframe stays mounted at full size and is hidden with `visibility`, never
`display:none`, so audio and loop state survive tab changes. The seek-before-
first-play correction and the versioned, same-origin Sargam bridge remain
binding behavior.

## Completed integration waves

- split monolith into maintainable assets without changing playback;
- pure `VilambitCore` with direct smoke coverage;
- narrow postMessage bridge for source state, transport, loop restore, and clip extraction;
- notation-linked A–B ranges;
- extracted clips with source fallback;
- non-destructive clip-loop editor;
- portable `.sargam` projects containing notation, metadata, workspace, and clips;
- project-native per-source `workspace.json`;
- recording replacement without reloading the workspace;
- remote WAV byte-range overviews, waveform sidecars, and lazy host generation;
- non-destructive per-recording EQ with curated archive/community profiles;
- the approved Sargam Player Music surface.

## Source Workspace Wave 1 — precision source editing

Wave 1 adds a visible waveform window independent of the full recording:

- zoom in/out around the playhead or pointer;
- fit the current A–B loop;
- return to the complete recording;
- pan backward/forward or Shift+wheel;
- optional playhead-follow paging;
- waveform drawing, seeking, loop handles, markers, regions, and beat grid all map through the visible window;
- typed A/B timecodes (`seconds`, `m:ss.sss`, or `h:mm:ss.sss`);
- ±10 ms and ±100 ms loop-boundary nudges while playback continues;
- exact loop-duration readout;
- existing manual session files preserve the waveform view and loop-on state.

Decoded media is drawn directly from the source buffer at the current zoom, so
zooming reveals real detail rather than enlarging the old whole-file summary.
Large remote WAV files can use bounded byte-range sampling or precomputed
sidecars, while other streamed audio/video can refine a waveform during
playback.

## Completed Source Workspace Wave 2

The project now stores and restores, per stable `sourceAssetId`:

- position;
- loop and loop-on state;
- speed and pitch;
- markers and labels;
- BPM and speed regions;
- waveform view and follow preference;
- non-destructive EQ restoration.

This state travels automatically inside project folders and portable `.sargam`
packages. The standalone Save/Load session JSON remains a manual compatibility
path, not the primary project workflow.

## Current next phase — Library and Queue

Begin with a product mock and explicit distinction:

- **Library:** durable archive/catalog surface;
- **Queue:** temporary listening-session order;
- **Playlist:** durable named collection added later.

The left Sargam rail must not become a growing source list. Current recording
belongs to Music/File context; Queue may be a collapsible utility surface.

The first implementation should be a pure queue/session controller supporting
add-without-interrupting, reorder, remove, clear, next/previous, repeat track,
and repeat queue. Named playlists and Practice Sets should reuse this
foundation only after the queue interaction is accepted.

The LAN player should load stable record IDs rather than raw network paths,
preserve the active recording while tracks are queued, restore per-recording
workspace only after identity validation, and remain testable against Chrome
109 on the Windows 8.1 archive computer.
