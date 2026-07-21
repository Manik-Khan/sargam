# Sargam — Vilambit Phase 3B Wave 1

**Built:** 2026-07-21
**Status:** assistant-implemented and automated-gate green; browser acceptance pending
**Baseline:** 431 passed, 0 failed; Vite 96 modules
**Current:** 448 passed, 0 failed; Vite 99 modules

## What this wave adds

### Local project folders

The toolbar now has a **Project** menu with:

- **New Project Folder…** — choose or create an empty folder; Sargam writes `composition.md`, `media.json`, and `clips/`.
- **Open Project Folder…** — opens an existing folder whose notation source is `composition.md`.
- **Save Project** — writes notation and media metadata back into the approved folder.
- **Clip Vault** — shows clip count, storage used, missing files, linked clips, and unused clips.

Sargam never receives unrestricted filesystem access. It works only inside the directory the user approves through the browser picker. Existing plain Markdown Open/Save remains available.

### Versioned media contracts

New pure engine modules define and smoke:

- source assets with stable `sourceAssetId` values;
- clip assets with source range, MIME type, byte count, and safe `clips/...` path;
- `media.json` v1 parsing, normalization, serialization, and missing-source narration;
- a project manifest contract for the later portable `.sargam` package;
- path traversal rejection.

Audio-link metadata remains `sargam-audio-links:v1` for compatibility, but each link now normalizes to:

- `sourceAssetId`;
- optional `clipAssetId`;
- `sourceRange` while retaining the accepted `startTime` / `endTime` aliases;
- separate practice speed and pitch settings.

Old Phase 3A links upgrade in memory and are migrated when rewritten; their notation endpoints and source times are preserved.

### Extract Clip

After attaching a loop and opening a project folder, the selected link offers **Extract Clip**.

- Vilambit exposes whether decoded audio is ready.
- The exact linked A–B range is trimmed locally at source speed and source pitch.
- Wave 1 uses Vilambit's existing PCM16 WAV encoder; the visible action and status say WAV rather than silently choosing a codec.
- The clip travels across the same-origin, versioned iframe bridge as a transferable `ArrayBuffer`.
- Sargam writes the Blob to `clips/clip-....wav`, updates `media.json`, attaches the `clipAssetId`, and saves `composition.md`.
- No binary data enters Markdown or JSON.

Direct extraction currently works when Vilambit has a decoded audio buffer. Audio files should work. Some large video containers whose audio track cannot be decoded by `decodeAudioData` are deliberately blocked with an honest message; the real-time media-element capture path remains the next extraction increment.

### Extracted-clip-first playback

**Play Linked** now follows:

1. included/local extracted clip;
2. matching original recording A–B range in Vilambit;
3. request to load the original recording.

The extracted clip can play even when the large source is absent. If the clip file is missing, Sargam marks it missing and falls back to the original source range. Deleting an unused clip does not alter any source timestamps.

## Browser acceptance checklist

1. Open the updated site in Chrome/Edge and confirm **Project ▾** appears.
2. Choose **New Project Folder…**, create an empty test folder, and confirm it contains:
   - `composition.md`
   - `media.json`
   - `clips/`
3. Load an audio recording in Vilambit and wait until **Extract Clip** becomes enabled.
4. Set A–B, select notation, and choose **Attach Loop**.
5. Choose **Extract Clip** and confirm:
   - a WAV appears in `clips/`;
   - `media.json` lists one source and one clip;
   - the linked status says `clip ready`;
   - reopening the project retains the link and clip.
6. Remove or unload the original recording, then choose **Play Linked**. The extracted clip should play directly.
7. Temporarily move the clip out of `clips/` and choose **Play Linked**. Sargam should narrate the missing clip and request/fall back to the original recording rather than binding another file.
8. Open **Clip Vault** and confirm linked/missing/unused counts are correct.
9. Remove the notation link. The clip should become **Unused**, not disappear automatically.
10. Choose **Delete Unused**. The clip file and manifest entry should be removed while the prior source A–B semantics remain unaffected.
11. Confirm ordinary Markdown Open/Save, Preview, Export, print, Diri, meter brackets, repeats, and playback cursor behavior are unchanged.

## Known boundaries

- `.sargam` ZIP-compatible import/export is not in Wave 1. It follows after this folder/clip contract is browser-accepted.
- Extracted WAV playback is direct source-speed playback. Loading the small clip into Vilambit for slowdown/transposition is a later bridge increment.
- Real-time extraction from non-decodable large video remains open.
- Browser directory access is not universal. Unsupported browsers retain plain Markdown workflows; the one-file `.sargam` fallback belongs to the portable-project wave.
- No cloud upload, accounts, comments, or collaboration were added.
