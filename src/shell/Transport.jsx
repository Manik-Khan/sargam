// src/shell/Transport.jsx — notation transport and compact sound controls.
// Presentational: all playback and preference behavior is injected from App.

import React, { useEffect, useState } from 'react';
import {
  isSoundfontVoice,
  melodyVoiceLabel,
  MELODY_VOICE_OPTIONS,
} from './voices.js';

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

const TONE_LABELS = Object.freeze({
  velocity: ['Touch', 'Soft', 'Firm'],
  brightness: ['Brightness', 'Dark', 'Bright'],
  attack: ['Attack', 'Immediate', 'Gentle'],
  release: ['Release', 'Short', 'Long'],
  reverb: ['Room', 'Dry', 'Roomy'],
  chorus: ['Chorus', 'None', 'Wide'],
});


function ToneSelect({ label, value, onChange, options }) {
  return (
    <label className="tp-tone-select-row">
      <span className="tp-tone-name">{label}</span>
      <select
        className="tp-tone-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function ToneSlider({ name, value, onChange, disabled = false }) {
  const [label, low, high] = TONE_LABELS[name];
  return (
    <label className={'tp-tone-row' + (disabled ? ' is-disabled' : '')}>
      <span className="tp-tone-name">{label}</span>
      <span className="tp-tone-edge">{low}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(name, Number(e.target.value))}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={`${label}: ${pct(value)}`}
      />
      <span className="tp-tone-edge tp-tone-edge-right">{high}</span>
      <output>{pct(value)}</output>
    </label>
  );
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
  tone,
  droneMode,
  talaSound,
  onPlayPause,
  onStop,
  onBpm,
  onLoopMode,
  onTrackMute,
  onTrackGain,
  onMelodyVoice,
  onToneChange,
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

  const voiceTone = tone || {
    velocity: 0.65,
    brightness: 0.5,
    attack: 0.1,
    release: 0.3,
    reverb: 0.05,
    chorus: 0,
    coupler: false,
    subOctave: false,
    neutralEnvelope: 'soft',
    neutralWaveform: 'triangle',
  };
  const sampledVoice = isSoundfontVoice(melodyVoice);

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
          e.stopPropagation();
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
        title="Choose the notation melody voice; every choice preserves the written pitch"
      >
        {MELODY_VOICE_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <details className="tp-tone" onKeyDown={(e) => e.stopPropagation()}>
        <summary>Sound settings</summary>
        <div className="tp-tone-menu">
          <div className="tp-tone-heading">{melodyVoiceLabel(melodyVoice)}</div>
          <ToneSlider name="velocity" value={voiceTone.velocity} onChange={onToneChange} />
          <ToneSlider name="brightness" value={voiceTone.brightness} onChange={onToneChange} />
          <ToneSlider name="attack" value={voiceTone.attack} onChange={onToneChange} />
          <ToneSlider name="release" value={voiceTone.release} onChange={onToneChange} />
          <ToneSlider name="reverb" value={voiceTone.reverb} onChange={onToneChange} />
          {sampledVoice && (
            <ToneSlider name="chorus" value={voiceTone.chorus} onChange={onToneChange} />
          )}
          {melodyVoice === 'neutral' && (
            <div className="tp-tone-special">
              <ToneSelect
                label="Envelope"
                value={voiceTone.neutralEnvelope || 'soft'}
                onChange={(value) => onToneChange('neutralEnvelope', value)}
                options={[
                  ['soft', 'Soft and rounded'],
                  ['bell', 'Bell-like decay'],
                  ['sustain', 'Sustained'],
                  ['pluck', 'Short pluck'],
                ]}
              />
              <ToneSelect
                label="Wave"
                value={voiceTone.neutralWaveform || 'triangle'}
                onChange={(value) => onToneChange('neutralWaveform', value)}
                options={[
                  ['sine', 'Pure sine'],
                  ['triangle', 'Rounded triangle'],
                ]}
              />
              <p className="tp-tone-note">
                The neutral tone always follows the composition's written pitch and octave.
              </p>
            </div>
          )}
          {melodyVoice === 'harmonium' && (
            <div className="tp-tone-special">
              <div className="tp-tone-switches">
                <label>
                  <input
                    type="checkbox"
                    checked={voiceTone.coupler}
                    onChange={(e) => onToneChange('coupler', e.target.checked)}
                  />
                  Add upper-octave coupler
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={voiceTone.subOctave}
                    onChange={(e) => onToneChange('subOctave', e.target.checked)}
                  />
                  Add sub-octave layer
                </label>
              </div>
              <p className="tp-tone-note">
                These are optional layers; the written pitch remains present.
              </p>
            </div>
          )}
          {sampledVoice && (
            <p className="tp-tone-note">
              GeneralUser GS is bundled locally and played through SpessaSynth. Changing instruments never transposes the notation.
            </p>
          )}
        </div>
      </details>
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
