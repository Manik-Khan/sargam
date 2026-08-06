// src/shell/Transport.jsx — compact notation transport with detailed sound
// controls kept in a settings popover. Presentational: playback and preference
// behavior remains owned by App.

import React, { useEffect, useRef, useState } from 'react';
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
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
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
        onChange={(event) => onChange(name, Number(event.target.value))}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={`${label}: ${pct(value)}`}
      />
      <span className="tp-tone-edge tp-tone-edge-right">{high}</span>
      <output>{pct(value)}</output>
    </label>
  );
}

function MixRow({ track, label, muted, volume, onTrackMute, onTrackGain }) {
  return (
    <div className="tp-mix-row">
      <label className="tp-check">
        <input
          type="checkbox"
          checked={!muted}
          onChange={(event) => onTrackMute(track, !event.target.checked)}
        />
        {label}
      </label>
      <input
        className="tp-volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(event) => onTrackGain(track, Number(event.target.value))}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={`${label} volume`}
        title={`${label} volume: ${pct(volume)}`}
      />
      <output className="tp-volume-value">{pct(volume)}</output>
    </div>
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
  followEditing = true,
  followPlayback = true,
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
  onFollowEditing,
  onFollowPlayback,
}) {
  const [bpmDraft, setBpmDraft] = useState(String(bpm));
  const lastDroneMode = useRef(droneMode === 'off' ? 'sa-pa' : droneMode);
  useEffect(() => setBpmDraft(String(bpm)), [bpm]);
  useEffect(() => {
    if (droneMode !== 'off') lastDroneMode.current = droneMode;
  }, [droneMode]);

  const commitBpm = () => {
    const value = parseInt(bpmDraft, 10);
    if (Number.isFinite(value) && value >= 10 && value <= 400 && value !== bpm) onBpm(value);
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
  const talaEnabled = talaSound !== 'off' && !tracks.tick;

  const toggleTala = () => {
    if (talaSound === 'off') {
      onTalaSound('click');
      onTrackMute('tick', false);
      return;
    }
    onTrackMute('tick', !tracks.tick);
  };

  return (
    <div className="transport" aria-label="Notation playback controls">
      <span className="tp-context">Notation</span>
      <button
        className="tp-btn tp-primary"
        onClick={onPlayPause}
        title="Play/Pause (Space)"
        aria-label={playing ? 'Pause notation' : 'Play notation'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <button className="tp-btn" onClick={onStop} title="Stop notation" aria-label="Stop notation">
        ⏹
      </button>
      <span className="tp-pos">{fmt(position)} / {fmt(duration)}</span>
      <span className="tp-sep" />
      <label className="tp-label" htmlFor="tp-bpm">BPM</label>
      <input
        id="tp-bpm"
        className="tp-tempo"
        value={bpmDraft}
        inputMode="numeric"
        onChange={(event) => setBpmDraft(event.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commitBpm}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commitBpm();
            event.target.blur();
          }
          event.stopPropagation();
        }}
        title="Playback speed — writes the tempo: directive"
      />
      <span className="tp-sep" />
      <span className="tp-label">Loop</span>
      <span className="tp-seg tp-loop" role="group" aria-label="Loop mode">
        {['off', 'line', 'section'].map((mode) => (
          <button
            key={mode}
            className={loopMode === mode ? 'on' : ''}
            aria-pressed={loopMode === mode}
            onClick={() => onLoopMode(mode)}
          >
            {mode}
          </button>
        ))}
      </span>
      <span className="tp-sep" />
      <div className="tp-quick-group" role="group" aria-label="Quick sound toggles">
        <button
          type="button"
          className="tp-quick"
          aria-pressed={!tracks.melody}
          onClick={() => onTrackMute('melody', !tracks.melody)}
          title="Turn the notation melody on or off"
        >
          <span aria-hidden="true" /> Melody
        </button>
        <button
          type="button"
          className="tp-quick"
          aria-pressed={droneMode !== 'off'}
          onClick={() => onDroneMode(droneMode === 'off' ? lastDroneMode.current : 'off')}
          title="Turn the tanpura on or off"
        >
          <span aria-hidden="true" /> Tanpura
        </button>
        <button
          type="button"
          className="tp-quick"
          aria-pressed={talaEnabled}
          onClick={toggleTala}
          title="Turn the tala on or off"
        >
          <span aria-hidden="true" /> Tala
        </button>
      </div>
      <details className="tp-settings" onKeyDown={(event) => event.stopPropagation()}>
        <summary title="Playback and workspace settings" aria-label="Sound settings">
          <span aria-hidden="true">⚙</span> Settings
        </summary>
        <div className="tp-settings-menu">
          <section className="tp-settings-section">
            <div className="tp-settings-heading">
              <strong>Live workspace</strong>
              <span>The score keeps rendering while the editor stays anchored.</span>
            </div>
            <label className="tp-setting-check">
              <input
                type="checkbox"
                checked={followEditing}
                onChange={(event) => onFollowEditing?.(event.target.checked)}
              />
              Keep the measure I am editing visible
            </label>
            <label className="tp-setting-check">
              <input
                type="checkbox"
                checked={followPlayback}
                onChange={(event) => onFollowPlayback?.(event.target.checked)}
              />
              Follow the measure being played
            </label>
          </section>

          <section className="tp-settings-section">
            <div className="tp-settings-heading">
              <strong>Melody sound</strong>
              <span>Voice and tone for the rendered notation.</span>
            </div>
            <label className="tp-tone-select-row">
              <span className="tp-tone-name">Voice</span>
              <select
                id="tp-melody-voice"
                className="tp-tone-select"
                value={melodyVoice}
                onChange={(event) => onMelodyVoice(event.target.value)}
                title="Every choice preserves the written pitch"
              >
                {MELODY_VOICE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <div className="tp-tone-heading">{melodyVoiceLabel(melodyVoice)}</div>
            <p className="tp-tone-note">Changing instruments never transposes the notation.</p>
            <ToneSlider name="velocity" value={voiceTone.velocity} onChange={onToneChange} />
            <ToneSlider name="brightness" value={voiceTone.brightness} onChange={onToneChange} />
            <ToneSlider name="attack" value={voiceTone.attack} onChange={onToneChange} />
            <ToneSlider name="release" value={voiceTone.release} onChange={onToneChange} />
            <ToneSlider name="reverb" value={voiceTone.reverb} onChange={onToneChange} />
            {sampledVoice && <ToneSlider name="chorus" value={voiceTone.chorus} onChange={onToneChange} />}
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
                  The neutral tone follows the composition's written pitch and octave.
                </p>
              </div>
            )}
            {melodyVoice === 'harmonium' && (
              <div className="tp-tone-switches">
                <label>
                  <input
                    type="checkbox"
                    checked={voiceTone.coupler}
                    onChange={(event) => onToneChange('coupler', event.target.checked)}
                  />
                  Add upper-octave coupler
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={voiceTone.subOctave}
                    onChange={(event) => onToneChange('subOctave', event.target.checked)}
                  />
                  Add sub-octave layer
                </label>
                <p className="tp-tone-note">The written pitch remains present.</p>
              </div>
            )}
            {sampledVoice && (
              <p className="tp-tone-note">
                GeneralUser GS is bundled locally for the sampled instruments.
              </p>
            )}
          </section>

          <section className="tp-settings-section">
            <div className="tp-settings-heading">
              <strong>Tanpura</strong>
              <span>Drone tuning and level.</span>
            </div>
            <div className="tp-setting-row">
              <span className="tp-seg" role="group" aria-label="Tanpura support">
                {[
                  ['off', 'Off'],
                  ['sa-pa', 'Sa–Pa'],
                  ['sa-ma', 'Sa–ma'],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    className={droneMode === mode ? 'on' : ''}
                    aria-pressed={droneMode === mode}
                    onClick={() => onDroneMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </span>
              <input
                className="tp-volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volumes.drone}
                disabled={droneMode === 'off'}
                onChange={(event) => onTrackGain('drone', Number(event.target.value))}
                aria-label="Tanpura volume"
              />
              <output className="tp-volume-value">{pct(volumes.drone)}</output>
            </div>
          </section>

          <section className="tp-settings-section">
            <div className="tp-settings-heading">
              <strong>Tala sound</strong>
              <span>Choose click, tabla, or silence.</span>
            </div>
            <span className="tp-seg" role="group" aria-label="Tala sound">
              {['click', 'tabla', 'off'].map((mode) => (
                <button
                  key={mode}
                  className={talaSound === mode ? 'on' : ''}
                  aria-pressed={talaSound === mode}
                  onClick={() => onTalaSound(mode)}
                >
                  {mode}
                </button>
              ))}
            </span>
          </section>

          <section className="tp-settings-section">
            <div className="tp-settings-heading">
              <strong>Mix</strong>
              <span>Notation melody and tala levels.</span>
            </div>
            <MixRow
              track="melody"
              label="Melody"
              muted={tracks.melody}
              volume={volumes.melody}
              onTrackMute={onTrackMute}
              onTrackGain={onTrackGain}
            />
            <MixRow
              track="tick"
              label="Tala"
              muted={tracks.tick}
              volume={volumes.tick}
              onTrackMute={onTrackMute}
              onTrackGain={onTrackGain}
            />
          </section>
        </div>
      </details>
    </div>
  );
}
