# Sargam Tabla Prototype Library

This folder contains the uploaded `mmiron` Freesound tabla-bol samples prepared for browser playback in Sargam.

## Current musical status

Approved by Manik for the first prototype:

- `na-open`
- `ghe_7`
- `ghe_3`
- `ghe_4`
- `tun_3`

All remaining sounds are included as **audition candidates**, not as approved musical mappings.

## Folder structure

- `raw/` — untouched uploaded WAV files.
- `processed/` — browser-ready WAV copies.
- `samples.json` — source, processing, status, duration, and checksum metadata.
- `SOURCE_AND_LICENSE.md` — provenance and licensing notes.

## Processing applied

The processed copies remain mono, 44.1 kHz, 16-bit PCM WAV.

- Peak reduced to -6 dBFS for headroom when two samples are layered into a composite bol.
- No trimming.
- No pitch shifting.
- No denoising.
- No compression or limiting.
- An 8 ms fade is applied only at the very end of each file to prevent terminal clicks.

The original attack, duration, and natural decay are otherwise preserved.

## Integration guidance

Use `samples.json` rather than hard-coding filenames. Only samples marked `approved` should be active by default. Samples marked `audition` should remain behind a development/audition control until Manik approves their musical role.

