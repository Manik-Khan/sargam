# Jhampak — 8½ beats

Manik confirmed this form on September 16, 2026:

| Division | Bols | Beats |
| --- | --- | --- |
| 1 | Dhi Na | 2 |
| 2 | Dhi Dhi Na | 3 |
| 3 | Tun Na | 2 |
| 4 | Di Di Na | 1½ |

The last three strokes each last half a beat. Khali on beat 6 is provisional,
following Manik's stated convention. The marker scheme follows the existing
Jhaptal convention. No new tabla sample-to-bol mapping has been approved;
Jhampak uses the existing tala click fallback.

## Writing and hearing a cycle

Choose **jhampak · 8½ beats** in New composition, or write `tal: jhampak`.
After eight full beats, the final cell is **automatically half a beat**. It is
labelled **½**, followed by **1 / sam**. This replaces the initial explicit-only
implementation, following Manik's correction and approval on September 16.

Manik's unchanged phrase now works directly:

```text
@3 ||: G - Gm | R- S | .N.D .N|S - :||
```

| Cycle position | 3 | 4 | 5 | 6 | 7 | 8 | ½ | 1 / sam | 2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Written cell | G | - | Gm | R- | S | .N.D | .N | S | - |
| Duration in beats | 1 | 1 | 1 | 1 | 1 | 1 | ½ | 1 | 1 |

`.N.D` supplies two equal half-beat notes within beat 8; the next `.N` supplies
the final half-beat. The following `S` is sam. At 60 BPM the repeated passage
lasts 17 seconds, with this S on sam at 6.5 and 15 seconds after starting at @3.

No `:1/2` suffix is needed for that final cell. The same default applies to
rests, sustains, bracketed groups, and ornaments in that position. Editing its
note in Grid Write preserves the automatic behavior without adding syntax.
Other talas retain their existing full-beat defaults.

Explicit `:1/2` remains available for a half-beat anywhere, and `:1` deliberately
overrides a cell to one full beat. Explicit durations survive canonicalization.
A pair of explicit half-cells within beat 8 is labelled **8** and **8+**; the
cycle's final half is **½**. Reader-facing labels never imply a ninth full beat.
The internal position 9 still denotes the onset of that final half for `@9`
and existing return-cue coordinates; it is a coordinate, not a displayed count.

Both score and print show **½** on a half-beat cell. The Graph Grid coordinate
includes its duration once, avoiding the old overlap between position and ½.

Phrase repeats, line repeats, first/second endings, source anchors, local meter
clicks, and continuation count actual duration. Staff export represents the
cycle as 17/8 with integer MusicXML durations.

## Acceptance still needed

Listen to two repeated cycles and confirm the final Di–Di–Na spacing and next
sam. Confirm the provisional khali on 6 and inspect the ½ labels on screen and
in a printed composition. Automated structural checks do not replace this ear
and visual acceptance.


As of the September 20 audit repair, `Ashta Jhaptal` and `Ashta Jhaptaal`
(including spacing/hyphen variants) are accepted aliases for this same approved
8½-beat definition. Existing `jhampak` documents and the spelling in authored
headers are preserved. This does not change the provisional khali convention.
