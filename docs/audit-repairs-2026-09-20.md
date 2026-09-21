# September 20 audit repairs

Implemented in `/Users/khansolo/Documents/GitHub/sargam`, branch `main`, base
`c529fe5160d8`. The existing approved, uncommitted audio compatibility changes
were preserved. Manik authorized repairing the audited working tree. No commit,
push, or deployment was performed.

## Repaired

| Audit item | Result |
|---|---|
| A01: save completion replaces newer typing | Identity is installed at the save request, then completion marks only that written snapshot saved. Newer text remains intact and dirty. Logical save requests and underlying writes are serialized. Document-generation checks prevent a previous document's completion from taking over. Project creation and clip attachment also retain newer typing; clip saves include recording workspace state. |
| A06 / R03: workspace saves starve or overlap | A fixed 1.2-second checkpoint runs during continuous playback. Folder writes share the serial writer. Local recovery retains the latest pending settings and restores them only over the same project's matching folder base. Older failed writes cannot be retried over a newer success. |
| A02: Queue commits before load success | A matching request must become playable and acknowledge workspace restoration before Queue commits and Play is sent. Send failure, media error, or 30-second timeout preserves the earlier session. Late failed-request state cannot bypass this through current-source synchronization. Upcoming edits made during loading are retained. |
| A03: staff export ignores tala changes | MusicXML emits meter changes and splits measures at actual cycle boundaries, including free-time transitions. |
| A04: staff export omits Gat returns | Export consumes performed cells emitted by the playback scheduler, sharing repeat/ending/Gat traversal while preserving written grace notation. |
| A05: staff pickup loses sam alignment | Partial pickup measures retain `@N` alignment. The approved Jhampak example exports measure durations 6.5, 8.5, 2 beats, with the closing S starting the next measure at sam. |
| L01: Ashta Jhaptaal unrecognized | `Ashta Jhaptal`, `Ashta Jhaptaal`, and space/hyphen variants resolve to the existing 8.5-beat Jhampak definition. Existing document spelling and timing are preserved; khali at 6 remains provisional. |
| R01: native decoding can block fallback | Native preparation has a 15-second deadline. A media format failure aborts that work immediately and starts the on-device fallback; late native results cannot replace the active recording. |
| R02: compressed file size is not decoded memory | Bounded local header reads estimate duration, channels, and sample rate before optional full-buffer decoding. Unknown or oversized layouts stay streamed. The estimated float-PCM budget is 64 MiB, checked again at the AudioContext sample rate. |

The decoder still runs entirely on the user's computer. Header inspection and
conversion send no recording data to a decoding service. These changes do not
make damaged/protected media or every possible codec playable.

## Verification

`npm run verify`: **685 checks passed, 0 failed**, production build successful
(124 modules). `git diff --check` passed. Nineteen new audit regressions exercise
delayed saves, overlapping save requests, document switches, continuous-playback
checkpoints, recovery and stale-write failures, Queue errors/readiness/restore,
performed MusicXML structure, aliases, real M4A header parsing, stalled native
reads, and decoded-size rejection without a whole-file read. Existing real-WASM
AAC/ALAC tests remain green.

The tests use simulated browser/storage boundaries where indicated; they are
not evidence of audible output in Chrome/Safari or real shutdown acceptance.

## Still open

- Chrome/Safari acceptance of the actual failing M4A and successive audio/video
  replacement; cancellation, seeking, speed/pitch, and A–B loops. Verify decoder
  downloads and absence of recording uploads in the Network panel.
- Real folder saving while typing and closing/reopening during playback, including
  permission/storage failures and identity-matched restoration.
- Archive Queue acceptance with slow/broken URLs and rapid controls.
- Open mixed-tala/Gat/pickup MusicXML in a notation reader; inspect real print/PDF,
  keyboard navigation, and narrow/wide layouts using the release checklist.
- First-load profiling and bundle splitting remain performance work. The main
  bundle is 1,230.44 kB / 412.23 kB gzip; the large-chunk advisory remains. No
  measured speed claim or visual/accessibility sign-off is made.

Chrome computer-use permission was previously denied; this pass did not bypass
that restriction. The user's original failing M4A has not been supplied at an
accessible location for direct codec confirmation.
