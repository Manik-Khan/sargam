# On-device audio compatibility

## User-approved behavior

Try the browser's normal playback first. If the media element reports a local
format/decoding error, automatically prepare an audio playback copy on the
user's device. Show progress and Cancel. Never upload the recording for decoding.
The original remains untouched. Users need no installed app, extension, or FFmpeg.

## Execution and privacy

- `audio-compat.js` is the small controller. Only a failed local recording starts
  `audio-compat-worker.js` and downloads the optional, same-origin decoder assets.
- A selected File is structured-cloned to the browser worker. WORKERFS reads file
  slices on demand; it does not upload or copy the whole input into WASM memory.
- The worker runs the bundled, pinned single-thread `@ffmpeg/core@0.12.10` entirely
  on the device. Both probing and conversion permit only the `file` protocol in
  FFmpeg's virtual filesystem. There is no conversion service, upload endpoint,
  third-party CDN request, or account requirement.
- The output is a temporary FLAC Blob. The media element plays its object URL;
  the source filename, size, modification time, stable ID and original file URL
  remain unchanged. No derived file is silently saved to disk or substituted for
  the original source identity.
- Cancel, replacement, timeout, failure and completion terminate the worker.
  Replacing a source revokes its temporary object URL. Refreshing closes the
  session; a later opening may need preparation again. Browser caching may retain
  decoder software, not the selected recording.

## Scope and limits

This first implementation prepares **local audio** only. Existing supported
video and archive-URL streaming remain native. A fallback candidate containing
actual video is rejected rather than silently stripping its picture. Embedded
album artwork does not count as video. Damaged, protected and unsupported inputs
can still fail; no universal format guarantee is made.

Limits apply to fallback, not ordinary native streaming:

| Limit | Value |
|---|---|
| Input size | 256 MiB |
| Prepared output | Below 128 MiB |
| Recording duration | Up to two hours |
| Preparation time, including decoder loading | Three minutes |
| Sample rate / channels | Up to 192 kHz / 8 channels |
| Full waveform decode of prepared output | Estimated float PCM up to 64 MiB |

The decoder converts incrementally to compressed FLAC; it does not expand an
entire long recording into a PCM buffer. The output cap and duration comparison
reject partial results. Large/noisy recordings may hit the output cap before the
duration limit. Do not promise that every two-hour file will fit. A compatible
copy or a browser supporting the original remains the recovery path.

Ordinary local files over 32 MiB now skip optional full-buffer waveform decoding
and retain streaming playback/live waveform capture. They do not expose the
buffer-only tuning/processed-export tools. Smaller files first receive bounded local header inspection (WAV, FLAC, AIFF,
MPEG audio, Ogg audio, and ordinary MP4/M4A layouts). Full-buffer decoding runs
only when readable metadata estimates float PCM at or below 64 MiB, including
the AudioContext sample rate. Unknown or oversized layouts remain streamed.
Native preparation has a 15-second deadline; a native media format error aborts
it immediately so it cannot block fallback. Header inspection does not load the
optional FFmpeg decoder or upload any recording data. Small prepared copies regain decoded waveform,
full-quality stretch and extraction; large prepared copies use streamed controls.

## Hosting

The production build and standalone player bundle include these assets:

- `vilambit/audio-metadata.js`
- `vilambit/audio-compat.js`
- `vilambit/audio-compat-worker.js`
- `vilambit/vendor/ffmpeg-0.12.10/ffmpeg-core.js`
- `vilambit/vendor/ffmpeg-0.12.10/ffmpeg-core.wasm` (about 32 MB, fetched on demand)
- decoder COPYING, SOURCE.md and upstream build-source details

Serve JavaScript as JavaScript and `.wasm` as `application/wasm`, including on
IIS. Host these files alongside the player; do not point the worker at a CDN.
A restrictive Content Security Policy must allow this same-origin worker and
WebAssembly compilation. Single-thread operation does not require cross-origin
isolation headers or SharedArrayBuffer. A static HTTP(S) host is sufficient;
opening the HTML from `file://` may prevent worker/asset loading.

The bundled decoder is GPL-2.0-or-later. Its notices and upstream source/build
references are shipped beside it; preserve corresponding-source availability
when distributing the decoder. See `public/vilambit/vendor/ffmpeg-0.12.10/SOURCE.md`.

## Verification

Nine compatibility smokes include real bundled-WASM ALAC/AAC decoding through
WORKERFS, ALAC PCM integrity via the FLAC MD5, damaged input, metadata/output
limits, cancellation/timeout, native-playback bypass, no upload code, and
source-identity/marker/loop preservation across conversion and replacement.
The fixtures are generated tones, not user or archive recordings.

Checkpoint: 666 checks passed, production build succeeded. Live browser testing
remains required: Chrome access was previously not approved for this task.
Open an ALAC M4A which Chrome rejects, confirm progress then audible playback,
seek and loop, cancel another preparation, replace a recording while preparing,
and verify Safari/native AAC bypasses the worker. Verify the browser Network
panel shows only decoder asset downloads and **no recording upload**. Test the
user's original failing M4A once its location is available.
