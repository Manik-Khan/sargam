// src/shell/NewDocDialog.jsx — the new-composition form (spec §3.1, M2.5).
// Every field optional; the preview shows exactly the text that will be
// written (text is the source of truth, so the form shows the text);
// "Blank document" escapes the form entirely — the scratchpad is the
// daily case and must never be gated behind five fields.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { newDocumentText } from '../engine/files.js';
import { TALS } from '../engine/tala.js';

const LAYAS = ['vilambit', 'madhya', 'drut'];
const COMPOSITIONS = ['vocal', 'instrumental'];

export default function NewDocDialog({ onCreate, onCancel }) {
  const [raga, setRaga] = useState('');
  const [tal, setTal] = useState('tintal');
  const [tempo, setTempo] = useState('');
  const [composition, setComposition] = useState(null);
  const [laya, setLaya] = useState(null);
  const firstField = useRef(null);

  useEffect(() => {
    firstField.current?.focus();
    const esc = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);

  const text = useMemo(
    () => newDocumentText({ raga, tal, tempo, composition, laya }),
    [raga, tal, tempo, composition, laya]
  );

  // Tal names, aliases folded out (aliases point at the same object).
  const talNames = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const [key, t] of Object.entries(TALS)) {
      if (seen.has(t.name)) continue;
      seen.add(t.name);
      out.push(key === t.name ? key : t.name);
    }
    return out;
  }, []);

  const toggle = (cur, val, set) => set(cur === val ? null : val);

  return (
    <div className="nd-scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="nd-dialog" role="dialog" aria-label="New composition">
        <h2 className="nd-h">New composition</h2>
        <p className="nd-sub">Fill what applies — every field is optional.</p>

        <div className="nd-field">
          <label htmlFor="nd-raga">Raga</label>
          <input
            id="nd-raga"
            ref={firstField}
            value={raga}
            placeholder="Kirwani"
            onChange={(e) => setRaga(e.target.value)}
          />
        </div>

        <div className="nd-row2">
          <div className="nd-field">
            <label htmlFor="nd-tal">Tala</label>
            <select id="nd-tal" value={tal} onChange={(e) => setTal(e.target.value)}>
              {talNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="free">free (unmetered)</option>
              <option value="">— none —</option>
            </select>
          </div>
          <div className="nd-field">
            <label htmlFor="nd-tempo">BPM</label>
            <input
              id="nd-tempo"
              value={tempo}
              placeholder="60"
              inputMode="numeric"
              onChange={(e) => setTempo(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
        </div>

        <div className="nd-field">
          <label>Composition</label>
          <div className="nd-seg">
            {COMPOSITIONS.map((c) => (
              <button
                key={c}
                type="button"
                className={composition === c ? 'on' : ''}
                aria-pressed={composition === c}
                onClick={() => toggle(composition, c, setComposition)}
              >
                {c[0].toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="nd-field">
          <label>Laya</label>
          <div className="nd-seg">
            {LAYAS.map((l) => (
              <button
                key={l}
                type="button"
                className={laya === l ? 'on' : ''}
                aria-pressed={laya === l}
                onClick={() => toggle(laya, l, setLaya)}
              >
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="nd-preview-cap">Writes:</div>
        <pre className="nd-preview">{text === '' ? '(a blank document)' : text.trimEnd()}</pre>

        <div className="nd-actions">
          <button className="tb-btn nd-primary" onClick={() => onCreate(text)}>
            Create
          </button>
          <button className="tb-btn" onClick={() => onCreate('')}>
            Blank document
          </button>
          <button className="tb-btn nd-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
