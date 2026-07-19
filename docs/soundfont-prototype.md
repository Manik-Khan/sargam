# Sampled harmonium prototype

## Purpose

The first Sargam SoundFont voice replaces the earlier saw-oscillator
“Harmonium-like” patch with a sampled harmonium played through SpessaSynth. The
notation scheduler remains responsible for note timing, duration, grace notes,
repeats, jumps, and meend.

## Current loading model

SpessaSynth 4.3.0 is installed as a pinned npm dependency and bundled by Vite.
Its matching AudioWorklet processor is committed at:

```text
public/vendor/spessasynth/spessasynth_processor.min.js
```

This is required because SpessaSynth's browser documentation instructs projects
to bundle the npm package and expose the matching processor as a same-origin
browser asset. Keep the npm package and processor file on the same version.

The harmonium SoundFont itself is still fetched only when the user chooses
**Sampled harmonium**:

```text
https://raw.githubusercontent.com/ledlaux/harmonium-companion/refs/heads/soundfont/harmonium.sf2
```

Until the SoundFont finishes loading, Current Pluck is used as a safe fallback.
The other melody voices, tabla assets, tanpura, notation editing, and printing do
not depend on that remote file.

## Why the SoundFont is not bundled yet

SpessaSynth is Apache-2.0 licensed. Harmonium Companion's repository is MIT
licensed, but the repository did not provide separate provenance for the
SoundFont binary when this prototype was prepared. Sargam therefore references
the existing file for auditioning instead of redistributing it.

Before an offline release:

1. Confirm that the SoundFont itself may be redistributed.
2. Store the approved SoundFont under `public/audio/harmonium/`.
3. Change `src/shell/soundfont.js` to the local SoundFont URL.
4. Include the engine, processor, and SoundFont in the future PWA cache.

## Controls

Shared controls are stored separately for each voice:

- touch/velocity
- brightness
- attack
- release
- room/reverb

The sampled harmonium additionally supports chorus, upper coupler, and
sub-octave.

The sine/ear-training voice additionally supports:

- register from one octave below through two octaves above the written pitch
- soft, bell, sustained, and short-pluck envelopes
- pure sine or rounded-triangle waveform

The sine voice defaults to one octave above the written pitch so it does not sit
like a bass drone. Settings are browser preferences and are not written into the
composition document.
