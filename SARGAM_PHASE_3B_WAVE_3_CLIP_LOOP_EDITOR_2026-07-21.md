# Sargam — Phase 3B Wave 3

**Date:** 2026-07-21
**Wave:** Clip Waveform Editor and Seamless Loop Regions
**Baseline:** Phase 3B Wave 2 linked-clip transport and practice-routine foundation

## What this wave changes

Extracted clips are now first-class loopable practice assets rather than whole files restarted by an HTML media element.

### Decoded linked-clip transport

- `Play Linked` decodes the extracted clip with Web Audio.
- Playback uses the clip's saved in-file A–B region.
- A short configurable seam overlap replaces the rough HTML `<audio loop>` restart.
- Starting another Sargam or Vilambit transport still stops the linked clip.
- The complete recording never supersedes a valid extracted clip; it remains the source-context fallback.

### Clip Loop Editor

Open it from either:

```text
selected linked phrase → Edit Clip Loop
Project → Clip Vault → Edit Loop
```

The editor provides:

- a waveform with draggable A and B boundaries;
- precise ±10 ms and ±100 ms nudges for each endpoint;
- continuous loop preview;
- Reset to the extraction-time intended phrase;
- seam smoothing choices of Off, 5 ms, 12 ms, or 20 ms;
- automatic nearby zero-crossing adjustment when saving;
- `Open Source in Vilambit` for returning to the master recording when a linked clip needs more surrounding material.

The operation is non-destructive. The binary clip is not rewritten.

### Future extraction padding

New extractions include up to 400 ms of context before and after the original linked source range. The initial clip loop still matches the musician's original A–B selection.

```text
clip file:   [ context ][ intended linked phrase ][ context ]
loop region:             A ├───────────────┤ B
```

Older Wave 1 clips contain exactly the original extracted file. They can be shortened in the editor, but cannot be extended beyond audio that was never captured. Use `Open Source in Vilambit` and extract a new clip when more context is needed.

## Data contract

`composition.md` continues to preserve:

- notation anchors;
- `sourceAssetId`;
- `clipAssetId`;
- the original master-recording A–B timestamps;
- practice speed and pitch facts.

`media.json` now may add these clip fields:

```json
{
  "duration": 8.6,
  "loopStart": 0.4,
  "loopEnd": 8.2,
  "defaultLoopStart": 0.4,
  "defaultLoopEnd": 8.2,
  "paddingBefore": 0.4,
  "paddingAfter": 0.4,
  "crossfadeMs": 12,
  "loopUpdatedAt": "..."
}
```

The original source timestamps are never replaced by the refined in-clip boundaries.

## Verification performed in the isolated exact-source copy

```text
343 dependency-available smokes passed
0 failed
11 smoke modules skipped because npm dependencies were unavailable
```

Additional verification:

- all new pure clip-loop and project-media tests passed;
- decoded transport scheduling test passed;
- Wave 3 shell-wiring tests passed;
- `node --check` passed for all changed plain JavaScript;
- TypeScript JSX transpilation passed for App, PracticeBar, ClipVault, and ClipLoopEditor;
- all relative source imports resolve to files.

The package registry returned HTTP 503 throughout this wave, so the complete `npm run smoke` and Vite production build could not be executed in the isolated workspace. Run both in the actual clone before browser testing.

## Apply and gate

```bash
cd ~/Documents/GitHub/sargam

git apply --check ~/Downloads/sargam-phase-3b-wave-3-clip-loop-editor.patch
git apply ~/Downloads/sargam-phase-3b-wave-3-clip-loop-editor.patch

npm run smoke
npm run build
npm run dev
```

The patch expects Wave 2 to be present.

## Browser acceptance checklist

1. Open the existing project containing the already-extracted clip.
2. Select its linked notation phrase.
3. Choose **Edit Clip Loop**.
4. Confirm the waveform appears and **Play Loop** repeats continuously.
5. Drag A later to remove unwanted material at the beginning.
6. Drag B earlier to remove unwanted material at the end.
7. Verify ±10 ms and ±100 ms nudges work while listening.
8. Save, close the editor, and choose **Play Linked**.
9. Confirm the refined boundaries survive a hard refresh and project reopen.
10. Confirm `composition.md` still contains the original source A–B timestamps and `clipAssetId`.
11. Confirm `media.json` contains the refined loop values.
12. Extract a new phrase and confirm its clip contains editable context around the initial loop.
13. Start notation playback and Vilambit playback separately; each must stop the extracted clip.
14. Use **Open Source in Vilambit** and confirm Sargam restores the original master-recording range when that source is loaded.

## Deliberate boundaries

- The editor does not rewrite or destructively trim clip files.
- An old clip cannot be extended outside its binary duration.
- Waveform zoom is not in this wave; millisecond nudges provide precision.
- Practice Set UI remains a later wave, but it will consume these saved loop regions automatically.
