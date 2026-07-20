// src/shell/PracticeBar.jsx — compact remote for the always-mounted Vilambit iframe.
import React, { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_VILAMBIT_STATE,
  formatVilambitTime,
  isExpectedVilambitEvent,
  postVilambitCommand,
  readVilambitMessage,
} from './vilambit-bridge.js';

export default function PracticeBar({ frameRef, onOpen }) {
  const [player, setPlayer] = useState(EMPTY_VILAMBIT_STATE);

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
      if (message) setPlayer(message.state);
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
  }, [frameRef, send]);

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
      {player.error && <span className="app-practice-error" title={player.error}>Vilambit error</span>}
      <button type="button" className="app-practice-open" onClick={onOpen}>Open Vilambit</button>
    </div>
  );
}
