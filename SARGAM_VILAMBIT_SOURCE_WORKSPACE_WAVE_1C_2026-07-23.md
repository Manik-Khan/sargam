# Vilambit Source Workspace — Wave 1C Layout Consolidation

## Purpose
This wave is a layout and workflow cleanup on top of Vilambit Source Workspace Wave 1B and the loop-to-marker correction.

The prior functionality was working, but the screen had become too crowded. This pass consolidates related controls so the musician can work more comfortably on laptop-width screens.

## What changed

### 1. Playback card
The separate Speed and Pitch cards are now one **Playback** card.

- Speed controls remain unchanged.
- Pitch semitones / cents remain unchanged.
- All existing element IDs are preserved so the current engine wiring continues to work.

### 2. Loop & Markers card
The separate Loop and Markers cards are now one combined **Loop & Markers** card.

- Loop controls remain intact.
- Marker list remains intact.
- Session save/load remains in this combined card.
- Marker actions (`Set A`, `Set B`, `Loop → next`) remain intact.
- `A → Marker` and `B → Marker` remain intact.

### 3. Tuning moved to collapsible advanced card
The tuning / retune workflow is now a collapsible **Advanced tuning** card.

- Default state is collapsed.
- All tuning controls and IDs remain unchanged.

### 4. Wider card grid and card spanning
- The controls grid now uses a slightly larger minimum card width.
- On wider screens, the **Playback** and **Loop & Markers** cards span two grid columns so they have room to breathe.
- Internal subpanels are used to keep related controls visually grouped.

## Files changed
- `public/vilambit.html`
- `public/vilambit/vilambit.css`

## Apply order
This patch expects the repository to already include:
1. Vilambit Source Workspace Wave 1
2. Wave 1B marker/loop workflow
3. Wave 1B loop-to-marker correction

## Browser acceptance checklist
1. Open Vilambit with a loaded recording.
2. Confirm there is one **Playback** card containing both speed and pitch.
3. Confirm there is one **Loop & Markers** card containing both loop controls and the marker list.
4. Confirm **Advanced tuning** is collapsed by default and opens normally.
5. Confirm `A → Marker` and `B → Marker` still work.
6. Confirm marker actions `Set A`, `Set B`, and `Loop → next` still work.
7. Confirm session Save/Load is still available in the combined card.
8. Confirm the page remains readable at your normal laptop browser width.

## Verification performed here
- Patch applied cleanly to a fresh copy of the Wave 1B + loop-to-marker baseline.
- `public/vilambit.html` parsed successfully.
- `public/vilambit/vilambit-app.js` passed `node --check`.
- `public/vilambit/vilambit-core.js` passed `node --check`.

This environment could not run the full npm smoke suite or Vite build because the isolated workspace did not have a restorable dependency set. The user's local `npm run smoke` and `npm run build` remain the authoritative full gate.
