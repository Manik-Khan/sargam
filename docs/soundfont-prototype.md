# Sampled harmonium prototype

## Purpose

The first Sargam SoundFont voice is an audition build. It replaces the earlier
saw-oscillator “Harmonium-like” patch with a sampled harmonium played through
SpessaSynth. The notation scheduler remains responsible for note timing,
duration, grace notes, repeats, jumps, and meend.

## Current loading model

The prototype loads these pinned HTTPS resources only when the user chooses
**Sampled harmonium**:

- `spessasynth_lib` 4.3.0 browser module
- the matching `spessasynth_processor.min.js` AudioWorklet
- `harmonium.sf2` from Harmonium Companion's `soundfont` branch

Until those resources finish loading, Current Pluck is used as a safe fallback.
The other melody voices, tabla assets, tanpura, notation editing, and printing do
not depend on these remote resources.

## Why it is not bundled yet

SpessaSynth is Apache-2.0 licensed. Harmonium Companion's repository is MIT
licensed, but the repository did not provide separate provenance for the
SoundFont binary when this prototype was prepared. Sargam therefore references
the existing file for auditioning instead of redistributing it.

Before an offline release:

1. Confirm that the SoundFont itself may be redistributed.
2. Install `spessasynth_lib` as a pinned project dependency.
3. Copy the matching worklet into `public/` during the build.
4. Store the approved SoundFont under `public/audio/harmonium/`.
5. Change `src/shell/soundfont.js` to local URLs.
6. Include the engine and SoundFont in the future PWA cache.

## Controls

Shared controls are stored separately for each voice:

- touch/velocity
- brightness
- attack
- release
- room/reverb

The sampled harmonium additionally supports chorus, upper coupler, and
sub-octave. Settings are browser preferences and are not written into the
composition document.
