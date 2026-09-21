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
- Click a rendered matra and confirm its corresponding Markdown note is selected and centered.
- Turn **Graph Grid** on. Confirm each matra has one cell, its tala-matra coordinate is visible, subdivisions stay inside the cell, and the selected cell remains highlighted after an edit.
- Switch to **Grid Write**. Change a note, enter a spaced subdivision such as `S R`, add a hold or rest, and append one matra. Confirm the Markdown-backed score and playback duration update immediately.
- While Grid Write is showing the beginning of a long composition, click a matra on a much later rendered score line. Confirm the matching source line and exact matra are centered and focused in the editor. Then click an early score matra and confirm the editor returns to it.
- Enter an invalid multi-matra draft such as `S/R`. Confirm the box reports the problem without changing the score, then press Escape to restore the source value.
- On a late line, switch between Text Write and Grid Write several times. Confirm the same musical line remains visible and Grid Write retains the exact matra when possible; neither mode may return to the top. Use **Beginning** and confirm that it intentionally selects the first notation line.
- Toggle **Writing focus**. Confirm secondary annotation tools hide, score/editor margins contract, both writing surfaces remain usable, and **Show tools** restores the controls without losing position.
- Toggle the grid look between **Cells** and **Paper**. Confirm Paper continues each musical row through unused width with empty matra-sized boxes (no smaller background grid), the choice survives reload, and a kan such as `{m}g` remains legible.
- In Grid Write, click the `+` beneath a note attack near the left, right, and bottom edges. Confirm the complete floating da/ra/diri/chikari/remove menu remains inside the viewport and above pane boundaries. Choose one bol and verify the menu closes, the ordinary editable `>` lane changes, and the bol appears in the matching rendered cell strip. Reopen that note's symbol and remove it. **diri · same note** must remain under one note and sound two strokes on its pitch. **diri · next note** must write `di-ri`, label the paired Grid Write slots `di` / `ri`, preserve and sound both written pitches, and render/print one continuous V aligned to the two attacks. Across a matra boundary there must be no second or faded V, and printing must not insert a system break between the connected attacks.
- Write a matra such as `-S`. Confirm Grid Write exposes two bol targets: the empty first subdivision and the attacked S. Add chikari to the gap and da to S. The source must read `> ^da`, the notation/print bol strip must show `^` then `|`, and removing either mark must not disturb the other.
- On a line with attached bols, use **Copy bols** and confirm all of that line's editable bol lanes are copied in source order without including the following music line.
- Write `SSSS` in one matra, attach Diri to all four notes, and play it at 60 BPM. Confirm four legible `V` marks remain inside the cell and eight evenly spaced strikes sound within that one-second matra.
- Open a document containing older score-side bol marks and switch to Grid Write. Confirm they become editable `>` lanes automatically, disappear from the detached annotation overlay, and retain their note alignment. A structurally complete older two-attack Diri lane must not shift the bols that follow it.
- On lines with delayed attacks or leading holds, confirm `0`, `1`, `2`, `3`, and `+` tala markers remain inset at the upper-left of their cells and never overlap a vibhag divider, repeat sign, octave dot, or ornament.
- Resize the score/editor divider and confirm neither surface jumps to another line.

## Selected notes controls and direct typing

- Type `~(Gm)`, `[[Gm]]`, and `{G}m` directly in Text Write. Select each complete wrapper and confirm the corresponding control is active; replace it or choose None. Select plain `Gm` and apply each ornament by button. The source and score must agree in both directions.
- Select `Gm R S` and confirm the panel remains bounded, scrollable and keyboard-usable without hiding the source editor at small window sizes. Writing focus must hide the panel with the other secondary controls.
- On `Gm R S` with `> da ra diri chikari` and a second bol pass, turn `Gm` into Kan. The destination m and following notes must keep their bols; the newly untimed G loses its bol with an explanatory message. One Undo must restore both notation and every bol pass, and Redo must reapply the complete change.
- Change a bol using the per-note selector, including Diri · same note and Diri · next note. Type directly in the resulting `>` lane too; confirm the controls reflect the written result when those notes are selected again.
- Try an empty selection, one-note Kan, partial octave prefix and incomplete wrapper. Invalid button edits must be disabled with an explanation, while deliberate source typing remains possible.
- On `Gm -S` with `> da ra ^da`, apply Kan to `Gm`. Chikari must remain on the leading hold before S, and da must remain on S. Undo/Redo must preserve both positions.

## Playback

- Open a local audio recording that the browser cannot decode (for example a confirmed unsupported ALAC M4A). Confirm automatic preparation with Cancel, then audible playback with the original name, markers, loops, and source identity. Confirm native-playable audio does not load the optional decoder.
- Cancel preparation and switch recordings during preparation; neither may leave Play disabled or allow the old result to replace the new recording. Check error/size/time limits are explained without accepting a partial recording.
- In browser developer tools, verify preparation downloads only the same-origin decoder software and makes no requests uploading recording data. See `docs/audio-compatibility.md`.

- In Music, load and play a local MP4; replace it with a second MP4, then a local audio file, then the first MP4. Each must play with audible sound without refreshing the page. Check play/pause, seek-before-first-play, speed/pitch, and A–B looping after replacement.
- Click Play twice quickly while setup is pending, and replace a recording during setup. No old recording or unfinished processing graph may take over the new source.
- Load an unreadable local recording. Its message must identify a local-file/format problem, not an archive URL problem; a subsequent valid recording must remain playable.

- Play from the beginning and from a clicked matra. Click G and m within `Gm` in both Markdown and rendered notation: the two positions must differ by half a beat. A paused/stopped player remains silent; an already-playing player continues from the selected position without queued sounds from its old location.
- Drag a source selection and trigger programmatic source/Grid Write reveals; these must not scrub or rewind playback. Click an already-focused Grid Write cell to seek it again.
- In Jhampak at 60 BPM, use `@3 ||: G - Gm | R- S | .N.D .N|S - :||`. The last S must be sam at 6.5 seconds from the written line's beginning, after the automatic half-beat cell; each pass lasts 8.5 beats.
- Confirm melody, tanpura, and tala toggles work independently.
- Confirm editing stops stale playback instead of continuing against changed notation.
- Test line and section looping, then turn looping off.
- Write a repeated common phrase with `|1` before its first ending and place the second ending on the following notation line. Confirm **1st time** and **2nd time** brackets begin at one aligned divergence after the shared cells, the first ending's `:||` remains a separate structural position, and playback performs common + first ending, then common + second ending without duplicating the common phrase in source.
- In Grid Write, use **Add 1st ending** on a repeated line. Confirm placement mode offers **Start here** on every valid boundary, choosing the first changed matra adds the same `|1` source marker, and the first and following rows are visibly labelled **1st ending** and **2nd ending**. Move the boundary, then remove it, and confirm both Text Write and the rendered score update immediately.
- Right-click a single-note and a multi-note Grid Write cell. Confirm the matra menu opens at the pointer, multi-note cells offer an explicit note selector, bol choices update the ordinary editable bol lane, and Shift–F10 opens the same menu. Near the bottom/right edge it must remain fully visible. Start a phrase repeat on one cell and finish it on a later cell at ×2 and ×3; also toggle the full line repeat and place/remove the first ending from the menu. Confirm Text Write shows the standard `(…)xN`, `||: … :||`, and `|1` forms and that existing `+`/ending controls still work.
- With playback following enabled, confirm only the score pane scrolls.

## Print and PDF

- Open **File → Print / PDF**.
- Check Clean, Matra cells, and Graph paper; Color and Printer B&W; and each typeface.
- Confirm Graph Paper is composed of real logical matra cells (dense cells may span two or three physical columns) plus real empty trailing cells; it must not be a repeating background image behind independently positioned notation.
- Confirm a ten-matra line still has ten logical selectable cells, with dense cells occupying their required physical columns. Repeats/cues have separate structural cells. Planning must charge every physical column, use the available width, and fold only at safe musical boundaries.
- Place prose descriptions, section names, and numbered cues between music lines. Confirm they print as compact inter-row strips, preserve authored capitalization, and their ruled background ends at the paper margin rather than creating implicit columns beyond it.
- Confirm kan runs, approach slides, four-to-eight-slot matras, and phrase-repeat endings remain inside the cell that owns their matra. Dense subdivisions may wrap internally but must not claim a neighboring matra or touch the stronger vibhag boundary.
- Print a line beginning with `||:` and ending with `:||`. Each repeat sign must occupy its own full-size, non-musical structural grid position outside the first/last note cells. It must not overlap, shrink, or obscure a note, including beside a dense phrase-repeat ending such as `(Dm g -)x3`.
- Print an alternate ending in Clean, Matra cells, and Graph Paper. Confirm the shared phrase appears once, both ending grids start beneath the same final-line coordinate, real empty graph cells continue after each shorter branch, and the paired ending block never splits across a page boundary. No `@N` source marker should be needed to understand the printed route.
- Print lyrics with multiple bol passes; the row must grow so their lanes do not cover notes, octave marks or each other. Check a diri that ends inside an expanded cell and verify that both endpoints line up with the actual attacks.
- Print a line with attached bols and confirm each matra's bol strip shares the cell's internal attack subdivisions without covering its notes or crossing a cell boundary.
- Confirm graph-paper section descriptions and written cues have a light neutral backing that masks grid lines behind the text and remains legible in Printer B&W.
- Confirm a long composition uses every required page and no ornament or cell is cut at a page edge.
- Open and cancel the browser print dialog twice; the preview must remain unchanged.
- Close and reopen Export; the last-used page, typeface, grid, and ink choices must return.
- For a physical-printer check, verify mandra notes, tala markers, and held-beat dashes remain readable in grayscale.

## Library and Queue

- Open **Library** and confirm catalog recordings are separate from composition-specific **Linked phrases**.
- While one archive recording is playing, choose **Add next** on another. Confirm the current recording continues without seeking, pausing, or losing its workspace.
- Reorder upcoming items, remove one, and clear the list. Confirm none of those operations changes the current recording.
- Test Previous and Next, Repeat track, and Repeat queue. Confirm history and the accepted order remain predictable.
- Enable an A–B loop with an upcoming recording. Confirm automatic advancement remains blocked; press **Next** and confirm the loop clears and the next recording loads.
- Load an archive item and confirm its stable source identity is returned before position, loop, markers, speed, pitch, waveform view, and EQ restore.
- Load a local file, then inspect Library. Confirm it is shown as current but cannot be queued for later without reconnection. A same-named file must never be selected automatically.
- Disconnect or invalidate an archive media URL. Confirm the Library record remains visible as unavailable and no substitute recording loads.

## Files and restoration

- Save, close, and reopen the Markdown file.
- Confirm autosave restoration does not silently claim the file was saved.
- If a project folder is open, confirm its recording, A–B loop, markers, speed, pitch, and EQ restore only for the matching source identity.
- Export and re-import a `.sargam` project without overwriting the original project.

Record the date, browser, composition, check count, and any failure before release.

## September 20 audit regression acceptance

- Save while continuing to type. New notes must survive, and remain unsaved until
  a later save includes them. Repeat with two saves, project saving, clip
  extraction, and switching documents while a write is pending.
- In a project folder, listen continuously while adding a marker and changing
  loop/EQ settings. Confirm `workspace.json` changes without pausing. Close and
  reopen during playback and verify recovery for the same source.
- Queue a broken/slow URL. Next must preserve the prior queue on failure or
  timeout. A successful Next must restore saved settings before autoplay.
- Export Tintal → Rupak → Jhampak → free time, all Gat return forms, and the
  approved `@3` Jhampak phrase. Verify measure changes and the closing S on sam
  in a MusicXML reader. Printed Sargam remains covered by the checks above.
- Enter `tal: Ashta Jhaptaal` and verify the same 8½-beat behavior as `jhampak`.
- Open short and long M4A/MP3/WAV recordings. Native files should remain playable
  when a full waveform is skipped. Format failure must start local preparation
  without waiting indefinitely for native decoding.
