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
- speed regions;
- A–B looping and time markers;
- a low-memory waveform overview for PCM WAV recordings;
- a progressively refined waveform while streamed audio or video plays;
- custom video controls and a fullscreen practice drawer.

The archive profile hides Advanced tuning, automatic Beats & BPM, and processed
Export. These tools still belong to the shared player source, but they are not
shown when their decoded-audio input is unavailable.

For a remote WAV, the player uses a bounded number of byte-range requests to
sample an overview instead of downloading the recording. If a precomputed
waveform exists at `/sargam-waveforms/<media-path>.json`, the player uses that
more exact sidecar first. Other audio and video formats build a visible
waveform progressively during playback.

The optional class-audio waveform worker makes these sidecars lazily. When a
`/classaudio/` sidecar is missing, the player asks the host worker on port 8091
to scan that recording once. The first user can play immediately with the live
fallback; once the worker finishes, every user receives the small cached
overview. Source recordings remain untouched, and generated files live under:

```text
C:\website\sargam-waveforms\classaudio
```

The worker is intentionally limited to `/classaudio/` until the other archive
URL roots are identified and explicitly allowed.

## Archive and community EQ

EQ & Restoration is non-destructive and available in archive mode. Personal
adjustments stay with a recording's ordinary Sargam workspace. The archive can
also publish a curated list of recommended and community settings without
modifying the source recording.

Pass a same-origin profile manifest through `eqprofiles`:

```text
http://10.0.0.2/sargam-player/?src=%2Fclassaudio%2Fclass.wav&eqprofiles=%2Fsargam-eq%2Fclass.json
```

The JSON contract is:

```json
{
  "kind": "sargam-eq-profiles",
  "version": 1,
  "profiles": [
    {
      "id": "archive-restoration-1",
      "name": "Archive restoration",
      "author": "AACM archive",
      "status": "recommended",
      "notes": "Reduced tape rumble and hiss; preserved the sarod's upper partials.",
      "eq": {
        "enabled": true,
        "highPassHz": 45,
        "lowShelfDb": 1.5,
        "lowMidDb": -2,
        "presenceDb": 1,
        "lowPassHz": 11500,
        "outputDb": -1
      }
    }
  ]
}
```

`status` may be `recommended` or `community`. The player lists every published
profile but applies nothing until the listener chooses it. A listener can
download a candidate profile JSON from the player; an archive curator reviews
that file and adds accepted settings to the manifest. This keeps publication
deliberate on the LAN-only static archive while leaving room for authenticated
submissions and voting in a later server phase.

Video uses Sargam's own play, seek, volume, and fullscreen controls. The
fullscreen practice drawer keeps speed, pitch, looping, and markers available
without leaving the picture.

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
first. They also let Sargam Player sample a WAV overview without decoding the
complete file.

## Download deterrence

Archive video omits the browser's ordinary download, remote-playback,
picture-in-picture, and native speed controls, and suppresses the media context
menu. This removes casual download affordances; it is not DRM. A browser that
can play an unprotected URL can still be made to retrieve it. Real access
control requires the authenticated media gateway described for a later phase.

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
