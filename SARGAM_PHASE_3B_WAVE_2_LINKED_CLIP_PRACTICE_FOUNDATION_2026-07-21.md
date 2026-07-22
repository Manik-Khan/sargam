# Sargam — Vilambit Phase 3B Wave 2

**Wave:** Linked Clip Transport + Practice Routine Foundation
**Built:** 2026-07-21
**Baseline required:** Phase 3B Wave 1 plus the MP4 real-time extraction fix

## Browser behavior added

- A saved extracted clip now loops continuously rather than stopping after one pass.
- **Play Linked** becomes **Stop Linked** for the active linked phrase.
- The linked status distinguishes `clip looping` from `source looping`.
- One musical transport owns playback at a time:
  - starting notation playback stops linked clip/source playback;
  - starting another linked phrase stops the previous one;
  - pressing Play in Vilambit stops an extracted clip;
  - Stop, project/document changes, or removing the active link stop linked playback.
- Clip playback still has priority over the full source recording. Reloading the MP4 does not supersede a valid saved clip.

## Practice routine foundation

`src/engine/practice-sets.js` introduces a pure versioned v1 contract for future user-built and teacher-authored practice routines.

A practice step names an `audioLinkId` and may target either:

- a repetition count; or
- a number of minutes.

Each step can also specify:

- starting and ending speed percentages;
- speed step size;
- how many repetitions occur before each speed change;
- rest time between passes.

The planner calculates real playback duration at each speed and produces a queue suitable for a later session controller. Sequence mode is planned now. Shuffle remains explicitly deferred to the playback layer so seeded/random behavior is not silently invented in the data model.

No Practice Set builder UI or persistence file is added in this wave. The purpose is to make the linked clip transport queue-ready before building that interface.

## Browser acceptance checklist

1. Open a project containing a saved linked clip.
2. Choose **Play Linked** and allow it to pass its end boundary at least twice.
3. Confirm the button reads **Stop Linked** and the status says `clip looping`.
4. Choose **Stop Linked** and confirm playback stops immediately.
5. Start the clip again, then start notation playback; confirm the clip stops.
6. Start the clip again, then press Play in Vilambit; confirm the clip stops and Vilambit owns playback.
7. Play a second linked phrase while the first loops; confirm only the second remains audible.
8. Reload the full source MP4 and choose **Play Linked**; confirm the saved clip still has priority.
9. Test a link without a clip; confirm its source A–B range loops and **Stop Linked** pauses it.
10. Confirm Extract Clip, project save/open, hard-refresh clip playback, Preview, Export, and notation playback still work.

## Next implementation wave

After browser acceptance, build the Practice Set UI and decide the persistent project shape. Recommended direction:

```text
Project/
├── composition.md
├── media.json
├── practice.json
└── clips/
```

That decision should be made alongside the portable `.sargam` package contract so routines, notation, links, and clips travel together.
