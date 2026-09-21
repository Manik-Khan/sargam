# Notation interaction and formatting repairs — 2026-09-20

Repository: `/Users/khansolo/Documents/GitHub/sargam`
Branch: `main`
Base HEAD: `18a3d876a656`
Original handoff status: local changes; no commit, push, or deployment by that repair pass.
September 21 update: these repairs are in commit `ca7629efd5f0`, and the subsequent
writing controls are in current matching main `5139fb4431a4`. Deployment is unverified.

## Implemented

- Markdown note clicks, rendered note/slot clicks, Grid Write focus/clicks, and Beginning use the same seek path. A paused player remains paused; a running player continues from the chosen position. Selecting text for editing and programmatic source reveals do not seek.
- Rendered subdivisions use exact parsed metric offsets. Source characters map to parsed attack identities rather than counting spaces. Vibhag holds, ornaments, phrase repeats, and Jhampak's implicit half-beat keep their parsed timing. A note inside a grace run selects its timed destination. Invalid or unsupported source mappings fail closed.
- A rendered attack reveals its note in Markdown instead of selecting the entire source line. Programmatic Grid Write focus does not rewind a subdivision selection to its cell boundary.
- Moving or pausing the notation transport cancels native instrument sources already scheduled in the old playback window, as well as soundfont voices and cursor callbacks.
- Preview width excludes its padding and uses the notation font's units. Graph-paper column counts respect content width without forcing a four-column minimum on narrow screens. Export leaves breathing room at the paper edge and retains the existing frozen print lifecycle.
- Graph rows grow for additional bol passes and lyrics. Lyrics reserve a lane above bols instead of sharing their lower position.
- Cross-cell diri spans include every physical column in expanded graph cells. After layout, preview and export align the span endpoints with the actual attacks, including unequal cell widths. Ornament anchors use the timed destination rather than the first grace glyph.

## Writing controls proposal — subsequently implemented

The interactive proposal keeps established syntax and adds no new notation language:

- Slide: `~(Gm)` for explicit scope.
- Krintan: `[[Gm]]`.
- Kan: `{G}m`, with m as destination.
- Bols: the existing `>` lane, independently assigned to timed notes.

The proposed controls show the selected notes, their beat duration, the resulting marking, and live shorthand. Kan makes the grace-note bol unavailable while retaining the destination's bol. Manik subsequently approved building these controls while preserving direct shorthand typing. They are now implemented in Text Write; see [the writing guide](notation-writing-controls.md). The conversation mock remains a demonstration only.

## Verification and acceptance

Repair-pass verification: **697 checks passed, 0 failed; production build passed**. The subsequent writing-control implementation passed **708 checks** and its build. The proposal's local interactions were also exercised with jsdom; all ornament/bol choices parsed successfully and preserved the example's three beats.

Remaining live browser checks:

1. With playback stopped, click G then m in `Gm` in Markdown and score. The position should differ by half a beat and remain silent. Repeat while playing; sound should move immediately.
2. Drag a source selection for an ornament. The selection must not keep scrubbing playback. Click the already-focused Grid Write cell and confirm it seeks again.
3. In Jhampak at 60 BPM, use `@3 ||: G - Gm | R- S | .N.D .N|S - :||`. The final S should select sam at 6.5 seconds from this line's beginning; the preceding cell lasts half a beat.
4. Compare Cells, Graph Paper, and all PDF grid styles at narrow and full widths. Check dense subdivisions, octave marks, repeated local approaches, nested krintans, lyrics plus several bol passes, and cross-cell diri marks.
5. Compare the export preview with Chrome's saved PDF over multiple pages. Font metrics, clipping, pagination, and audible output still need live acceptance; automated DOM tests do not establish pixel-perfect or audible correctness.

Known limits: a single ornament or protected phrase wider than the entire available system can still exceed that system; the planner intentionally does not split musical spans. Long grace runs and extreme-density cells need live visual review. These changes do not claim to finish every page-formatting issue.
