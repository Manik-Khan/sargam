// src/shell/PracticeBar.jsx — compact remote for the always-mounted Vilambit iframe.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_VILAMBIT_STATE,
  formatVilambitTime,
  isExpectedVilambitEvent,
  postVilambitCommand,
  readVilambitMessage,
} from './vilambit-bridge.js';

export default function PracticeBar({
  frameRef,
  onOpen,
  onState,
  onAttachLoop,
  projectOpen = false,
  extracting = false,
  onExtractClip,
  onClipExtracted,
  onVilambitError,
  selectedLink = null,
  onPlayLinked,
  onRemoveLinked,
}) {
  const [player, setPlayer] = useState(EMPTY_VILAMBIT_STATE);
  const stateRef = useRef(onState);
  stateRef.current = onState;

  const send = useCallback((type, payload = {}) => {
    const frameWindow = frameRef.current?.contentWindow;
    return postVilambitCommand(frameWindow, type, payload, window.location.origin);
  }, [frameRef]);

  useEffect(() => {
    const origin = window.location.origin;
    const onMessage = (event) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (!isExpectedVilambitEvent(event, { frameWindow, origin })) return;
      const message = readVilambitMessage(event.data);
      if (!message) return;
      if (message.type === 'clip') {
        onClipExtracted?.(message.clip);
        return;
      }
      setPlayer(message.state);
      stateRef.current?.(message.state);
      if (message.type === 'error' && message.state.error) onVilambitError?.(message.state.error);
    };

    window.addEventListener('message', onMessage);
    // The iframe also emits a heartbeat, but these requests make mounting and
    // hot reload deterministic even if its first ready event arrived early.
    send('request-state');
    const retry = window.setTimeout(() => send('request-state'), 500);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(retry);
    };
  }, [frameRef, onClipExtracted, onVilambitError, send]);

  const loaded = player.ready && player.loaded;
  const sourceName = player.source?.name || 'No recording loaded';
  const loopText = player.loop.ready
    ? `Loop ${formatVilambitTime(player.loop.a)}–${formatVilambitTime(player.loop.b)}${player.loop.on ? '' : ' (off)'}`
    : 'Loop not set';

  return (
    <div className="app-practice-bar" aria-label="Vilambit recording controls">
      <div className="app-practice-source" title={sourceName}>
        <span className="app-practice-kicker">Vilambit recording</span>
        <strong>{sourceName}</strong>
      </div>
      <span className="app-practice-time" aria-label="Recording position">
        {formatVilambitTime(player.position)} / {formatVilambitTime(player.duration)}
      </span>
      <div className="app-practice-actions">
        <button type="button" disabled={!loaded} onClick={() => send(player.playing ? 'pause' : 'play')}>
          {player.playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" disabled={!loaded} onClick={() => send('skip', { deltaSeconds: -5 })}>
          −5s
        </button>
        <button type="button" disabled={!loaded} onClick={() => send('skip', { deltaSeconds: 5 })}>
          +5s
        </button>
      </div>
      <span className={'app-practice-loop' + (player.loop.on ? ' is-on' : '')}>{loopText}</span>
      <div className="app-practice-link-actions" aria-label="Linked notation loop actions">
        <button
          type="button"
          className="app-practice-attach"
          disabled={!loaded || !player.loop.ready}
          title="Select notation, set an A–B loop, then attach it"
          onClick={() => onAttachLoop?.(player)}
        >
          Attach Loop
        </button>
        {selectedLink && (
          <>
            <button type="button" onClick={() => onPlayLinked?.(selectedLink)}>Play Linked</button>
            <button
              type="button"
              disabled={!projectOpen || !player.extractable || extracting || Boolean(selectedLink.clipAssetId)}
              title={!projectOpen ? 'Open or create a Project Folder first' : !player.extractable ? 'This browser cannot extract audio from the loaded recording' : selectedLink.clipAssetId ? 'This link already has an extracted clip' : player.source?.kind === 'video' ? 'Capture this source-speed video loop as a small audio clip in real time' : 'Save a source-speed audio clip of this linked A–B range'}
              onClick={() => onExtractClip?.(player, selectedLink)}
            >
              {extracting ? 'Extracting…' : selectedLink.clipAssetId ? 'Clip Saved' : 'Extract Clip'}
            </button>
            <button type="button" onClick={() => onRemoveLinked?.(selectedLink.id)}>Remove Link</button>
          </>
        )}
      </div>
      {selectedLink && (
        <span className="app-practice-linked" title={selectedLink.recording?.name || ''}>
          Linked {formatVilambitTime(selectedLink.startTime)}–{formatVilambitTime(selectedLink.endTime)}{selectedLink.clipAssetId ? ' · clip ready' : ''}
        </span>
      )}
      {player.error && <span className="app-practice-error" title={player.error}>Vilambit error</span>}
      <button type="button" className="app-practice-open" onClick={onOpen}>Open Vilambit</button>
    </div>
  );
}
