# Vilambit Source Workspace

Wave 2 gives every recording in a Sargam project its own automatically saved
Vilambit state. The data lives in `workspace.json`; it is not stored in
notation Markdown, and it never contains browser file handles or audio bytes.

## Contract

```json
{
  "kind": "sargam-source-workspace",
  "version": 1,
  "sources": {
    "source-...": {
      "lastPosition": 3041.2,
      "loop": { "a": 3039, "b": 3046.8, "on": true },
      "tempoPercent": 75,
      "pitchSemitones": 0,
      "pitchCents": -8,
      "markers": [],
      "bpm": null,
      "speedRegions": [],
      "waveformView": {
        "start": 3025,
        "end": 3060,
        "followPlayhead": false
      }
    }
  }
}
```

The source key comes from the same stable identity rules as `media.json`:
kind, name, duration, size, and last-modified time (or an explicit source ID).
A filename match by itself is never enough to restore a workspace.

## Persistence behavior

- New projects create `workspace.json`.
- Existing projects without it open with an empty workspace.
- Player changes are captured per `sourceAssetId`.
- Folder writes are debounced while playback state is changing.
- A queued workspace write is flushed when the project changes.
- Reopening a project restores state only after the loaded source identity
  matches a saved entry.
- One atomic iframe command restores position, loop, tempo, pitch, markers,
  BPM, speed regions, waveform window, and follow preference together.
- Portable `.sargam` export/import includes and validates `workspace.json`.
- Missing source files do not remove their saved workspace entries.
- Safe unknown fields survive parse, save, import, and re-export.

## Browser acceptance

1. Open a project and load a recording in Vilambit.
2. Set a distinctive position, A/B loop, tempo, pitch, marker, waveform zoom,
   and Follow Playhead setting.
3. Wait about two seconds, then inspect the project folder for
   `workspace.json`.
4. Close and reopen the project while the same recording is loaded. Confirm
   that all settings return together.
5. Load a different file with the same filename but different size or
   last-modified time. Confirm that the first recording's workspace is not
   applied.
6. Export a `.sargam`, import it as an independent project, reconnect the
   matching source, and confirm that the workspace restores.
