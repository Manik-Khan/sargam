# Sargam release checklist

Run this short audit after a change to notation, playback, the editor, or printing.

## Automated gate

```bash
npm run verify
```

The command must end with every smoke check passing and a successful production build.

## Writing and score stability

- Open the Bageshri reference composition.
- In a line near the top, middle, and bottom, type notes, holds, `|`, and an ornament.
- Confirm the active score line remains at the same visual height while the notation reflows.
- Click a rendered matra and confirm its Markdown source line is selected and centered.
- Turn **Graph Grid** on. Confirm each matra has one cell, its tala-matra coordinate is visible, subdivisions stay inside the cell, and the selected cell remains highlighted after an edit.
- Switch to **Grid Write**. Change a note, enter a spaced subdivision such as `S R`, add a hold or rest, and append one matra. Confirm the Markdown-backed score and playback duration update immediately.
- Enter an invalid multi-matra draft such as `S/R`. Confirm the box reports the problem without changing the score, then press Escape to restore the source value.
- Switch between Text Write and Grid Write and reload once. Confirm the chosen writing surface persists and headings or attachment lines remain unchanged.
- Toggle the grid look between **Cells** and **Paper**. Confirm Paper continues each musical row through unused width with empty matra-sized boxes (no smaller background grid), the choice survives reload, and a kan such as `{m}g` remains legible.
- In Grid Write, click a bol attack slot inside a matra, add da/ra/diri/chikari, switch passes, and erase one mark. Confirm the ordinary editable `>` lane changes, the chosen bol appears in the matching rendered cell strip, Diri spans its exact attacks, and the capture cursor advances without changing the notes.
- On lines with delayed attacks or leading holds, confirm `0`, `1`, `2`, `3`, and `+` tala markers remain inset at the upper-left of their cells and never overlap a vibhag divider, repeat sign, octave dot, or ornament.
- Resize the score/editor divider and confirm neither surface jumps to another line.

## Playback

- Play from the beginning and from a clicked matra.
- Confirm melody, tanpura, and tala toggles work independently.
- Confirm editing stops stale playback instead of continuing against changed notation.
- Test line and section looping, then turn looping off.
- With playback following enabled, confirm only the score pane scrolls.

## Print and PDF

- Open **File → Print / PDF**.
- Check Clean, Matra cells, and Graph paper; Color and Printer B&W; and each typeface.
- Confirm Graph Paper is composed of real, equal matra cells plus real empty trailing cells; it must not be a repeating background image behind independently positioned notation.
- Confirm kan runs, approach slides, four-to-eight-slot matras, and phrase-repeat endings remain inside the cell that owns their matra. Dense subdivisions may wrap internally but must not claim a neighboring matra or touch the stronger vibhag boundary.
- Print a line beginning with `||:` and ending with `:||`. Each repeat sign must be a full-size structural marker centered across the cell boundary—not a child of the first or last note cell—including beside a dense phrase-repeat ending such as `(Dm g -)x3`.
- Print a line with attached bols and confirm each matra's bol strip shares the cell's internal attack subdivisions without covering its notes or crossing a cell boundary.
- Confirm graph-paper section descriptions and written cues have a light neutral backing that masks grid lines behind the text and remains legible in Printer B&W.
- Confirm a long composition uses every required page and no ornament or cell is cut at a page edge.
- Open and cancel the browser print dialog twice; the preview must remain unchanged.
- Close and reopen Export; the last-used page, typeface, grid, and ink choices must return.
- For a physical-printer check, verify mandra notes, tala markers, and held-beat dashes remain readable in grayscale.

## Files and restoration

- Save, close, and reopen the Markdown file.
- Confirm autosave restoration does not silently claim the file was saved.
- If a project folder is open, confirm its recording, A–B loop, markers, speed, pitch, and EQ restore only for the matching source identity.
- Export and re-import a `.sargam` project without overwriting the original project.

Record the date, browser, composition, check count, and any failure before release.
