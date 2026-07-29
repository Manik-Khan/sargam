# Sargam Player archive route

Sargam Player has a lightweight browser route for opening recordings directly
from the class-audio server:

```text
http://10.0.0.2/sargam-player/?src=%2Fclassaudio%2F10-25-1983_BF_F_1_D1_T1.wav
```

The `src` value may be either an absolute same-origin URL or a path beginning
with `/`. An optional `name` parameter supplies a friendlier display name:

```text
http://10.0.0.2/sargam-player/?src=%2Fclassaudio%2F10-25-1983_BF_F_1_D1_T1.wav&name=10-25-1983
```

The older `/vilambit.html` route remains as a compatibility redirect. It
preserves the query string and hash, so saved links continue to open in Sargam
Player.

## Archive mode

URL sources use streaming mode. The player assigns the server URL directly to
the browser media element instead of downloading and decoding the complete WAV
into memory. This is the safe default for the Windows 8.1 archive computer with
4 GB RAM and for long class recordings.

Archive mode retains the controls that the browser can provide reliably:

- play, pause, seek, and volume;
- speed control;
- pitch control when the browser's compatibility engine supports it;
- A–B looping and time markers.

Features that require a complete decoded audio buffer, such as full-file
waveform analysis or lossless processed export, remain available when a local
file is opened on a capable computer.

## Server requirements

The player page and recording should come from the same origin. For example,
both should be served by `http://10.0.0.2`; the player rejects cross-origin
archive URLs rather than depending on an unknown CORS policy.

The `/classaudio/` server should return:

- a correct audio `Content-Type`, such as `audio/wav`;
- `Content-Length`;
- `Accept-Ranges: bytes`;
- `206 Partial Content` for byte-range requests.

Byte ranges let the browser seek without downloading the entire recording
first.

## Browser target

The compatibility target is Chrome 109 on Windows 8.1. Because the archive is
served over plain private-LAN HTTP, secure-context-only processing such as
AudioWorklet is not assumed. Sargam Player automatically falls back to its
media-element compatibility path.

The archive player should remain LAN-only. If it is ever exposed beyond the
private network, put it behind HTTPS and normal access controls first.

## Naming and compatibility

The visible product is now **Sargam Player**, paired with **Sargam Notation**
under the broader **Sargam** system. Existing internal project fields, bridge
messages, and asset directory names that contain `vilambit` remain unchanged
for data and integration compatibility.
