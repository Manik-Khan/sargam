# Sargam Player on the Windows 8 archive server

This folder is a static website. It does not install or run an application on
the server, and it does not require Node, npm, Vite, or FileMaker at runtime.
The existing HTTP server only needs to serve these files.

The browser executes Sargam Player on each user computer. Keeping one copy on
the server means every user receives the same current version without a local
installation.

## Place the bundle

Copy the **contents** of `dist-player` into the web root that already contains
the `classaudio` folder. The resulting server layout should be:

```text
WEB ROOT
├── classaudio/
│   └── 10-25-1983_BF_F_1_D1_T1.wav
├── sargam-player/
│   └── index.html
├── vilambit/
│   ├── vendor/
│   ├── vilambit-app.js
│   ├── vilambit-core.js
│   ├── vilambit-remote-waveform.js
│   └── vilambit.css
├── vilambit.html
└── sargam-player-manifest.json
```

The `vilambit` folder name is intentionally retained for internal asset and
saved-project compatibility. The visible product is **Sargam Player**.

## Test URL

From a user computer on the same network, open:

```text
http://10.0.0.2/sargam-player/?src=%2Fclassaudio%2F10-25-1983_BF_F_1_D1_T1.wav
```

The browser should show **engine: archive streaming** before playback. Press
Play and test the waveform, seeking, speed, A–B looping, and volume. For video,
also test the fullscreen button and its collapsible Practice panel.

An optional friendly display name can be included:

```text
http://10.0.0.2/sargam-player/?src=%2Fclassaudio%2F10-25-1983_BF_F_1_D1_T1.wav&name=Class%2010-25-1983
```

## Creating links

The player accepts a same-server path in the `src` query parameter:

```text
http://10.0.0.2/sargam-player/?src=ENCODED_AUDIO_PATH
```

For example, the audio path:

```text
/classaudio/10-25-1983_BF_F_1_D1_T1.wav
```

becomes:

```text
%2Fclassaudio%2F10-25-1983_BF_F_1_D1_T1.wav
```

FileMaker may continue to launch the completed player URL with its normal Open
URL script step. Playback itself happens in the external browser.

## HTTP requirements

The player and recordings should both use `http://10.0.0.2`. The audio server
should provide:

- the correct audio `Content-Type`, such as `audio/wav`;
- `Content-Length`;
- `Accept-Ranges: bytes`;
- `206 Partial Content` responses to byte-range requests.

Range support is what allows a browser to jump through a long recording
without downloading the entire WAV first. Sargam Player also uses small range
requests to create a PCM WAV overview without placing the full recording in
the user computer's memory.

The player first looks for an optional exact waveform sidecar beneath
`/sargam-waveforms/`. No sidecars are required: WAV recordings fall back to a
range-sampled overview, while other audio and video formats build their
waveform as they play.

## Updating

Build a fresh bundle on the development Mac:

```bash
npm run build:player-server
```

Replace the server's `sargam-player`, `vilambit`, and `vilambit.html` with the
new bundle contents. Audio files in `classaudio` are separate and should not be
replaced or moved during a player update.

If a user computer still displays an earlier version after an update, reload
the page while holding Shift to bypass the browser cache.

## Compatibility target

The bundle targets Chrome 109 on Windows 8.1. Plain private-network HTTP cannot
use every secure-context audio feature, so the player automatically uses its
compatibility engine. The archive URL mode streams instead of decoding the
complete file into the computer's 4 GB memory.

The archive profile intentionally hides Advanced tuning, Beats & BPM, and
processed Export. It retains playback, pitch, speed, speed regions, loops,
markers, waveforms, and fullscreen video practice controls.

The custom video controls remove the ordinary Chrome download entry points as
a practical deterrent, not as guaranteed media protection. The underlying
archive should remain LAN-only until authenticated streaming is added.

Keep this service restricted to the private network. Use HTTPS and access
controls before exposing it outside the LAN.
