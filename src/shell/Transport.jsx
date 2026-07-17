// src/shell/Transport.jsx — the M3 transport strip (mock approved with one
// redline, 2026-07-16: the BPM field IS the tempo: directive — editing it
// edits the text, because text is the source of truth. laya: carries the
// tradition's word for speed; tempo: carries the playback number.)
// Presentational: all behavior injected from App.jsx.

import React, { useEffect, useState } from 'react';

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

export default function Transport({
  playing,
  position,
  duration,
  bpm,
  loopMode,
  tracks,
  onPlayPause,
  onStop,
  onBpm,
  onLoopMode,
  onTrackMute,
}) {
  const [bpmDraft, setBpmDraft] = useState(String(bpm));
  useEffect(() => setBpmDraft(String(bpm)), [bpm]);

  const commitBpm = () => {
    const v = parseInt(bpmDraft, 10);
    if (Number.isFinite(v) && v >= 10 && v <= 400 && v !== bpm) onBpm(v);
    else setBpmDraft(String(bpm));
  };

  return (
    <div className="transport">
      <button
        className="tp-btn tp-primary"
        onClick={onPlayPause}
        title="Play/Pause (Space)"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <button className="tp-btn" onClick={onStop} title="Stop" aria-label="Stop">
        ⏹
      </button>
      <span className="tp-pos">
        {fmt(position)} / {fmt(duration)}
      </span>
      <span className="tp-sep" />
      <label className="tp-label" htmlFor="tp-bpm">
        BPM
      </label>
      <input
        id="tp-bpm"
        className="tp-tempo"
        value={bpmDraft}
        inputMode="numeric"
        onChange={(e) => setBpmDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commitBpm}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitBpm();
            e.target.blur();
          }
          e.stopPropagation(); // Space in the field must not toggle play
        }}
        title="Playback speed — writes the tempo: directive"
      />
      <span className="tp-sep" />
      <span className="tp-label">Loop</span>
      <span className="tp-seg" role="group" aria-label="Loop mode">
        {['off', 'line', 'section'].map((m) => (
          <button
            key={m}
            className={loopMode === m ? 'on' : ''}
            aria-pressed={loopMode === m}
            onClick={() => onLoopMode(m)}
          >
            {m}
          </button>
        ))}
      </span>
      <span className="tp-sep" />
      {['melody', 'tick'].map((tr) => (
        <label className="tp-check" key={tr}>
          <input
            type="checkbox"
            checked={!tracks[tr]}
            onChange={(e) => onTrackMute(tr, !e.target.checked)}
          />
          {tr}
        </label>
      ))}
    </div>
  );
}
