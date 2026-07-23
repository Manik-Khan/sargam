# Bol Capture — real-time stroke entry

Bol Capture is a keyboard-first authoring mode for entering instrumental
strokes while keeping the written note line as the only rhythmic authority.
It stores the result as the same repairable score-side anchors used by the
annotation tools.

## Controls

- `↓`: da
- `↑`: ra
- `v`: diri across the current and next note attack
- `^` or `c`: chikari
- `←` / `→`: previous or next note attack
- `Backspace`: move back one attack and remove its bol
- `Delete`: remove the bol at the current attack
- `Esc`: leave Bol Capture

Start the mode with the text cursor on the music line. The highlighted score
attack is the Bol Capture cursor.

Held dashes, rests, matra spacing, subdivisions, and local meter remain owned
by the note line. The capture cursor visits struck notes only. A diri consumes
two consecutive attacks, regardless of their absolute speed. Pressing `-`
inside Bol Capture therefore does not create another meter lane or advance the
attack cursor; the existing note-line dash is preserved.

Entering a bol over an existing bol replaces the conflicting point or diri
span, so corrections do not stack duplicate marks.
