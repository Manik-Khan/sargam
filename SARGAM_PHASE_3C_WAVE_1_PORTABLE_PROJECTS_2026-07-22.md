# Sargam — Phase 3C Wave 1

**Date:** 2026-07-22
**Wave:** Portable `.sargam` Projects
**Baseline:** Browser-accepted Phase 3B Wave 3 clip waveform editor and seamless loop regions

## What this wave adds

A complete Sargam project can now travel as one file:

```text
Raga-Bageshri.sargam
├── manifest.json
├── composition.md
├── media.json
└── clips/
    ├── clip-0001.wav
    └── clip-0002.webm
```

The user does not have to import notation, metadata, and audio separately. The package preserves:

- the exact editable notation text;
- notation-to-audio anchors;
- original master-recording A–B timestamps;
- extracted clip identities and binaries;
- refined in-clip loop boundaries and seam settings;
- source-asset metadata;
- safe future package files declared by later versions.

The original multi-gigabyte recording is not included and is not required for extracted-clip playback.

## Project menu

```text
Project ▾
├── New Project Folder…
├── Open Project Folder…
├── Save Project
├── Clip Vault
├── Open Portable Project…
└── Export Portable .sargam…
```

A `.sargam` file may also be dropped anywhere in the app.

## Export behavior

Export first saves the current `composition.md`, `media.json`, and project manifest. It then:

1. reads every clip named by `media.json`;
2. refuses to create a falsely self-contained package if a required clip is missing;
3. preserves safe future files from an imported package;
4. calculates byte counts and CRC-32 checksums;
5. writes one deterministic ZIP-compatible `.sargam` file.

The ZIP uses the **store** method rather than recompressing audio. Audio is already compressed in many cases, and WAV data should not be silently transcoded.

## Import behavior

Opening or dropping a package validates it before requesting filesystem access. Sargam checks:

- package and manifest versions;
- required `manifest.json`, `composition.md`, and `media.json` files;
- safe relative paths only;
- no `../`, absolute, backslash, control-character, case-colliding, or Unicode-colliding paths;
- no duplicate entries;
- file-count and expanded-size limits;
- supported ZIP method;
- central/local ZIP consistency, non-overlapping entries, and no trailing payload;
- CRC-32 for every file;
- manifest byte counts and checksums;
- presence of every clip referenced by `media.json`.

On desktop Chrome, import asks for an empty destination folder and writes an **independent copy**. The imported project receives a new project identity and records the source project as `originProjectId`. The notation text itself is not rewritten merely because the package was opened.

If directory access is unavailable, the package opens as a temporary in-memory project. Its clips, loop editor, Clip Vault, and portable re-export remain usable, but the interface warns the user to export a new `.sargam` copy before closing or refreshing.

## Local project manifest

Project folders now also contain:

```text
manifest.json
```

Legacy project folders without it continue to open. Sargam creates a compatible manifest in memory and writes it on the next project save. The manifest supplies stable project identity, portable-package provenance, and a safe inventory for future files.

## Safety and size limits

```text
250 MB  → user confirmation before reading/saving
1 GiB   → hard browser-memory safety limit
10,000  → maximum file count
10 MB   → maximum size for each required UTF-8 text file
```

These limits apply to the browser package operation, not to the external archival source recording.

## Verification performed against the exact uploaded Wave 3 source

```text
356 dependency-available checks passed
0 failed
11 smoke modules skipped because npm dependencies were unavailable
```

New focused coverage includes:

- one-file notation/media/clip reconstruction;
- refined loop-region preservation;
- deterministic ZIP output;
- standard `unzip -t` compatibility;
- CRC corruption, local-header mismatch, and trailing-payload rejection;
- traversal and case-collision rejection;
- missing-clip rejection;
- safe future-file preservation;
- independent-folder import;
- overwrite conflict refusal;
- no-directory temporary-project fallback;
- Project-menu and drag/drop shell wiring.

Additional verification:

- every changed plain JavaScript file passed `node --check`;
- every JSX file passed TypeScript JSX syntax transpilation;
- the generated sample `.sargam` passed the system `unzip -t` check.

The isolated container could not resolve `registry.npmjs.org`, so dependencies could not be restored for the complete JSDOM suite or Vite build. The actual clone must run the authoritative full gate.

## Apply and gate

```bash
cd ~/Documents/GitHub/sargam

git apply --check ~/Downloads/sargam-phase-3c-wave-1-portable-projects.patch
git apply ~/Downloads/sargam-phase-3c-wave-1-portable-projects.patch

npm run smoke
npm run build
npm run dev
```

## Browser acceptance checklist

1. Open the current project folder containing at least one extracted clip.
2. Confirm the linked clip and refined loop still play correctly.
3. Choose **Project → Export Portable .sargam…**.
4. Save the single `.sargam` file.
5. Keep the original project folder untouched.
6. Choose **Project → Open Portable Project…** and select the package.
7. Confirm the validation dialog reports the project name and included clip count.
8. Choose a new empty destination folder.
9. Confirm notation opens immediately as an independent project.
10. Without loading the original recording, play the linked phrase and confirm the included clip loops at its refined A–B boundaries.
11. Open **Edit Clip Loop**, adjust a boundary, save it, and export another `.sargam` copy.
12. Hard refresh, open the imported project folder, and confirm notation, clips, and refined loop values persist.
13. Drag the `.sargam` file onto Sargam and confirm the same validation dialog appears.
14. Attempt import into the original/nonempty project folder and confirm Sargam refuses to overwrite it.
15. Temporarily rename or remove a required clip from a project folder and confirm portable export stops rather than silently producing an incomplete package.

## Deliberate boundaries

- The package does not include the full archival source recording.
- ZIP deflate and ZIP64 are not accepted in package v1; Sargam's own packages use deterministic stored ZIP entries.
- Cloud publishing, public links, comments, permissions, and collaborative editing remain later phases.
- Practice Sets are not yet exposed in the UI, but their future records can travel inside this project format without changing the container model.
