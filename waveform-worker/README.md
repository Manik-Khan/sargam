# Sargam Class-Audio Waveform Worker

This helper runs on the archive host, not on the Windows 8 library computers.
It creates a small waveform sidecar only when a user first opens a recording
under `/classaudio/`.

It never changes files inside `C:\website\classaudio`. Generated files go to:

```text
C:\website\sargam-waveforms\classaudio
```

The first user may briefly see the existing live waveform while the host
prepares the complete overview. Later users receive the cached overview
immediately.

## Required host software

- Node.js
- `ffmpeg.exe`
- `ffprobe.exe`

Place both FFmpeg executables directly inside:

```text
C:\SargamWaveformWorker
```

No software is installed on the user computers. FileMaker URLs remain
unchanged.

## First start

1. Extract this ZIP directly into `C:\SargamWaveformWorker`.
2. Confirm that `C:\website\classaudio` is the actual class-audio directory.
3. Place `ffmpeg.exe` and `ffprobe.exe` in the worker folder.
4. Run `OPEN-WINDOWS-FIREWALL-AS-ADMIN.cmd` as administrator once.
5. Run `START-SARGAM-WAVEFORM-WORKER.cmd`.
6. Run `CHECK-SARGAM-WAVEFORM-WORKER.cmd` in another window.

Keep the worker window open during the initial test. Once the host environment
is confirmed, it can be registered to start automatically with Windows.

## Configuration

`sargam-waveform-worker.config.json` starts with the confirmed archive values:

```text
class audio: C:\website\classaudio
waveforms:  C:\website\sargam-waveforms\classaudio
player:    http://10.0.0.2
worker:    port 8091
```

Only `/classaudio/` URLs are accepted. Path traversal, unsupported media types,
and browser origins outside the allowlist are rejected.

## Generated sidecars

The source:

```text
C:\website\classaudio\12345.mp4
```

creates:

```text
C:\website\sargam-waveforms\classaudio\12345.mp4.json
```

Each sidecar records the source size and modification date. If the source is
replaced, the worker rebuilds its waveform on the next request.
