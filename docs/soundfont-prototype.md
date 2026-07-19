# Pitch-locked sampled instrument bank

## Binding rule

Changing the melody instrument changes timbre only. It must never transpose the
composition. Every engine receives the same concert-pitch frequency emitted by
the notation scheduler.

Examples:

- `Sa A` remains A in Current Pluck, Neutral Tone, violin, cello, English horn,
  reed organ, sitar, shamisen, and koto.
- Neutral Tone has envelope and waveform controls but no octave/register
  selector.
- The reed-organ coupler and sub-octave switches add optional layers while the
  written fundamental remains present.

## Architecture

Two lightweight voices remain native to Sargam:

- Current Pluck: deterministic Karplus-Strong physical model.
- Neutral Tone: sine or rounded-triangle oscillator with selectable envelope.

All sampled voices use one local GeneralUser GS SoundFont through SpessaSynth:

- Reed organ / harmonium
- Violin
- Cello
- English horn
- Sitar
- Shamisen
- Koto

The SoundFont and AudioWorklet processor are stored under `public/`, so the
sampled voices no longer depend on a runtime CDN request. The later PWA phase
can cache the same files for reliable offline startup.

## Pitch mapping

`frequencyToMidi()` converts the scheduler frequency into the nearest MIDI note
and the fractional remainder into pitch bend. The adapter uses a 12-semitone
bend range so meend can begin from `glideFrom` and settle on the exact target.
There are no preset-specific transpose constants.

## Tone controls

Each voice has independent remembered settings:

- Touch/velocity
- Brightness
- Attack
- Release
- Room/reverb
- Chorus for sampled voices

Neutral Tone additionally offers envelope and waveform. Reed organ additionally
offers additive upper-coupler and sub-octave layers.

## Bundled bank

This checkpoint carries GeneralUser GS 1.471 from the npm package
`generaluser@1.47.1`, together with its license text. The code isolates the bank
URL and preset catalogue so a newer compatible GeneralUser release can replace
it later without touching notation syntax, playback scheduling, or saved
compositions.
