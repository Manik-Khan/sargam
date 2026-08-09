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
- Confirm the active score line—or selected Grid Write matra—remains at the same visual height while typing, deleting, and changing a matra causes the notation to reflow.
- Click a rendered matra and confirm its Markdown source line is selected and centered.
- Turn **Graph Grid** on. Confirm each matra has one cell, its tala-matra coordinate is visible, subdivisions stay inside the cell, and the selected cell remains highlighted after an edit.
- Switch to **Grid Write**. Change a note, enter a spaced subdivision such as `S R`, add a hold or rest, and append one matra. Confirm the Markdown-backed score and playback duration update immediately.
- While Grid Write is showing the beginning of a long composition, click a matra on a much later rendered score line. Confirm the matching source line and exact matra are centered and focused in the editor. Then click an early score matra and confirm the editor returns to it.
- Enter an invalid multi-matra draft such as `S/R`. Confirm the box reports the problem without changing the score, then press Escape to restore the source value.
- On a late line, switch between Text Write and Grid Write several times. Confirm the same musical line remains visible and Grid Write retains the exact matra when possible; neither mode may return to the top. Use **Beginning** and confirm that it intentionally selects the first notation line.
- Toggle **Writing focus**. Confirm secondary annotation tools hide, score/editor margins contract, both writing surfaces remain usable, and **Show tools** restores the controls without losing position.
- Toggle the grid look between **Cells** and **Paper**. Confirm Paper continues each musical row through unused width with empty matra-sized boxes (no smaller background grid), the choice survives reload, and a kan such as `{m}g` remains legible.
- In Grid Write, click the `+` beneath a note attack near the left, right, and bottom edges. Confirm the complete floating da/ra/diri/chikari/remove menu remains inside the viewport and above pane boundaries. Choose one bol and verify the menu closes, the ordinary editable `>` lane changes, and the bol appears in the matching rendered cell strip. Reopen that note's symbol and remove it. Diri must remain under that one note without consuming or shifting its neighbor.
- On a line with attached bols, use **Copy bols** and confirm all of that line's editable bol lanes are copied in source order without including the following music line.
- Write `SSSS` in one matra, attach Diri to all four notes, and play it at 60 BPM. Confirm four legible `V` marks remain inside the cell and eight evenly spaced strikes sound within that one-second matra.
- Open a document containing older score-side bol marks and switch to Grid Write. Confirm they become editable `>` lanes automatically, disappear from the detached annotation overlay, and retain their note alignment. A structurally complete older two-attack Diri lane must not shift the bols that follow it.
- On lines with delayed attacks or leading holds, confirm `0`, `1`, `2`, `3`, and `+` tala markers remain inset at the upper-left of their cells and never overlap a vibhag divider, repeat sign, octave dot, or ornament.
- Resize the score/editor divider and confirm neither surface jumps to another line.

## Playback

- Play from the beginning and from a clicked matra.
- Confirm melody, tanpura, and tala toggles work independently.
- Confirm editing stops stale playback instead of continuing against changed notation.
- Test line and section looping, then turn looping off.
- Write a repeated common phrase with `|1` before its first ending and place the second ending on the following notation line. Confirm **1st time** and **2nd time** brackets begin at one aligned divergence after the shared cells, the first ending's `:||` remains a separate structural position, and playback performs common + first ending, then common + second ending without duplicating the common phrase in source.
- In Grid Write, use **Add 1st ending** on a repeated line. Confirm placement mode offers **Start here** on every valid boundary, choosing the first changed matra adds the same `|1` source marker, and the first and following rows are visibly labelled **1st ending** and **2nd ending**. Move the boundary, then remove it, and confirm both Text Write and the rendered score update immediately.
- With playback following enabled, confirm only the score pane scrolls.

## Print and PDF

- Open **File → Print / PDF**.
- Check Clean, Matra cells, and Graph paper; Color and Printer B&W; and each typeface.
- Confirm Graph Paper is composed of real, equal matra cells plus real empty trailing cells; it must not be a repeating background image behind independently positioned notation.
- Confirm a ten-matra line containing dense four- or eight-strike beats still occupies ten graph cells (plus any repeat/cue cells), uses the available printable width, and never folds early because the contents of one cell are visually dense.
- Place prose descriptions, section names, and numbered cues between music lines. Confirm they print as compact inter-row strips, preserve authored capitalization, and their ruled background ends at the paper margin rather than creating implicit columns beyond it.
- Confirm kan runs, approach slides, four-to-eight-slot matras, and phrase-repeat endings remain inside the cell that owns their matra. Dense subdivisions may wrap internally but must not claim a neighboring matra or touch the stronger vibhag boundary.
- Print a line beginning with `||:` and ending with `:||`. Each repeat sign must occupy its own full-size, non-musical structural grid position outside the first/last note cells. It must not overlap, shrink, or obscure a note, including beside a dense phrase-repeat ending such as `(Dm g -)x3`.
- Print an alternate ending in Clean, Matra cells, and Graph Paper. Confirm the shared phrase appears once, both ending grids start beneath the same final-line coordinate, real empty graph cells continue after each shorter branch, and the paired ending block never splits across a page boundary. No `@N` source marker should be needed to understand the printed route.
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
