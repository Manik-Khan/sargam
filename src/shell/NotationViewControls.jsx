import React from 'react';
import WorkspaceMenu from './WorkspaceMenu.jsx';

export default function NotationViewControls({ rhythmGrid, onRhythmGrid, rhythmGridStyle, onRhythmGridStyle,
  followEditing, onFollowEditing, followPlayback, onFollowPlayback, layout, onToggleLayout,
  noteNames, onToggleNoteNames, showStructure, onShowStructure, onLegend }) {
  return <WorkspaceMenu label="View">
    <label><input type="checkbox" checked={rhythmGrid} onChange={event => onRhythmGrid(event.target.checked)} /> Show beat grid</label>
    {rhythmGrid && <div className="cmd-grid-style" role="group" aria-label="Grid appearance">
      <span>Grid style</span>
      <button type="button" aria-pressed={rhythmGridStyle === 'cells'} onClick={() => onRhythmGridStyle('cells')}>Cells</button>
      <button type="button" aria-pressed={rhythmGridStyle === 'paper'} onClick={() => onRhythmGridStyle('paper')}>Graph Paper</button>
    </div>}
    <label><input type="checkbox" checked={followEditing} onChange={event => onFollowEditing(event.target.checked)} /> Keep the measure I am editing visible</label>
    <label><input type="checkbox" checked={followPlayback} onChange={event => onFollowPlayback(event.target.checked)} /> Follow the measure being played</label>
    <label><input type="checkbox" checked={showStructure} onChange={event => onShowStructure(event.target.checked)} /> Show metadata</label>
    <button type="button" onClick={onToggleLayout}>{layout === 'stacked' ? 'Editor beside score' : 'Editor below score'}</button>
    <button type="button" onClick={onToggleNoteNames}>{noteNames === 'western' ? 'Use Sargam note names' : 'Use Western note names'}</button>
    <button type="button" onClick={onLegend}>Notation guide</button>
  </WorkspaceMenu>;
}
