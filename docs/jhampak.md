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
The suffix `:1/2` makes one written cell half a beat. A single note, hold (`-`),
rest (`.`), bracketed group, or ornamented cell can carry it. At 60 BPM it lasts
half a second. Other cells remain one full beat: selecting a tala never silently
compresses written music.

This is a timing example, not a prescribed raga or melody:

```text
tal: jhampak
tempo: 60

S R | G m P | D N | S:1/2 R:1/2 S:1/2
S R | G m P | D N | S:1/2 R:1/2 S:1/2
```

Each line lasts 8½ seconds at 60 BPM. The next sam falls at 8½ seconds, then 17.
The ending starts at cycle positions 8, 8.5, and 9; the position is the onset,
not the cycle length. Sam follows the final half-beat at absolute position 9.5.
Fractional entry such as `@8.5` is accepted. Holds to a division (`_`) stop at
its exact boundary, including a remaining half-beat.

Both score and print show a **½** on a half-beat cell. Grid Write keeps `:1/2`
when its note changes; use an explicit `:1` to change that cell back to a full
beat. Subdivisions inside a half-beat cell divide its half beat equally.

Phrase repeats, line repeats, first/second endings, source anchors, local meter
clicks, and continuation count actual duration. Staff export represents the
cycle as 17/8 with integer MusicXML durations.

## Acceptance still needed

Listen to two repeated cycles and confirm the final Di–Di–Na spacing and next
sam. Confirm the provisional khali on 6 and inspect the ½ labels on screen and
in a printed composition. Automated structural checks do not replace this ear
and visual acceptance.
