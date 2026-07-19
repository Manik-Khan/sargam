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
    sineOctave: 1,
    sineEnvelope: 'soft',
    sineWaveform: 'sine',
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
        title="Choose the notation melody voice"
      >
        <option value="pluck">Current pluck</option>
        <option value="practice">Soft practice</option>
        <option value="sine">Sine / ear training</option>
        <option value="harmonium">Sampled harmonium</option>
      </select>
      <details className="tp-tone" onKeyDown={(e) => e.stopPropagation()}>
        <summary>Sound settings</summary>
        <div className="tp-tone-menu">
          <div className="tp-tone-heading">
            {melodyVoice === 'harmonium' ? 'Sampled harmonium' :
              melodyVoice === 'practice' ? 'Soft practice' :
                melodyVoice === 'sine' ? 'Sine / ear training' : 'Current pluck'}
          </div>
          <ToneSlider name="velocity" value={voiceTone.velocity} onChange={onToneChange} />
          <ToneSlider
            name="brightness"
            value={voiceTone.brightness}
            onChange={onToneChange}
            disabled={melodyVoice === 'sine'}
          />
          <ToneSlider name="attack" value={voiceTone.attack} onChange={onToneChange} />
          <ToneSlider name="release" value={voiceTone.release} onChange={onToneChange} />
          <ToneSlider name="reverb" value={voiceTone.reverb} onChange={onToneChange} />
          {melodyVoice === 'sine' && (
            <div className="tp-tone-special">
              <ToneSelect
                label="Register"
                value={String(voiceTone.sineOctave ?? 1)}
                onChange={(value) => onToneChange('sineOctave', Number(value))}
                options={[
                  ['-1', 'Lower (−1 octave)'],
                  ['0', 'Written register'],
                  ['1', 'Higher (+1 octave)'],
                  ['2', 'Very high (+2 octaves)'],
                ]}
              />
              <ToneSelect
                label="Envelope"
                value={voiceTone.sineEnvelope || 'soft'}
                onChange={(value) => onToneChange('sineEnvelope', value)}
                options={[
                  ['soft', 'Soft and rounded'],
                  ['bell', 'Bell-like decay'],
                  ['sustain', 'Sustained'],
                  ['pluck', 'Short pluck'],
                ]}
              />
              <ToneSelect
                label="Wave"
                value={voiceTone.sineWaveform || 'sine'}
                onChange={(value) => onToneChange('sineWaveform', value)}
                options={[
                  ['sine', 'Pure sine'],
                  ['triangle', 'Rounded triangle'],
                ]}
              />
              <p className="tp-tone-note">
                Higher (+1 octave) is the default so the neutral tone does not sit like a bass drone.
              </p>
            </div>
          )}
          {melodyVoice === 'harmonium' && (
            <>
              <ToneSlider name="chorus" value={voiceTone.chorus} onChange={onToneChange} />
              <div className="tp-tone-switches">
                <label>
                  <input
                    type="checkbox"
                    checked={voiceTone.coupler}
                    onChange={(e) => onToneChange('coupler', e.target.checked)}
                  />
                  Upper coupler
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={voiceTone.subOctave}
                    onChange={(e) => onToneChange('subOctave', e.target.checked)}
                  />
                  Sub-octave
                </label>
              </div>
              <p className="tp-tone-note">
                The first use loads the SoundFont online. Current Pluck remains the fallback.
              </p>
            </>
          )}
          {melodyVoice === 'practice' && (
            <p className="tp-tone-note">
              The fixed out-of-tune resonance has been removed; body tone now follows each note.
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
