# Sargam — Next Session Context & Handoff

**Updated:** 2026-07-21, after acceptance of Anchor Geometry and Vilambit Phase 3A  
**Next phase:** Vilambit Phase 3B — Local Project Folder, Clip Vault, and Portable Projects  
**Project:** Sargam notation editor/player + Vilambit transcription/practice player  
**Owner and musical authority:** Manik Khan  
**Assistant name:** Quill / Q  
**Supersedes:** `SARGAM_NEXT_SESSION_CONTEXT_2026-07-20_ANCHOR_GEOMETRY.md` and all older current-state paragraphs

## Phase 3B Wave 1 candidate now present

The current prepared source includes an assistant-built Wave 1 candidate at `448 passed, 0 failed` with a successful Vite build (`99 modules transformed`). It implements local project folders, versioned media contracts, explicit source/clip identities, decoded-loop WAV extraction, extracted-clip-first playback, and a Clip Vault. It is **not browser-accepted yet**. Run the checklist in `SARGAM_PHASE_3B_WAVE_1_2026-07-21.md` before treating these features as settled. Large videos whose audio cannot be decoded still require the later real-time capture path; portable `.sargam` archives remain the next wave after acceptance.

## 1. Read this first

The geometry stabilization phase is complete and accepted. Do not reopen it casually. The next task is to make linked Vilambit audio sustainable and portable without embedding large recordings in Markdown.

Read this file, then inspect the actual clone:

```text
~/Documents/GitHub/sargam
```

The clone is authoritative. Do not reconstruct source from this prose or from old patches.

---

## 2. Session-start gate

Start with:

```bash
cd ~/Documents/GitHub/sargam
git status --short
npm run smoke
npm run build
```

Known user-run checkpoint before Phase 3A:

```text
424 passed, 0 failed
vite build succeeded
94 modules transformed
```

The Phase 3A package was assistant-verified at:

```text
431 passed, 0 failed
vite build succeeded
96 modules transformed
```

Manik confirmed Phase 3A works in the browser. Record the actual current clone count before making new edits; do not assume `431` until the clone says so.

Also confirm all accepted changes are committed or at least present in `git status`. Several earlier patch attempts failed safely because their source context or paths did not match. Future work must be generated against an exact current snapshot.

---

## 3. Accepted and working — preserve these

### A. Anchor geometry and notation continuity

Manik explicitly confirmed these aspects are working:

- Diri persists and remains attached to two consecutive attacks.
- The Diri V is approximately half the earlier visual size and no longer dominates the notation.
- Meter annotations use an upside-down krintan-style bracket below the selected span.
- Meter brackets retain their width in Export and print/PDF.
- `{n~}D--{n~}D` keeps the rhythm of `D--D` and renders as two independent ordinary ornament arcs above the notes.
- Repeat signs are full-height, level with the notation, and outside the actual note grid; repeated and nonrepeated lines align without source indentation.
- Playback cursor updates no longer rebuild the score or rhythmically scroll the page downward.
- Preview, Export, and print behavior are accepted for this wave.

Preserve the architectural lesson: annotations must attach to exact musical/slot geometry, and cursor-only updates must not mutate layout.

### B. Vilambit Phase 2 bridge

Preserve:

- iframe always mounted;
- inactive view hidden with `visibility`, never `display:none`;
- `allow="autoplay"`;
- seek-before-first-play reconciliation;
- versioned, narrow postMessage contract;
- source-window and origin validation;
- compact Notation-side practice bar;
- Vilambit remains the recording engine.

### C. Vilambit Phase 3A linked loops

Browser-accepted workflow:

1. Load a recording in Vilambit.
2. Set an A–B loop.
3. Select notation in CodeMirror.
4. Attach the current loop.
5. A versioned `sargam-audio-links:v1` record stores notation anchors, recording identity, and A–B timestamps.
6. A subtle linked-audio marker appears in Preview, not Export/print.
7. Clicking restores the loop and seeks to A without forced autoplay.
8. **Play Linked** restores, seeks, and plays.
9. **Remove Link** removes the selected relationship.
10. Clean mode folds generated records; Structure mode exposes the exact Markdown.

Current limitation: the working UI still assumes one currently loaded source recording at a time. The metadata direction should now evolve toward explicit `sourceAssetId` and `clipAssetId` references.

---

## 4. Product decision: local-first projects

Sargam should use the user's existing filesystem rather than inventing mandatory cloud storage.

The browser cannot freely write anywhere. The intended interaction is:

```text
Choose Project Folder…
```

The user explicitly grants access to one project folder. Sargam reads and writes only within that approved area. A cloud-synced folder such as Dropbox or iCloud may work when it appears locally; the sync provider handles syncing, while Sargam uses the local files.

Where direct directory access is unavailable, provide an import/export compatibility path rather than weakening the full desktop workflow.

### Proposed project folder

```text
Raga Bageshri/
├── composition.md
├── media.json
└── clips/
    ├── clip-a1.opus
    ├── clip-a2.opus
    └── clip-a3.opus
```

The original 4 GB video may remain where it already lives. The project stores small extracted audio clips and source metadata, not a duplicate of the master unless the user explicitly chooses otherwise.

---

## 5. Media model to design before UI

Do not make filenames the identity model. Define versioned pure-data contracts first.

### Source asset

Represents the original audio/video recording:

```json
{
  "id": "source-...",
  "name": "concert-video.mp4",
  "size": 4294967296,
  "duration": 5400.0,
  "fingerprint": "...optional stable fingerprint..."
}
```

A live browser file/directory handle may be remembered locally, but it is a permission object and is not portable project JSON.

### Clip asset

Represents one small extracted audio file:

```json
{
  "id": "clip-...",
  "sourceAssetId": "source-...",
  "startTime": 418.24,
  "endTime": 426.81,
  "path": "clips/clip-....opus",
  "mimeType": "audio/webm;codecs=opus",
  "bytes": 123456,
  "createdAt": "..."
}
```

### Audio link

The notation relationship should retain both source timing and optional clip identity:

```json
{
  "id": "audio-link-...",
  "sourceAssetId": "source-...",
  "clipAssetId": "clip-...",
  "sourceRange": {
    "start": 418.24,
    "end": 426.81
  },
  "practice": {
    "speed": 75,
    "pitchSemitones": 0
  },
  "notationStart": {},
  "notationEnd": {}
}
```

Binding playback fallback:

```text
included/local extracted clip
→ loaded original source A–B range
→ Locate recording
```

Never silently attach to a different file with the same name.

---

## 6. Clip extraction strategy

The goal is to turn a loop from a 4 GB video into a small audio-only practice asset.

Two extraction paths may share one UI:

```text
Decoded audio buffer available
→ fast/offline slice and encode

Large video/media element
→ real-time capture of the selected A–B output
```

Canonical default:

- extract source-speed/source-pitch audio;
- store Vilambit practice settings separately;
- allow Vilambit to slow or transpose the small clip later.

A later optional mode may bake the current processed practice sound, but that should not replace the canonical source clip.

Do not hard-code one codec without checking browser support. Preserve the actual MIME type and extension produced.

---

## 7. Portable one-file project — binding requirement

The user must not have to import notation, JSON, and audio files separately.

Sargam should support one portable package, tentatively:

```text
Raga-Bageshri.sargam
```

It may be a ZIP-compatible container internally:

```text
Raga-Bageshri.sargam
├── manifest.json
├── composition.md
├── media.json
└── clips/
    ├── clip-a1.opus
    └── clip-a2.opus
```

Required experience:

```text
Open or drop one .sargam file
→ validate package version and paths
→ unpack into browser/project storage
→ immediately show editable notation
→ linked phrases immediately play included clips
→ user may save/export an independent copy
```

The archive should be safe and deterministic:

- reject path traversal such as `../`;
- validate manifest and schema versions;
- cap or warn about unexpectedly large packages;
- preserve unknown future metadata where safe;
- deduplicate clips by stable content identity where practical;
- do not rewrite notation merely because the package was opened.

A self-contained `.sargam` package is Phase 3C's first sharing mechanism and should not require accounts or Cloudinary.

---

## 8. Next phase: Vilambit Phase 3B

### Step 1 — Freeze exact source

- Run gate and record count.
- Inspect `audio-links` model, `PracticeBar`, Vilambit bridge, file storage code, and save/open flows.
- Commit or create a full exact-source checkpoint before a new wave.

### Step 2 — Pure project/media contracts

Add testable modules for:

- source asset normalization and identity;
- clip asset records;
- media manifest parse/serialize/migration;
- project manifest;
- audio-link upgrade from one-global-recording assumptions.

No UI first. Smokes first.

### Step 3 — Project Folder mode

Add:

```text
New Project Folder
Open Project Folder
Project Status
```

Write `composition.md`, `media.json`, and `clips/`. Preserve current plain Markdown save/open behavior where appropriate.

### Step 4 — Extract Current Loop

Add an action near the linked-loop controls:

```text
Extract Clip
```

- require a valid A–B loop;
- generate an audio-only Blob;
- save it into `clips/`;
- create/update clip metadata;
- attach `clipAssetId` to the notation link;
- never embed the Blob in Markdown.

### Step 5 — Clip playback

Clicking linked notation should prefer the extracted clip without requiring the 4 GB source to be loaded. Preserve source A–B fallback and reconnection.

### Step 6 — Clip Vault

Provide:

```text
Clip Vault
storage used
missing clips
unused clips
delete unused
relink source
export clips
```

Deleting a clip must not destroy the original source timestamps.

### Step 7 — Portable package

Implement one-file `.sargam` export/import after the project folder and clip manifest are stable.

---

## 9. Later phases

### Phase 3C — Portable project sharing

- export/import `.sargam`;
- independent copies/forks;
- optional package without large master source;
- optional static/read-only viewer.

### Phase 3D — Optional cloud publishing

Cloudinary or another media service may store extracted clips or project packages. Do not upload every multi-gigabyte original by default. Cloud storage must remain optional for local editing.

### Phase 4 — Collaboration

A separate application backend is required for:

- users and sign-in;
- project ownership;
- read/comment/edit permissions;
- comments anchored to notation and audio;
- suggested edits;
- revision history;
- notifications;
- forks and merges.

Cloudinary stores/delivers media; it does not replace this project/collaboration model.

---

## 10. Open product decisions — do not guess silently

Manik should approve these when implementation reaches them:

- final extension: `.sargam` versus `.sargam.zip`;
- whether opening a package imports into browser storage immediately or first asks for a destination folder;
- default clip codec/quality after browser capability checks;
- whether source clips or current processed practice clips are the default export;
- whether a project folder may optionally contain the original source recording;
- package overwrite/conflict behavior;
- how duplicate clip detection is surfaced;
- whether comments belong in the first cloud phase or only full collaboration.

Current recommended defaults:

- `.sargam` user-facing extension, ZIP-compatible internally;
- source-speed/source-pitch audio clip;
- original source remains external unless explicitly included;
- open package into a new independent project by default;
- ask before overwriting any existing project files.

---

## 11. Do not do next

- Do not embed audio or Base64 inside Markdown.
- Do not make Cloudinary mandatory for local work.
- Do not identify recordings by filename alone.
- Do not delete source timestamps when an extracted clip is deleted.
- Do not design the portable package as several files the user must import separately.
- Do not begin collaboration before local project and package contracts are stable.
- Do not reopen accepted Diri/meter/repeat geometry without a concrete regression.
- Do not generate patches against reconstructed source; inspect the exact clone.
- Do not commit or push on Manik's behalf.

---

## 12. Short handoff

Sargam now has accepted notation geometry and working Vilambit-linked notation loops. The next bottleneck is media scale: a 4 GB source should not need to remain loaded or be shared with every score. Build a local-first project system that extracts small A–B audio clips, stores them outside Markdown, references them by stable asset IDs, and plays them directly from linked notation. Once that local model is solid, package the entire editable/listenable project into one `.sargam` archive that a recipient can drop into the site and open immediately. Cloud publishing and collaborative comments come afterward.
