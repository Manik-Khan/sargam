# GeneralUser GS instrument bank

Sargam uses this local SoundFont through SpessaSynth for its sampled melody
voices. The notation scheduler supplies concert-pitch frequency; changing the
preset changes timbre only and never transposes the written notes.

Bundled prototype bank:

- File: `GeneralUser-GS-v1.471.sf2`
- SoundFont name: GeneralUser GS 1.471
- Author: S. Christian Collins
- Local source used for this checkpoint: npm package `generaluser@1.47.1`
- License: see `LICENSE-GeneralUser-GS.txt`

Selected General MIDI presets:

| Sargam voice | Program | SoundFont preset |
| --- | ---: | --- |
| Reed organ / harmonium | 20 | Reed Organ |
| Violin | 40 | Violin |
| Cello | 42 | Cello |
| English horn | 69 | English Horn |
| Sitar | 104 | Sitar |
| Shamisen | 106 | Shamisen |
| Koto | 107 | Koto |

The bank is deliberately stored under `public/` so Vite copies it unchanged
and the browser can load it from the same origin. A future checkpoint may
replace this file with a newer compatible GeneralUser GS bank after the voices
have been auditioned; the Sargam voice catalogue keeps that replacement
isolated from notation and scheduling code.
