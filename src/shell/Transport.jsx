// src/shell/Transport.jsx — notation transport and compact sound controls.
// Presentational: all playback and preference behavior is injected from App.

import React, { useEffect, useState } from 'react';

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export default function Transport({
  playing,
  position,
  duration,
  bpm,
  loopMode,
  tracks,
  volumes,
  melodyVoice,
  droneMode,
  talaSound,
  onPlayPause,
  onStop,
  onBpm,
  onLoopMode,
  onTrackMute,
  onTrackGain,
  onMelodyVoice,
  onDroneMode,
  onTalaSound,
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
      <label className="tp-label" htmlFor="tp-melody-voice">
        Melody sound
      </label>
      <select
        id="tp-melody-voice"
        className="tp-select"
        value={melodyVoice}
        onChange={(e) => onMelodyVoice(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        title="Choose the notation melody voice"
      >
        <option value="pluck">Current pluck</option>
        <option value="practice">Soft practice</option>
        <option value="sine">Sine / ear training</option>
        <option value="harmonium">Harmonium-like</option>
      </select>
      <span className="tp-sep" />
      <span className="tp-label">Tanpura</span>
      <span className="tp-seg" role="group" aria-label="Tanpura support">
        {[
          ['off', 'off'],
          ['sa-pa', 'Sa–Pa'],
          ['sa-ma', 'Sa–ma'],
        ].map(([mode, label]) => (
          <button
            key={mode}
            className={droneMode === mode ? 'on' : ''}
            aria-pressed={droneMode === mode}
            onClick={() => onDroneMode(mode)}
            title={
              mode === 'off'
                ? 'No tanpura support'
                : `Synthesized four-string ${label} drone tuned from the document's Sa`
            }
          >
            {label}
          </button>
        ))}
      </span>
      <div className="tp-drone-volume">
        <input
          className="tp-volume"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volumes.drone}
          disabled={droneMode === 'off'}
          onChange={(e) => onTrackGain('drone', Number(e.target.value))}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="Tanpura volume"
          title={`Tanpura volume: ${pct(volumes.drone)}`}
        />
        <output className="tp-volume-value">{pct(volumes.drone)}</output>
      </div>
      <span className="tp-sep" />
      <span className="tp-label">Tala sound</span>
      <span className="tp-seg" role="group" aria-label="Tala sound">
        {['click', 'tabla', 'off'].map((mode) => (
          <button
            key={mode}
            className={talaSound === mode ? 'on' : ''}
            aria-pressed={talaSound === mode}
            onClick={() => onTalaSound(mode)}
            title={
              mode === 'tabla'
                ? 'Recorded tabla prototype; Rupak is mapped first and other talas retain the click'
                : undefined
            }
          >
            {mode}
          </button>
        ))}
      </span>
      <span className="tp-sep" />
      {[
        ['melody', 'Melody'],
        ['tick', 'Tala'],
      ].map(([track, label]) => (
        <div className="tp-track" key={track}>
          <label className="tp-check">
            <input
              type="checkbox"
              checked={!tracks[track]}
              onChange={(e) => onTrackMute(track, !e.target.checked)}
            />
            {label}
          </label>
          <input
            className="tp-volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volumes[track]}
            onChange={(e) => onTrackGain(track, Number(e.target.value))}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={`${label} volume`}
            title={`${label} volume: ${pct(volumes[track])}`}
          />
          <output className="tp-volume-value">{pct(volumes[track])}</output>
        </div>
      ))}
    </div>
  );
}
