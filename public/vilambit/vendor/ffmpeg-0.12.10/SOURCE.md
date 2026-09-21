# Optional on-device decoder

Unmodified UMD artifacts from npm `@ffmpeg/core@0.12.10` (single-thread WebAssembly).
Copyright FFmpeg contributors, Jerome Wu, and the included libraries' contributors.
License: GPL-2.0-or-later; see COPYING. The published binary includes GPL components.

Package provenance: https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10
Tarball: https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz
npm SHA-512 integrity: sha512-dzNplnn2Nxle2c2i2rrDhqcB19q9cglCkWnoMTDN9Q9l3PvdjZWd1HfSPjCNWc/p8Q3CT+Es9fWOR0UhAeYQZA==

Upstream build scripts and source:
- https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10
- https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v0.12.10/Dockerfile
- https://github.com/FFmpeg/FFmpeg/tree/n5.1.4
- https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10/build

Dockerfile.upstream records the source repositories/revisions of FFmpeg and its
included codec libraries. Retrieve those sources and upstream build scripts to
rebuild using the single-thread FFMPEG_ST target. Distributors must preserve
these notices and provide corresponding source in accordance with COPYING.
The artifacts here have not been modified. Sargam's worker uses this binary only
for local audio probing and conversion to a temporary FLAC playback copy.
