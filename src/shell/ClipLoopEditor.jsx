// src/shell/ClipLoopEditor.jsx — non-destructive waveform editor for one
// extracted practice clip. The binary remains unchanged; Save writes only the
// refined in-file loop region to media.json.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MIN_CLIP_LOOP_SECONDS,
  normalizeClipLoopRegion,
  originalClipLoopRegion,
  snapLoopRegionToZeroCrossings,
} from '../engine/clip-loop.js';
import {
  createClipAudioContext,
  decodeClipFile,
  mixdownClipBuffer,
  startDecodedClipLoop,
} from './clip-audio.js';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function preciseTime(value) {
  return `${Math.max(0, Number(value) || 0).toFixed(3)} s`;
}

export default function ClipLoopEditor({ project, clip, file, onSave, onOpenSource, onClose }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const bufferRef = useRef(null);
  const waveformRef = useRef(null);
  const previewRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({ start: 0, end: 0, duration: 0, crossfadeMs: 12 });
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [message, setMessage] = useState('Drag A and B, nudge in milliseconds, then listen before saving.');

  const stopPreview = () => {
    previewRef.current?.stop?.();
    previewRef.current = null;
    setPlaying(false);
  };

  useEffect(() => {
    let cancelled = false;
    const context = createClipAudioContext();
    contextRef.current = context;
    setLoading(true);
    setError(null);
    decodeClipFile(file, context)
      .then(({ buffer }) => {
        if (cancelled) return;
        bufferRef.current = buffer;
        waveformRef.current = mixdownClipBuffer(buffer);
        const region = normalizeClipLoopRegion(clip, buffer.duration);
        if (!region.ok) throw new Error(region.problem);
        setDraft(region);
        setLoading(false);
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason?.message || String(reason));
        setLoading(false);
      });
    return () => {
      cancelled = true;
      previewRef.current?.stop?.();
      previewRef.current = null;
      bufferRef.current = null;
      waveformRef.current = null;
      contextRef.current = null;
      context.close().catch(() => {});
    };
  }, [clip, file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const samples = waveformRef.current;
    if (!canvas || !samples?.length || !draft.duration) return undefined;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext('2d');
      const style = getComputedStyle(canvas);
      const ink = style.getPropertyValue('--sr-ink-soft').trim() || '#666';
      const accent = style.getPropertyValue('--sr-accent').trim() || '#6b7d4d';
      const line = style.getPropertyValue('--sr-line').trim() || '#bbb';
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = line;
      ctx.globalAlpha = 0.18;
      const ax = (draft.start / draft.duration) * width;
      const bx = (draft.end / draft.duration) * width;
      ctx.fillRect(ax, 0, Math.max(1, bx - ax), height);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, ratio);
      ctx.beginPath();
      const columns = Math.max(1, Math.floor(width / Math.max(1, ratio)));
      const samplesPerColumn = Math.max(1, Math.floor(samples.length / columns));
      const center = height / 2;
      for (let column = 0; column < columns; column++) {
        const from = column * samplesPerColumn;
        const to = Math.min(samples.length, from + samplesPerColumn);
        let min = 1;
        let max = -1;
        for (let i = from; i < to; i++) {
          const value = samples[i];
          if (value < min) min = value;
          if (value > max) max = value;
        }
        const x = column * ratio;
        ctx.moveTo(x, center - max * center * 0.88);
        ctx.lineTo(x, center - min * center * 0.88);
      }
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, ratio * 1.5);
      for (const x of [ax, bx]) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    };
    draw();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
    observer?.observe(canvas);
    return () => observer?.disconnect();
  }, [draft]);

  const updateBoundary = (side, value) => {
    stopPreview();
    setDraft((current) => {
      if (side === 'start') {
        return { ...current, start: clamp(value, 0, current.end - MIN_CLIP_LOOP_SECONDS) };
      }
      return { ...current, end: clamp(value, current.start + MIN_CLIP_LOOP_SECONDS, current.duration) };
    });
  };

  const timeFromPointer = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return ratio * draft.duration;
  };

  const onPointerDown = (event) => {
    if (!draft.duration) return;
    const time = timeFromPointer(event);
    const side = Math.abs(time - draft.start) <= Math.abs(time - draft.end) ? 'start' : 'end';
    setDragging(side);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateBoundary(side, time);
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    updateBoundary(dragging, timeFromPointer(event));
  };

  const onPointerUp = (event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(null);
  };

  const nudge = (side, delta) => updateBoundary(side, draft[side] + delta);

  const reset = () => {
    stopPreview();
    const region = originalClipLoopRegion(clip, bufferRef.current?.duration);
    if (region.ok) {
      setDraft((current) => ({ ...current, start: region.start, end: region.end, duration: region.duration }));
      setMessage('Restored the extraction-time phrase boundaries.');
    }
  };

  const togglePreview = async () => {
    if (playing) {
      stopPreview();
      return;
    }
    try {
      const context = contextRef.current;
      if (context.state === 'suspended') await context.resume();
      const session = startDecodedClipLoop({
        context,
        buffer: bufferRef.current,
        start: draft.start,
        end: draft.end,
        crossfadeMs: draft.crossfadeMs,
        onError: (reason) => setError(reason?.message || String(reason)),
      });
      previewRef.current = session;
      setPlaying(true);
      setMessage('Previewing the refined region continuously.');
    } catch (reason) {
      setError(reason?.message || String(reason));
    }
  };

  const save = async () => {
    const samples = waveformRef.current;
    const buffer = bufferRef.current;
    const snapped = snapLoopRegionToZeroCrossings(
      samples,
      buffer.sampleRate,
      draft.start,
      draft.end,
      buffer.duration,
    );
    stopPreview();
    const startShift = Math.round((snapped.start - draft.start) * 1000);
    const endShift = Math.round((snapped.end - draft.end) * 1000);
    setSaving(true);
    try {
      await onSave?.({
        start: snapped.start,
        end: snapped.end,
        duration: buffer.duration,
        crossfadeMs: draft.crossfadeMs,
        snapShiftMs: { start: startShift, end: endShift },
      });
    } finally {
      setSaving(false);
    }
  };

  const clipLength = useMemo(() => Math.max(0, draft.end - draft.start), [draft.end, draft.start]);
  const hasPadding = Number(clip?.paddingBefore) > 0 || Number(clip?.paddingAfter) > 0;

  return (
    <div className="project-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="project-modal clip-loop-editor" role="dialog" aria-modal="true" aria-labelledby="clip-loop-title">
        <header className="project-modal-head">
          <div>
            <span className="project-modal-kicker">{project?.name || 'Project Folder'} · {clip?.id}</span>
            <h2 id="clip-loop-title">Clip Loop Editor</h2>
          </div>
          <button type="button" aria-label="Close Clip Loop Editor" onClick={onClose}>×</button>
        </header>

        <div className="clip-loop-body">
          {loading && <p>Decoding the extracted clip…</p>}
          {error && <p className="clip-loop-error">{error}</p>}
          {!loading && !error && (
            <>
              <p className="clip-loop-help">
                The audio file is unchanged. A and B are saved as reusable practice boundaries in media.json.
                {!hasPadding ? ' This older clip has no spare extraction padding, so it can be shortened but not extended beyond its file.' : ''}
              </p>
              <div className="clip-loop-waveform-wrap">
                <canvas
                  ref={canvasRef}
                  className="clip-loop-waveform"
                  aria-label="Extracted clip waveform with draggable A and B loop boundaries"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
                <span className="clip-loop-handle-label is-a" style={{ left: `${(draft.start / draft.duration) * 100}%` }}>A</span>
                <span className="clip-loop-handle-label is-b" style={{ left: `${(draft.end / draft.duration) * 100}%` }}>B</span>
              </div>

              <div className="clip-loop-readout">
                <strong>A {preciseTime(draft.start)}</strong>
                <span>Loop {preciseTime(clipLength)}</span>
                <strong>B {preciseTime(draft.end)}</strong>
              </div>

              <div className="clip-loop-nudges">
                <fieldset>
                  <legend>Beginning A</legend>
                  <button type="button" onClick={() => nudge('start', -0.1)}>−100 ms</button>
                  <button type="button" onClick={() => nudge('start', -0.01)}>−10 ms</button>
                  <button type="button" onClick={() => nudge('start', 0.01)}>+10 ms</button>
                  <button type="button" onClick={() => nudge('start', 0.1)}>+100 ms</button>
                </fieldset>
                <fieldset>
                  <legend>Ending B</legend>
                  <button type="button" onClick={() => nudge('end', -0.1)}>−100 ms</button>
                  <button type="button" onClick={() => nudge('end', -0.01)}>−10 ms</button>
                  <button type="button" onClick={() => nudge('end', 0.01)}>+10 ms</button>
                  <button type="button" onClick={() => nudge('end', 0.1)}>+100 ms</button>
                </fieldset>
              </div>

              <label className="clip-loop-crossfade">
                Seam smoothing
                <select value={draft.crossfadeMs} onChange={(event) => {
                  stopPreview();
                  setDraft((current) => ({ ...current, crossfadeMs: Number(event.target.value) }));
                }}>
                  <option value="0">Off</option>
                  <option value="5">5 ms</option>
                  <option value="12">12 ms</option>
                  <option value="20">20 ms</option>
                </select>
              </label>
              <p className="clip-loop-message">{message}</p>
            </>
          )}
        </div>

        <footer className="project-modal-actions clip-loop-actions">
          <button type="button" disabled={loading || Boolean(error)} onClick={reset}>Reset</button>
          <button type="button" disabled={loading || Boolean(error)} aria-pressed={playing} onClick={togglePreview}>
            {playing ? 'Stop Preview' : 'Play Loop'}
          </button>
          {onOpenSource && <button type="button" onClick={onOpenSource}>Open Source in Vilambit</button>}
          <span className="clip-loop-action-spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={loading || Boolean(error) || saving} onClick={save}>{saving ? 'Saving…' : 'Save Loop Points'}</button>
        </footer>
      </section>
    </div>
  );
}
