# Vilambit Phase 3A — linked notation loops

A linked loop connects one selected notation phrase to one A–B range in the
always-mounted Vilambit player.

## Source contract

Generated records are stored in a Markdown-safe block:

```text
<!-- sargam-audio-links:v1
{
  "version": 1,
  "links": []
}
-->
```

The block is written before `sargam-anchors:v1`, so the existing anchor block
remains the final generated structure. Clean mode folds both blocks; Structure
mode exposes both without altering the source.

Each link stores:

- a recording reference derived from name, media kind, and duration;
- exact A and B seconds;
- repairable notation start and end attacks using the anchor context model.

The recording bytes are never embedded in the Sargam document.

## Phase 3A workflow

1. Load a recording and set A–B in Vilambit.
2. Select one or more attacks on one notation line.
3. Press **Attach Loop** in the compact practice bar.
4. The linked phrase gains a subtle underline and music-note badge.
5. Click the phrase to load its loop and seek to A without autoplay.
6. Use **Play Linked** to load, seek, and play it.
7. Use **Remove Link** to delete the selected relationship.

A linked range only operates when the matching recording is loaded. Mismatches
are narrated rather than seeking the same timestamps in an unrelated file.

## Deliberate first-slice limits

- one notation source line per linked phrase;
- recording identity has no content hash yet because the iframe bridge does not
  expose file bytes;
- linked-loop indicators are Preview-only and never print;
- no previous/next linked phrase navigation yet.
