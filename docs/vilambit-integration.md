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
- portable `.sargam` projects containing notation, metadata, and clips.

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
Undecodable media still has timeline zoom/pan; persistent waveform peaks for
those large sources belong to Wave 3.

## Next shared Vilambit waves

### Wave 2 — project-native per-source workspace

Store and restore, per stable `sourceAssetId`:

- position;
- loop and loop-on state;
- speed and pitch;
- markers and labels;
- BPM and speed regions;
- waveform view and follow preference.

This state should travel automatically inside project folders and portable
`.sargam` packages. The standalone Save/Load session JSON remains a manual
compatibility path, not the primary project workflow.

### Wave 3 — sources and large-file optimization

- Sources panel with locate, reconnect, switch, and resume;
- strict source identity checks;
- cached multi-resolution waveform peaks for long MP4 and other undecodable media;
- release old object URLs, buffers, capture nodes, and media resources reliably;
- interrupted extraction and unsupported-codec messaging;
- remove obsolete duplicate source files.

## Shared core and standalone library player

After the source workspace is stable, extract reusable player/controller
surfaces so both shells use one implementation:

- **Sargam shell:** notation bridge, extraction, projects, and practice sets;
- **Standalone library shell:** URL/library-ID loading, queue, playlists, and FileMaker adapter.

The future LAN browser player should load stable record IDs rather than raw
network paths, preserve the active recording while tracks are queued, and
remain testable against the actual older Windows browser target.
