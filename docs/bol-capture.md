# Bol Capture — real-time stroke entry

Bol Capture is a keyboard-first authoring mode for entering instrumental
strokes while keeping the written note line as the only rhythmic authority.
Its source of truth is the composition's ordinary, editable `>` bol attachment
line directly beneath the music phrase.

## Controls

- `↓`: da
- `↑`: ra
- `v`: diri across the current and next note attack
- `^` or `c`: chikari
- `←` / `→`: previous or next note attack
- `Backspace`: move back one attack and remove its bol
- `Delete`: remove the bol at the current attack
- `Esc`: leave capture and edit the `>` line normally

No text selection is required. Put the text cursor anywhere on a music line—or
on the blank or attachment line immediately beneath the phrase—then click
**Bol Capture**. Activation immediately creates the visible `>` lane, even
before the first stroke. Capture begins at the phrase's first struck note. The
highlighted score attack and the selection in the `>` lane are the two views of
the same Bol Capture cursor.

The Bol Capture keymap has higher priority than CodeMirror's ordinary cursor
navigation while the mode is active. Therefore `↑` and `↓` enter strokes
rather than moving between source lines. Outside Bol Capture they immediately
return to ordinary editor navigation.

Held dashes, rests, matra spacing, subdivisions, and local meter remain owned
by the note line. The capture cursor visits struck notes only. A diri consumes
two consecutive attacks, regardless of their absolute speed. Its source form
is `diri .`: the dot preserves the second covered attack. Pressing `-` inside
Bol Capture does not create another meter lane or advance the attack cursor.

Entering a bol over an existing bol replaces the conflicting point or diri
span. Left/right plus Delete can correct the lane without re-entering the rest
of the phrase.

Captured bols are not generated anchor metadata. `Esc` ends capture and leaves
the `>` line as normal composition text, so its words and `.` gaps can be
clicked, selected, and edited directly. Files made with the earlier hidden-bol
prototype are migrated when Bol Capture is activated: bol anchors for that
phrase are moved into the `>` line and removed from generated metadata.
