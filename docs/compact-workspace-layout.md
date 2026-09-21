# Compact workspace layout

Manik approved the interactive layout mock, with one explicit correction: retain
the existing Sargam visuals. This implementation keeps the AACM logo, Newsreader
and existing typefaces, green/cream palette, background artwork, paper surfaces,
and ornamental treatment. It changes arrangement, not notation semantics.

Implementation base: `/Users/khansolo/Documents/GitHub/sargam`, clean matching
`main` at `19bbb77e3277`. No commit, push or deployment was requested.

## Where controls live

- The left rail is one 38px identity strip, replacing the former 206px three-strip
  navigation. Narrow phones omit the rail. Notation, Music and explicit Split view
  remain in the top navigation at every supported width. Small-screen split view
  stacks the score and recording instead of hiding the recording.
- File and Library stay in the header. More contains Linked phrases, Queue and
  the college/motto. Their existing actions and recording identities are retained.
- Notation transport keeps play/pause, stop and BPM, with Repeat and Sounds menus.
  Sounds retains all melody, tanpura, tala, chikari, mix and voice settings.
- An empty recording remote is hidden, but its readiness/error/clip subscription
  remains mounted. Loaded recording controls and selected linked phrases remain
  available. Music keeps its existing full player; Split view has both surfaces.
- The source toolbar groups Text/Grid, Note tools, Insert, View, Go to beginning
  and Focus mode. Existing layout preferences survive; new users start with the
  editor below the score and can switch its position in View.
- Note tools opens only by explicit activation. Its bounded, independently
  scrolling inspector sits below the editor and contains ornaments, per-note
  bols, keyboard Bol Capture, and score annotation/meter tools. Closing it or
  entering Focus mode clears active score-stamping tools. Closed inspector
  contents are unmounted to avoid parsing selections that nobody can see.
- Insert contains beat grouping, phrase/passage repeats, octave shifts and
  dictation. View contains grid appearance, editing/playback follow, metadata
  visibility, note naming, score/editor arrangement and the notation guide.
- Text editing remains direct. Existing ornament/bol edits and undo semantics,
  Jhampak half-beat inference, note click/seek behavior, and player lifecycle
  remain intact. No changes to decoding or any recording upload behavior.

## Stability and access

Selection never opens the inspector or changes its outer height. The earlier
pointer-selection deferral remains in place. Bol Capture has a visible status
and exit button above the editor while it is active, even if the inspector closes.

Tool popovers render above pane clipping, fit their available viewport space,
focus their first control, and dismiss with Escape, Close, outside interaction,
or viewport resize. Independent score/source scrolling does not dismiss them.
Keyboard activation of a button no longer also invokes the global Space
playback shortcut.

## Verification and remaining acceptance

`npm run verify`: **718 passed, 0 failed; production build passed (131 modules)**.
The existing large-bundle advisory remains. New tests use real React components
in jsdom for menus, keyboard dismissal, preference callbacks, sound/transport
callbacks, header navigation, empty-to-loaded recording bridge transitions, and
explicit inspector visibility. Existing notation, geometry, playback, import,
export and selection regressions also pass.

Live browser visual/aural acceptance is still pending; jsdom does not establish
layout geometry, pointer accuracy or audible output. Earlier Chrome access was
not approved and the embedded browser was policy-blocked.

Manual sequence:
1. In Chrome and Safari, check wide desktop, a narrow window and phone width.
   Confirm the original artwork/type treatment remains and navigation is usable.
2. Drag source selections with tools closed and open. Apply ornaments/bols, undo,
   and confirm selection updates never expand the inspector or move source text.
3. Open View, Insert and Sounds near screen edges. Use keyboard navigation,
   Escape and outside clicks. Adjust sound while the score follows playback.
4. Switch Text/Grid, metadata visibility, grid style and editor arrangement.
   Resize the score/source divider. Enter and exit Focus mode.
5. Open/replace a local recording, play, seek, loop and attach a notation link.
   Switch Notation/Music/Split without interrupting the recording. At narrow
   widths verify that Split shows both score and recording.
6. Exercise File/Library/More, linked phrases, Queue and Print/PDF. Confirm the
   full player and exported score retain their existing behavior.
