// src/shell/DictateBar.jsx — the input channel for dictation.js (M's idea,
// 2026-07-16: say the composition, get the notation).
//
// TYPING is the reliable path and works offline forever: type what you'd
// say — "sa ga ma pa", "low ni", "komal re" — and it writes the notation.
//
// The MIC is an honest experiment. The Web Speech API is Chrome-only, is
// trained on English (sargam syllables will mangle — the alias table in
// dictation.js is a speculative start, extend it from what you actually
// see), and it SENDS AUDIO TO A SERVER, which is the one place this app
// breaks its own offline principle. It is opt-in per use, never passive,
// and the UI says so. The durable answer is an on-device model trained on
// M's own voice and his students' — offline, tuned to these twelve sounds.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { spokenToAtoms, atomsToText } from '../engine/dictation.js';

const Recognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export default function DictateBar({ raga, onInsert, onClose }) {
  const [words, setWords] = useState('');
  const [joined, setJoined] = useState(false);
  const [listening, setListening] = useState(false);
  const [micUsed, setMicUsed] = useState(false); // spoken input has no case
  const [micNote, setMicNote] = useState(null);
  const inputRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => recRef.current?.stop?.();
  }, []);

  const { atoms, problems } = useMemo(
    () => spokenToAtoms(words, { raga, caselessLetters: micUsed }),
    [words, raga, micUsed]
  );
  const out = atomsToText(atoms, { separator: joined ? '' : ' ' });

  const toggleMic = () => {
    if (!Recognition) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new Recognition();
    recRef.current = rec;
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US'; // no sargam model exists; en-US is the least-bad start
    rec.onresult = (e) => {
      let heard = '';
      for (let i = e.resultIndex; i < e.results.length; i++) heard += e.results[i][0].transcript + ' ';
      setMicUsed(true);
      setWords((w) => (w ? w + ' ' : '') + heard.trim());
    };
    rec.onerror = (e) => {
      setMicNote(`Microphone: ${e.error}. Typing always works.`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
      setMicNote('Listening — this sends audio to a speech server, the one part of Sargam that is not offline.');
    } catch (err) {
      setMicNote('Could not start the microphone. Typing always works.');
    }
  };

  const insert = () => {
    if (out) onInsert(out);
    setWords('');
    setMicUsed(false);
  };

  return (
    <div className="dict">
      <span className="dict-label">Dictate</span>
      <input
        ref={inputRef}
        className="dict-input"
        value={words}
        placeholder="sa ga ma pa · 1 2 3 4 · low ni · komal re · high sa"
        onChange={(e) => setWords(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') insert();
          if (e.key === 'Escape') onClose();
        }}
      />
      {Recognition && (
        <button
          className={'tb-btn dict-mic' + (listening ? ' on' : '')}
          onClick={toggleMic}
          title="Experimental — Chrome only, and sends audio to a server"
        >
          {listening ? '● listening' : '🎤 try mic'}
        </button>
      )}
      <span className="dict-arrow">→</span>
      <code className="dict-out">{out || '…'}</code>
      <label className="tp-check">
        <input type="checkbox" checked={joined} onChange={(e) => setJoined(e.target.checked)} />
        one beat
      </label>
      <button className="tb-btn dict-primary" onClick={insert} disabled={!out}>
        Insert
      </button>
      <button className="tb-btn" onClick={onClose}>
        Close
      </button>
      {(problems.length > 0 || micNote) && (
        <span className="dict-problem">{micNote || problems[0]}</span>
      )}
    </div>
  );
}
