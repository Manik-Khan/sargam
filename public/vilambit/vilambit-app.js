'use strict';
/* =========================================================================
   Vilambit v2 — the musician's practice player
   Single file, no network, nothing leaves the machine.

   Engines:
   A) Audio files  — Signalsmith Stretch (WASM AudioWorklet) in buffer mode:
      full-quality time-stretch AND pitch-shift, sample-accurate looping.
   B) Video files  — native pitch-preserving playbackRate for speed;
      Signalsmith Stretch in live mode for pitch.
   C) Fallback     — if the worklet can't start: native stretch for speed,
      granular dual-tap shifter for pitch (v1 engine).

   Export renders offline through the same engine (WAV / FLAC), or does a
   bit-clean trim when processing is unticked.
   ========================================================================= */

const $ = id => document.getElementById(id);
const media = $('media');
const Core = window.VilambitCore;
if (!Core) throw new Error('VilambitCore must load before vilambit-app.js');

const state = {
  fileURL: null, fileName: '', fileSize: null, fileLastModified: null, isVideo: false,
  engine: 'none',            // 'buffer' | 'video' | 'fallback'
  tempo: 100, semitones: 0, cents: 0,
  loopA: null, loopB: null, loopOn: false,
  markers: [], duration: 0, peaks: null,
  decoded: null,             // AudioBuffer (for waveform / detection / export)
  playing: false, posPaused: 0,
  detected: null,            // {hz, note, octave, cents, midi}
  regions: [],               // [{start, end, pct}]
  bpm: null,                 // {bpm, period, phaseAbs, confidence, tapped?}
  exportScope: 'sel',
  viewStart: 0, viewEnd: 0, followPlayhead: false,
};

/* ---------------- shared audio context & nodes ---------------- */
let actx = null, master = null;
let stretch = null;          // Signalsmith node (buffer or live mode)
let srcNode = null;          // MediaElementSource (video / fallback)
let granular = null, dryGain = null, wetGain = null;   // fallback shifter
let realtimeCaptureActive = false;
const GRAIN = 4096, RB_SIZE = 1 << 16, RB_MASK = RB_SIZE - 1;

async function buildGraph(){
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain();
  master.gain.value = parseFloat($('vol').value);
  master.connect(actx.destination);

  if (!state.isVideo && state.decoded){
    // Engine A: buffer playback through the stretch worklet
    try {
      stretch = await SignalsmithStretch(actx, { numberOfInputs: 0, outputChannelCount: [2] });
      stretch.addBuffers(bufferChannels(state.decoded));
      stretch.setUpdateInterval(0.05);
      stretch.connect(master);
      state.engine = 'buffer';
      setBadge('engine: full-quality');
      return;
    } catch (e) { console.warn('stretch worklet unavailable, falling back', e); }
  }

  // Engine B / C: media element drives playback
  srcNode = actx.createMediaElementSource(media);
  let liveOk = false;
  if (window.SignalsmithStretch){
    try {
      stretch = await SignalsmithStretch(actx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      dryGain = actx.createGain(); wetGain = actx.createGain();
      dryGain.gain.value = 1; wetGain.gain.value = 0;
      srcNode.connect(dryGain);  dryGain.connect(master);
      srcNode.connect(stretch);  stretch.connect(wetGain); wetGain.connect(master);
      stretch.start();
      liveOk = true;
      state.engine = 'video';
      setBadge('engine: video + live pitch');
    } catch (e) { console.warn('live stretch unavailable', e); }
  }
  if (!liveOk){
    buildGranular();
    state.engine = 'fallback';
    setBadge('engine: compatibility');
  }
  applyPitch();
}

function bufferChannels(ab){
  const c0 = ab.getChannelData(0);
  const c1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : c0;
  return [c0, c1];
}

function setBadge(t){ $('engineBadge').textContent = t; }

function preferredCaptureMimeType(){
  if (!window.MediaRecorder) return '';
  const supported = typeof window.MediaRecorder.isTypeSupported === 'function'
    ? (type) => window.MediaRecorder.isTypeSupported(type)
    : () => true;
  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ].find(supported) || '';
}

function extensionForMimeType(mimeType){
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

function canCaptureMediaElement(){
  const Context = window.AudioContext || window.webkitAudioContext;
  return Boolean(
    window.MediaRecorder &&
    Context &&
    Context.prototype &&
    typeof Context.prototype.createMediaStreamDestination === 'function'
  );
}

function seekMediaElement(target){
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      media.removeEventListener('seeked', finish);
      resolve();
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      media.removeEventListener('seeked', finish);
      reject(error);
    };
    const timer = window.setTimeout(() => {
      if (Math.abs(media.currentTime - target) <= 0.08) finish();
      else fail(new Error('The recording did not seek to the clip start in time.'));
    }, 4000);
    media.addEventListener('seeked', finish);
    try {
      media.currentTime = target;
      if (Math.abs(media.currentTime - target) <= 0.02 && media.readyState >= 2) {
        queueMicrotask(finish);
      }
    } catch (error) {
      fail(error);
    }
  });
}

function waitForMediaRangeEnd(target, durationSeconds){
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const timeoutMs = Math.max(5000, (durationSeconds + 8) * 1000);
    const check = () => {
      if (media.ended || media.currentTime >= target - 0.02) {
        resolve();
        return;
      }
      if (performance.now() - startedAt >= timeoutMs) {
        reject(new Error('Real-time clip capture timed out before reaching the loop end.'));
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

async function captureMediaRangeRealtime(startTime, endTime){
  if (!canCaptureMediaElement()) {
    throw new Error('This browser cannot capture audio from the loaded recording.');
  }

  const wasPaused = media.paused;
  const previousTime = Number.isFinite(media.currentTime) ? media.currentTime : state.posPaused;
  const previousRate = Number.isFinite(media.playbackRate) ? media.playbackRate : 1;
  const previousLoopOn = state.loopOn;
  const previousMasterGain = master ? master.gain.value : 1;
  const previousLastEff = lastEff;
  let destination = null;
  let recorder = null;
  let chunks = [];

  realtimeCaptureActive = true;
  try {
    if (!actx || !srcNode) await buildGraph();
    if (!actx || !srcNode) throw new Error('Vilambit could not prepare the recording for real-time clip capture.');
    if (actx.state === 'suspended') await actx.resume();

    destination = actx.createMediaStreamDestination();
    srcNode.connect(destination);

    const mimeType = preferredCaptureMimeType();
    recorder = mimeType
      ? new MediaRecorder(destination.stream, { mimeType })
      : new MediaRecorder(destination.stream);

    const stopped = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener('stop', resolve, { once: true });
      recorder.addEventListener('error', (event) => {
        reject(event.error || new Error('The browser could not record this clip.'));
      }, { once: true });
    });

    state.loopOn = false;
    applyLoopToEngine();
    renderLoop();
    media.pause();
    if (master) master.gain.setValueAtTime(0, actx.currentTime);
    media.playbackRate = 1;
    try { media.preservesPitch = true; } catch(_){}
    try { media.webkitPreservesPitch = true; } catch(_){}
    try { media.mozPreservesPitch = true; } catch(_){}

    await seekMediaElement(startTime);
    recorder.start(250);
    await media.play();
    await waitForMediaRangeEnd(endTime, endTime - startTime);
    media.pause();
    recorder.stop();
    await stopped;

    const actualMimeType = recorder.mimeType || mimeType || chunks[0]?.type || 'audio/webm';
    const blob = new Blob(chunks, { type: actualMimeType });
    if (!blob.size) throw new Error('The browser captured an empty audio clip.');
    return {
      blob,
      mimeType: actualMimeType,
      extension: extensionForMimeType(actualMimeType),
    };
  } finally {
    media.pause();
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch(_){}
    }
    if (destination && srcNode) {
      try { srcNode.disconnect(destination); } catch(_){}
    }
    if (master && actx) master.gain.setValueAtTime(previousMasterGain, actx.currentTime);
    state.loopOn = previousLoopOn;
    renderLoop();
    applyLoopToEngine();
    media.playbackRate = previousRate;
    lastEff = previousLastEff;
    try { media.currentTime = previousTime; } catch(_){}
    state.posPaused = previousTime;
    realtimeCaptureActive = false;
    if (!wasPaused) {
      try { await media.play(); } catch(_){}
    }
  }
}

/* granular dual-tap pitch shifter — fallback only */
function buildGranular(){
  const ringL = new Float32Array(RB_SIZE), ringR = new Float32Array(RB_SIZE);
  let wIdx = 0, phase = GRAIN / 2;
  const sh = { ratio: 1 };
  const node = actx.createScriptProcessor(4096, 2, 2);
  node.onaudioprocess = (e) => {
    const inL = e.inputBuffer.getChannelData(0);
    const inR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inL;
    const outL = e.outputBuffer.getChannelData(0);
    const outR = e.outputBuffer.getChannelData(1);
    const n = inL.length;
    for (let i = 0; i < n; i++){ ringL[(wIdx+i)&RB_MASK] = inL[i]; ringR[(wIdx+i)&RB_MASK] = inR[i]; }
    const ratio = sh.ratio, slope = 1 - ratio;
    for (let i = 0; i < n; i++){
      if (ratio !== 1){
        phase += slope;
        if (phase >= GRAIN) phase -= GRAIN; else if (phase < 0) phase += GRAIN;
      } else if (phase !== GRAIN/2){ phase = GRAIN/2; }
      const d1 = phase, d2 = (phase + GRAIN/2) % GRAIN;
      const s = Math.sin(Math.PI * d1 / GRAIN);
      const w1 = s*s, w2 = 1 - w1;
      const base = wIdx + i - 1;
      let p = base - d1, i0 = Math.floor(p), fr = p - i0;
      const l1 = ringL[i0&RB_MASK]*(1-fr) + ringL[(i0+1)&RB_MASK]*fr;
      const r1 = ringR[i0&RB_MASK]*(1-fr) + ringR[(i0+1)&RB_MASK]*fr;
      p = base - d2; i0 = Math.floor(p); fr = p - i0;
      const l2 = ringL[i0&RB_MASK]*(1-fr) + ringL[(i0+1)&RB_MASK]*fr;
      const r2 = ringR[i0&RB_MASK]*(1-fr) + ringR[(i0+1)&RB_MASK]*fr;
      outL[i] = l1*w1 + l2*w2; outR[i] = r1*w1 + r2*w2;
    }
    wIdx = (wIdx + n) & RB_MASK;
  };
  dryGain = actx.createGain(); wetGain = actx.createGain();
  dryGain.gain.value = 1; wetGain.gain.value = 0;
  srcNode.connect(dryGain); dryGain.connect(master);
  srcNode.connect(node); node.connect(wetGain); wetGain.connect(master);
  granular = { node, params: sh };
}

/* ---------------- parameter application ---------------- */
function totalSemis(){ return state.semitones + state.cents / 100; }

function regionAt(t){ return state.regions.find(r => t >= r.start && t < r.end) || null; }
function effRateAt(t){ const r = regionAt(t); return (state.tempo / 100) * (r ? r.pct / 100 : 1); }
let lastEff = null;
function setEngineRate(eff){
  lastEff = eff;
  if (state.engine === 'buffer' && stretch){
    if (state.playing) stretch.schedule({ rate: eff, semitones: totalSemis() });
  } else {
    media.playbackRate = eff;
    try { media.preservesPitch = true; } catch(_){}
    try { media.webkitPreservesPitch = true; } catch(_){}
    try { media.mozPreservesPitch = true; } catch(_){}
  }
}
function applyTempo(v){
  state.tempo = Core.clampTempo(v);
  $('tempo').value = state.tempo;
  $('tempoVal').textContent = state.tempo;
  setEngineRate(effRateAt(pos()));
  renderBpm();
}

function applyPitch(){
  const st = totalSemis();
  $('pitchVal').textContent =
    (state.semitones >= 0 ? '+' : '') + state.semitones + ' st, ' +
    (state.cents >= 0 ? '+' : '') + state.cents + ' ¢';
  $('stVal').textContent = state.semitones;
  $('centsVal').textContent = state.cents + ' ¢';
  if (typeof renderTuneLive === 'function') renderTuneLive();
  if (!actx) return;
  if (state.engine === 'buffer' && stretch){
    if (state.playing) stretch.schedule({ rate: lastEff != null ? lastEff : effRateAt(pos()), semitones: st });
    return;
  }
  const t = actx.currentTime;
  if (state.engine === 'video' && stretch){
    stretch.schedule({ semitones: st, active: true });
    if (st === 0){ dryGain.gain.setTargetAtTime(1, t, 0.02); wetGain.gain.setTargetAtTime(0, t, 0.02); }
    else        { dryGain.gain.setTargetAtTime(0, t, 0.02); wetGain.gain.setTargetAtTime(1, t, 0.02); }
  } else if (state.engine === 'fallback' && granular){
    if (st === 0){
      dryGain.gain.setTargetAtTime(1, t, 0.02); wetGain.gain.setTargetAtTime(0, t, 0.02);
      granular.params.ratio = 1;
    } else {
      granular.params.ratio = Math.pow(2, st / 12);
      dryGain.gain.setTargetAtTime(0, t, 0.02); wetGain.gain.setTargetAtTime(1, t, 0.02);
    }
  }
}

function applyLoopToEngine(){
  if (state.engine === 'buffer' && stretch){
    if (state.loopOn && state.loopA != null && state.loopB != null){
      stretch.schedule({ loopStart: state.loopA, loopEnd: state.loopB });
    } else {
      stretch.schedule({ loopStart: 0, loopEnd: 0 });
    }
  }
  /* media engines enforce the loop in tick() */
}

/* ---------------- position abstraction ---------------- */
function pos(){
  return Core.currentPosition({
    engine: state.engine,
    playing: state.playing,
    bufferInputTime: stretch ? stretch.inputTime : 0,
    pausedPosition: state.posPaused,
    mediaTime: media.currentTime,
    duration: state.duration,
  });
}

function seekTo(t){
  const plan = Core.planSeek({
    engine: state.engine,
    target: t,
    duration: state.duration,
  });
  t = plan.position;
  // Before first play the eventual engine is unknown. Core.planSeek keeps
  // M's confirmed 2026-07-16 fix by writing both future position stores.
  if (plan.writePausedPosition) state.posPaused = t;
  if (plan.writeMediaTime){
    try { media.currentTime = t; } catch (e) { /* metadata not in yet — posPaused carries it */ }
  }
  if (plan.scheduleBufferInput && stretch){
    lastEff = effRateAt(t);
    stretch.schedule({ input: t, rate: lastEff, semitones: totalSemis(), active: state.playing });
  }
  followWaveAt(t, true);
  if (state.duration) drawWave();
}

async function togglePlay(){
  if (!state.fileURL) return;
  const first = !actx; // buildGraph() chooses the engine on the first play
  await buildGraph();
  if (actx.state === 'suspended') await actx.resume();
  // The engine has just been chosen; a seek made before now was written to
  // BOTH stores (see seekTo), so hand the media element the position the
  // buffer store carries — and vice versa — rather than starting from 0.
  if (first){
    if (state.engine === 'buffer'){
      if (!state.posPaused && media.currentTime) state.posPaused = media.currentTime;
    } else if (state.posPaused && !media.currentTime){
      try { media.currentTime = state.posPaused; } catch (e) { /* not seekable yet */ }
    }
  }
  if (state.engine === 'buffer'){
    if (state.playing){
      state.posPaused = stretch.inputTime || state.posPaused;
      stretch.schedule({ active: false });
      state.playing = false;
    } else {
      if (state.posPaused >= state.duration - 0.05) state.posPaused = 0;
      lastEff = effRateAt(state.posPaused);
      stretch.schedule({ active: true, input: state.posPaused, rate: lastEff, semitones: totalSemis() });
      applyLoopToEngine();
      state.playing = true;
    }
    paintPlayBtn();
  } else {
    if (media.paused) media.play(); else media.pause();
  }
}
function paintPlayBtn(){
  const on = state.engine === 'buffer' ? state.playing : !media.paused;
  $('playBtn').textContent = on ? '❚❚' : '▶';
  $('playBtn').classList.toggle('playing', on);
}
media.addEventListener('play', paintPlayBtn);
media.addEventListener('pause', paintPlayBtn);

/* ---------------- file loading ---------------- */
function loadFile(file){
  if (!file) return;
  if (state.playing && stretch) { stretch.schedule({ active: false }); }
  state.playing = false; state.posPaused = 0;
  if (state.fileURL) URL.revokeObjectURL(state.fileURL);
  Object.assign(state, {
    fileURL: URL.createObjectURL(file), fileName: file.name,
    fileSize: Number.isFinite(Number(file.size)) ? Number(file.size) : null,
    duration: 0, isVideo: false,
    fileLastModified: Number.isFinite(Number(file.lastModified)) ? Number(file.lastModified) : null,
    peaks: null, decoded: null, detected: null,
    loopA: null, loopB: null, loopOn: false, markers: [],
    regions: [], bpm: null,
    viewStart: 0, viewEnd: 0, followPlayhead: false,
  });
  lastEff = null;
  renderMarkers(); renderLoop(); renderTune(); renderRegions(); renderBpm();
  $('expWav').disabled = $('expFlac').disabled = true;
  $('exportStatus').textContent = ''; $('exportStatus').className = '';

  media.src = state.fileURL;
  media.load();
  $('fileName').textContent = file.name;
  $('dropzone').style.display = 'none';
  ['transport','controls','waveWrap'].forEach(id => $(id).classList.add('on'));

  media.addEventListener('loadedmetadata', () => {
    state.isVideo = media.videoWidth > 0;
    $('videoWrap').classList.toggle('on', state.isVideo);
    if (state.isVideo || !state.decoded){
      state.duration = media.duration || 0;
      $('dur').textContent = fmt(state.duration);
      resetWaveView();
    }
    // engine choice happens on first play; rebuild if a file type flips engines
    if (actx && ((state.isVideo && state.engine === 'buffer') || (!state.isVideo && state.engine !== 'buffer'))){
      // simplest correct path: reload the page state on engine flip
      location.reload();
      return;
    }
    if (stretch && state.engine === 'buffer'){
      stretch.dropBuffers();
      if (state.decoded) stretch.addBuffers(bufferChannels(state.decoded));
    }
    applyTempo(state.tempo);
    sizeWave(); drawWave();
  }, { once: true });

  file.arrayBuffer().then(buf => {
    const dctx = new (window.AudioContext || window.webkitAudioContext)();
    return dctx.decodeAudioData(buf.slice(0)).then(ab => {
      state.decoded = ab;
      if (!state.isVideo){
        state.duration = ab.duration;
        $('dur').textContent = fmt(ab.duration);
        if (!state.viewEnd) resetWaveView();
      }
      computePeaks(ab);
      $('expWav').disabled = $('expFlac').disabled = false;
      if (stretch && state.engine === 'buffer'){
        stretch.dropBuffers();
        stretch.addBuffers(bufferChannels(ab));
      }
      invalidateWaveCache(); drawWave();
      return dctx.close();
    });
  }).catch(() => {
    $('exportStatus').textContent = 'Could not decode audio track — waveform, tuning and export unavailable for this file.';
  });
}

/* ---------------- waveform ---------------- */
const wave = $('wave');
const wctx = wave.getContext && wave.getContext('2d');
let waveCache = null, waveActiveCache = null;

function invalidateWaveCache(){
  waveCache = null;
  waveActiveCache = null;
}

function currentWaveView(){
  return Core.normalizeViewWindow(
    state.viewStart,
    state.viewEnd || state.duration,
    state.duration,
    0.25,
  );
}

function setWaveView(start, end, { draw = true } = {}){
  const view = Core.normalizeViewWindow(start, end, state.duration, 0.25);
  const changed = Math.abs(view.start - state.viewStart) > 1e-6 || Math.abs(view.end - state.viewEnd) > 1e-6;
  state.viewStart = view.start;
  state.viewEnd = view.end;
  if (changed) invalidateWaveCache();
  renderWaveViewControls(view);
  if (draw) drawWave();
  return view;
}

function resetWaveView(){
  return setWaveView(0, state.duration || 0);
}

function zoomWave(factor, center = null){
  if (!state.duration) return;
  const view = currentWaveView();
  const pivot = center == null
    ? (pos() >= view.start && pos() <= view.end ? pos() : (view.start + view.end) / 2)
    : center;
  const next = Core.zoomViewWindow({
    viewStart: view.start,
    viewEnd: view.end,
    duration: state.duration,
    center: pivot,
    factor,
    minSpan: 0.25,
  });
  setWaveView(next.start, next.end);
}

function panWave(deltaSeconds){
  if (!state.duration) return;
  const view = currentWaveView();
  const next = Core.panViewWindow({
    viewStart: view.start,
    viewEnd: view.end,
    duration: state.duration,
    deltaSeconds,
    minSpan: 0.25,
  });
  setWaveView(next.start, next.end);
}

function fitLoopInWave(){
  if (state.loopA == null || state.loopB == null) return;
  const span = Math.max(0.01, state.loopB - state.loopA);
  const padding = Math.max(0.25, span * 0.18);
  setWaveView(state.loopA - padding, state.loopB + padding);
}

function followWaveAt(time, force = false){
  if (!state.followPlayhead || !state.duration || drag) return;
  const view = currentWaveView();
  const next = force
    ? Core.zoomViewWindow({
        viewStart: view.start,
        viewEnd: view.end,
        duration: state.duration,
        center: time,
        factor: 1,
        minSpan: 0.25,
      })
    : Core.ensureTimeVisible({
        viewStart: view.start,
        viewEnd: view.end,
        duration: state.duration,
        time,
        marginRatio: 0.12,
        minSpan: 0.25,
      });
  if (Math.abs(next.start - view.start) > 1e-6 || Math.abs(next.end - view.end) > 1e-6){
    setWaveView(next.start, next.end, { draw: false });
  }
}

function renderWaveViewControls(view = currentWaveView()){
  const range = $('waveViewRange');
  if (range){
    range.textContent = state.duration
      ? `${fmtPrecise(view.start)} – ${fmtPrecise(view.end)} · ${formatSpan(view.span)} visible`
      : 'No recording loaded';
  }
  if ($('waveZoomOut')) $('waveZoomOut').disabled = !state.duration || view.full;
  if ($('waveZoomAll')) $('waveZoomAll').disabled = !state.duration || view.full;
  if ($('wavePanBack')) $('wavePanBack').disabled = !state.duration || view.full || view.start <= 1e-6;
  if ($('wavePanForward')) $('wavePanForward').disabled = !state.duration || view.full || view.end >= state.duration - 1e-6;
  if ($('waveZoomLoop')) $('waveZoomLoop').disabled = state.loopA == null || state.loopB == null;
  if ($('waveFollow')) $('waveFollow').checked = Boolean(state.followPlayhead);
}

function sizeWave(){
  if (!wctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = wave.clientWidth || wave.parentElement.clientWidth || 800;
  wave.width = Math.round(w * dpr);
  wave.height = Math.round(150 * dpr);
  invalidateWaveCache();
}

function computePeaks(ab){
  const cols = 1600;
  const ch0 = ab.getChannelData(0);
  const ch1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : ch0;
  const step = Math.max(1, Math.floor(ch0.length / cols));
  const peaks = new Array(cols);
  for (let c = 0; c < cols; c++){
    let mn = 1, mx = -1;
    const s0 = c * step, s1 = Math.min(ch0.length, s0 + step);
    for (let sample = s0; sample < s1; sample += Math.max(1, Math.floor(step / 24))){
      const value = (ch0[sample] + ch1[sample]) * 0.5;
      if (value < mn) mn = value;
      if (value > mx) mx = value;
    }
    peaks[c] = mn <= mx ? [mn, mx] : [0, 0];
  }
  state.peaks = peaks;
  invalidateWaveCache();
}

function getCss(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

function drawDecodedWave(context, view, color){
  const ab = state.decoded;
  if (!ab || !view.span) return false;
  const W = wave.width, H = wave.height, mid = H / 2;
  const ch0 = ab.getChannelData(0);
  const ch1 = ab.numberOfChannels > 1 ? ab.getChannelData(1) : ch0;
  const sr = ab.sampleRate;
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x < W; x++){
    const t0 = view.start + x / W * view.span;
    const t1 = view.start + (x + 1) / W * view.span;
    const s0 = Math.max(0, Math.floor(t0 * sr));
    const s1 = Math.min(ch0.length, Math.max(s0 + 1, Math.ceil(t1 * sr)));
    const stride = Math.max(1, Math.floor((s1 - s0) / 24));
    let mn = 1, mx = -1;
    for (let sample = s0; sample < s1; sample += stride){
      const value = (ch0[sample] + ch1[sample]) * 0.5;
      if (value < mn) mn = value;
      if (value > mx) mx = value;
    }
    if (mn > mx) mn = mx = 0;
    const y1 = mid + mn * mid * 0.92;
    const y2 = mid + mx * mid * 0.92;
    context.moveTo(x + 0.5, y1);
    context.lineTo(x + 0.5, Math.max(y2, y1 + 1));
  }
  context.stroke();
  return true;
}

function drawSummaryPeaks(context, view, color){
  if (!state.peaks || !view.span || !state.duration) return false;
  const W = wave.width, H = wave.height, mid = H / 2, n = state.peaks.length;
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x < W; x++){
    const time = view.start + (x + 0.5) / W * view.span;
    const index = Math.min(n - 1, Math.max(0, Math.floor(time / state.duration * n)));
    const peak = state.peaks[index] || [0, 0];
    const y1 = mid + peak[0] * mid * 0.92;
    const y2 = mid + peak[1] * mid * 0.92;
    context.moveTo(x + 0.5, y1);
    context.lineTo(x + 0.5, Math.max(y2, y1 + 1));
  }
  context.stroke();
  return true;
}

function paintWaveCache(context, view, color){
  context.fillStyle = getCss('--panel-2');
  context.fillRect(0, 0, wave.width, wave.height);
  if (drawDecodedWave(context, view, color)) return;
  if (drawSummaryPeaks(context, view, color)) return;
  context.strokeStyle = getCss('--line');
  context.beginPath();
  context.moveTo(0, wave.height / 2);
  context.lineTo(wave.width, wave.height / 2);
  context.stroke();
}

function drawWaveStatic(){
  const view = currentWaveView();
  waveCache = document.createElement('canvas');
  waveCache.width = wave.width;
  waveCache.height = wave.height;
  paintWaveCache(waveCache.getContext('2d'), view, getCss('--wave-dim'));

  waveActiveCache = document.createElement('canvas');
  waveActiveCache.width = wave.width;
  waveActiveCache.height = wave.height;
  paintWaveCache(waveActiveCache.getContext('2d'), view, getCss('--wave'));
}

function waveTimeToCanvasX(time, view = currentWaveView()){
  return view.span ? (time - view.start) / view.span * wave.width : 0;
}

function waveTimeToCssX(time, view = currentWaveView()){
  return view.span ? (time - view.start) / view.span * waveWidthCss() : 0;
}

function timeInView(time, view = currentWaveView()){
  return time >= view.start - 1e-9 && time <= view.end + 1e-9;
}

function drawWave(){
  if (!wctx) return;
  if (!wave.width) sizeWave();
  if (!waveCache || !waveActiveCache) drawWaveStatic();
  const W = wave.width, H = wave.height;
  const view = currentWaveView();
  wctx.drawImage(waveCache, 0, 0);

  const playhead = pos();
  const playedX = Math.min(W, Math.max(0, waveTimeToCanvasX(playhead, view)));
  if (playedX > 0){
    wctx.drawImage(waveActiveCache, 0, 0, playedX, H, 0, 0, playedX, H);
  }

  const dpr = window.devicePixelRatio || 1;
  for (const region of state.regions){
    const start = Math.max(view.start, region.start);
    const end = Math.min(view.end, region.end);
    if (end <= start) continue;
    const ra = waveTimeToCanvasX(start, view), rb = waveTimeToCanvasX(end, view);
    wctx.fillStyle = 'rgba(91,140,168,0.16)';
    wctx.fillRect(ra, 0, rb - ra, H);
    wctx.fillStyle = '#5b8ca8';
    wctx.fillRect(ra, 0, 1.5, H);
    wctx.fillRect(rb - 1.5, 0, 1.5, H);
    if (rb - ra > 34){
      wctx.font = Math.round(10 * dpr) + 'px monospace';
      wctx.fillText(region.pct + '%', ra + 4 * dpr, 11 * dpr);
    }
  }

  if (state.bpm){
    const period = state.bpm.period;
    const step = period * Math.max(1, Math.ceil((view.span / period) / 600));
    wctx.fillStyle = 'rgba(159,176,198,0.35)';
    const first = state.bpm.phaseAbs + Math.ceil((view.start - state.bpm.phaseAbs) / step) * step;
    for (let time = first; time <= view.end; time += step){
      wctx.fillRect(waveTimeToCanvasX(time, view), H - 10 * dpr, 1, 10 * dpr);
    }
  }

  if (state.loopA != null && state.loopB != null){
    const start = Math.max(view.start, state.loopA);
    const end = Math.min(view.end, state.loopB);
    if (end > start){
      const a = waveTimeToCanvasX(start, view), b = waveTimeToCanvasX(end, view);
      wctx.fillStyle = state.loopOn ? getCss('--madder-soft') : 'rgba(194,91,78,0.10)';
      wctx.fillRect(a, 0, b - a, H);
    }
    wctx.fillStyle = getCss('--madder');
    if (timeInView(state.loopA, view)){
      const a = waveTimeToCanvasX(state.loopA, view);
      wctx.fillRect(a, 0, 2, H);
      wctx.fillRect(a - 3 * dpr, 0, 9 * dpr, 12 * dpr);
    }
    if (timeInView(state.loopB, view)){
      const b = waveTimeToCanvasX(state.loopB, view);
      wctx.fillRect(b - 2, 0, 2, H);
      wctx.fillRect(b - 6 * dpr, H - 12 * dpr, 9 * dpr, 12 * dpr);
    }
  } else if (state.loopA != null && timeInView(state.loopA, view)){
    wctx.fillStyle = getCss('--madder');
    wctx.fillRect(waveTimeToCanvasX(state.loopA, view), 0, 2, H);
  }

  wctx.fillStyle = getCss('--brass');
  for (const marker of state.markers){
    if (!timeInView(marker.t, view)) continue;
    const mx = waveTimeToCanvasX(marker.t, view);
    wctx.fillRect(mx, 0, 1.5, H);
    wctx.beginPath();
    wctx.moveTo(mx, 0);
    wctx.lineTo(mx + 8, 0);
    wctx.lineTo(mx, 10);
    wctx.closePath();
    wctx.fill();
  }

  if (timeInView(playhead, view)){
    const px = waveTimeToCanvasX(playhead, view);
    wctx.fillStyle = getCss('--brass');
    wctx.fillRect(px - 1, 0, 2.5, H);
  } else {
    const edge = playhead < view.start ? 0 : W;
    wctx.fillStyle = getCss('--brass');
    wctx.beginPath();
    if (edge === 0){
      wctx.moveTo(0, H / 2);
      wctx.lineTo(8 * dpr, H / 2 - 6 * dpr);
      wctx.lineTo(8 * dpr, H / 2 + 6 * dpr);
    } else {
      wctx.moveTo(W, H / 2);
      wctx.lineTo(W - 8 * dpr, H / 2 - 6 * dpr);
      wctx.lineTo(W - 8 * dpr, H / 2 + 6 * dpr);
    }
    wctx.closePath();
    wctx.fill();
  }
}

/* drag anywhere = selection · drag handles/markers to move · double-tap = seek */
const HIT_PX = 10;
function waveWidthCss(){ return wave.clientWidth || wave.getBoundingClientRect().width || 1; }
function hitTest(xCss, wCss){
  if (!state.duration) return { mode: 'none' };
  const view = currentWaveView();
  const candidates = [];
  if (state.loopA != null && timeInView(state.loopA, view)) candidates.push({ mode: 'a', d: Math.abs(xCss - waveTimeToCssX(state.loopA, view)) });
  if (state.loopB != null && timeInView(state.loopB, view)) candidates.push({ mode: 'b', d: Math.abs(xCss - waveTimeToCssX(state.loopB, view)) });
  state.markers.forEach((marker, index) => {
    if (timeInView(marker.t, view)) candidates.push({ mode: 'marker', idx: index, d: Math.abs(xCss - waveTimeToCssX(marker.t, view)) + 2 });
  });
  candidates.sort((left, right) => left.d - right.d);
  if (candidates.length && candidates[0].d <= HIT_PX) return { mode: candidates[0].mode, idx: candidates[0].idx };
  return { mode: 'select' };
}

let drag = null, lastTap = { t: 0, x: -99 };
wave.style.touchAction = 'none';
function evX(event){ const rect = wave.getBoundingClientRect(); return event.clientX - rect.left; }
function tAt(xCss){
  const view = currentWaveView();
  return Core.clampPosition(view.start + xCss / waveWidthCss() * view.span, state.duration);
}

wave.addEventListener('pointerdown', event => {
  if (!state.duration) return;
  const x = evX(event);
  drag = Object.assign(hitTest(x, waveWidthCss()), { startX: x, anchorT: tAt(x), moved: false });
  try { wave.setPointerCapture(event.pointerId); } catch(_){}
});

wave.addEventListener('pointermove', event => {
  const x = evX(event);
  if (!drag){
    const hit = hitTest(x, waveWidthCss());
    wave.style.cursor = (hit.mode === 'select' || hit.mode === 'none') ? 'crosshair' : 'ew-resize';
    return;
  }
  if (Math.abs(x - drag.startX) > 4) drag.moved = true;
  if (!drag.moved) return;
  const time = tAt(x);
  if (drag.mode === 'select'){
    state.loopA = Math.min(drag.anchorT, time);
    state.loopB = Math.max(drag.anchorT, time);
    renderLoop();
  } else if (drag.mode === 'a' || drag.mode === 'b'){
    state[drag.mode === 'a' ? 'loopA' : 'loopB'] = time;
    if (state.loopA != null && state.loopB != null && state.loopA > state.loopB){
      [state.loopA, state.loopB] = [state.loopB, state.loopA];
      drag.mode = drag.mode === 'a' ? 'b' : 'a';
    }
    renderLoop();
  } else if (drag.mode === 'marker'){
    state.markers[drag.idx].t = time;
    drawWave();
  }
});

function endWaveDrag(event){
  if (!drag) return;
  const x = evX(event);
  if (!drag.moved){
    if (drag.mode === 'select' || drag.mode === 'none'){
      const now = performance.now();
      if (now - lastTap.t < 350 && Math.abs(x - lastTap.x) < 14){
        seekTo(tAt(x));
        lastTap = { t: 0, x: -99 };
      } else {
        lastTap = { t: now, x };
      }
    }
  } else if (drag.mode === 'marker'){
    state.markers = Core.sortMarkers(state.markers, state.duration);
    renderMarkers();
  } else {
    normLoop();
    renderLoop();
    applyLoopToEngine();
  }
  drag = null;
}

wave.addEventListener('pointerup', endWaveDrag);
wave.addEventListener('pointercancel', () => { drag = null; });
wave.addEventListener('wheel', event => {
  if (!state.duration) return;
  if (event.ctrlKey || event.metaKey){
    event.preventDefault();
    zoomWave(event.deltaY > 0 ? 1.35 : 0.74, tAt(evX(event)));
  } else if (event.shiftKey){
    event.preventDefault();
    const view = currentWaveView();
    panWave((event.deltaY || event.deltaX) / 400 * view.span);
  }
}, { passive: false });

$('waveZoomIn').addEventListener('click', () => zoomWave(0.5));
$('waveZoomOut').addEventListener('click', () => zoomWave(2));
$('waveZoomLoop').addEventListener('click', fitLoopInWave);
$('waveZoomAll').addEventListener('click', resetWaveView);
$('wavePanBack').addEventListener('click', () => panWave(-currentWaveView().span * 0.5));
$('wavePanForward').addEventListener('click', () => panWave(currentWaveView().span * 0.5));
$('waveFollow').addEventListener('change', event => {
  state.followPlayhead = Boolean(event.target.checked);
  if (state.followPlayhead) followWaveAt(pos(), true);
  renderWaveViewControls();
  drawWave();
});
window.addEventListener('resize', () => { sizeWave(); drawWave(); });

/* ---------------- transport & basic UI ---------------- */
$('playBtn').addEventListener('click', togglePlay);
document.querySelectorAll('[data-seek]').forEach(b =>
  b.addEventListener('click', () => seekTo(pos() + parseFloat(b.dataset.seek))));
$('vol').addEventListener('input', e => { if (master) master.gain.value = parseFloat(e.target.value); });

$('tempo').addEventListener('input', e => applyTempo(parseFloat(e.target.value)));
document.querySelectorAll('[data-tempo]').forEach(b =>
  b.addEventListener('click', () => applyTempo(state.tempo + parseInt(b.dataset.tempo, 10))));
document.querySelectorAll('[data-temposet]').forEach(b =>
  b.addEventListener('click', () => applyTempo(parseInt(b.dataset.temposet, 10))));

document.querySelectorAll('[data-st]').forEach(b =>
  b.addEventListener('click', () => {
    state.semitones = Math.min(12, Math.max(-12, state.semitones + parseInt(b.dataset.st, 10)));
    applyPitch();
  }));
$('cents').addEventListener('input', e => { state.cents = parseInt(e.target.value, 10); applyPitch(); });
$('pitchReset').addEventListener('click', () => {
  state.semitones = 0; state.cents = 0; $('cents').value = 0; applyPitch();
});

/* ---------------- loop ---------------- */
function fmtPrecise(time){
  if (!Number.isFinite(time) || time < 0) return '0:00.000';
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time - hours * 3600) / 60);
  const seconds = time - hours * 3600 - minutes * 60;
  const secText = seconds.toFixed(3).padStart(6, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${secText}`
    : `${minutes}:${secText}`;
}

function formatSpan(seconds){
  if (!Number.isFinite(seconds) || seconds < 0) return '0 ms';
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(3)} s`;
  return fmtPrecise(seconds);
}

function syncLoopInput(id, value){
  const input = $(id);
  if (!input || document.activeElement === input) return;
  input.value = value == null ? '' : fmtPrecise(value);
  input.classList.remove('invalid');
}

function renderLoop(){
  const el = $('loopState');
  if (state.loopA == null && state.loopB == null){
    el.innerHTML = '<span class="off">no loop set</span>';
  } else {
    const a = state.loopA != null ? fmtPrecise(state.loopA) : '—';
    const b = state.loopB != null ? fmtPrecise(state.loopB) : '—';
    el.innerHTML = 'A <span class="pt">' + a + '</span> → B <span class="pt">' + b + '</span>' +
      (state.loopOn ? ' · <span class="pt">looping</span>' : '');
  }
  const ready = state.loopA != null && state.loopB != null;
  $('loopToggle').disabled = !ready;
  $('loopClear').disabled = state.loopA == null && state.loopB == null;
  $('loopToggle').textContent = state.loopOn ? 'Loop on' : 'Loop off';
  $('loopToggle').classList.toggle('active', state.loopOn);
  if ($('addRegion')) $('addRegion').disabled = !ready;
  if ($('snapBeats')) $('snapBeats').disabled = !(ready && state.bpm);
  if ($('waveZoomLoop')) $('waveZoomLoop').disabled = !ready;

  syncLoopInput('loopAInput', state.loopA);
  syncLoopInput('loopBInput', state.loopB);
  document.querySelectorAll('[data-loop-nudge]').forEach(button => {
    const point = String(button.dataset.loopPoint || 'A').toUpperCase();
    button.disabled = point === 'B' ? state.loopB == null : state.loopA == null;
  });

  const duration = $('loopDuration');
  if (duration){
    duration.textContent = ready
      ? `Loop duration: ${formatSpan(Math.max(0, state.loopB - state.loopA))}`
      : 'Set both boundaries to see the loop duration.';
  }
  renderWaveViewControls();
  if (state.duration) drawWave();
}

function normLoop(){
  const loop = Core.normalizeLoop(state.loopA, state.loopB, state.duration);
  state.loopA = loop.loopA;
  state.loopB = loop.loopB;
}

function commitLoopBoundary(point, rawValue){
  const upper = String(point || 'A').toUpperCase();
  const input = upper === 'B' ? $('loopBInput') : $('loopAInput');
  const text = String(rawValue == null ? '' : rawValue).trim();
  if (!text){
    if (upper === 'B') state.loopB = null;
    else state.loopA = null;
    state.loopOn = false;
    if (input) input.classList.remove('invalid');
    renderLoop();
    applyLoopToEngine();
    return true;
  }

  const parsed = Core.parseTimecode(text);
  if (parsed == null){
    if (input) input.classList.add('invalid');
    return false;
  }
  const next = Core.setLoopBoundary({
    loopA: state.loopA,
    loopB: state.loopB,
    point: upper,
    value: parsed,
    duration: state.duration,
    minGap: 0.01,
  });
  state.loopA = next.loopA;
  state.loopB = next.loopB;
  if (input){
    input.classList.remove('invalid');
    input.value = fmtPrecise(upper === 'B' ? state.loopB : state.loopA);
  }
  renderLoop();
  applyLoopToEngine();
  return true;
}

function nudgeLoopBoundary(point, deltaSeconds){
  const next = Core.nudgeLoopBoundary({
    loopA: state.loopA,
    loopB: state.loopB,
    point,
    deltaSeconds,
    duration: state.duration,
    minGap: 0.01,
  });
  state.loopA = next.loopA;
  state.loopB = next.loopB;
  renderLoop();
  applyLoopToEngine();
}

function setA(){
  if (!state.fileURL) return;
  state.loopA = pos();
  normLoop();
  renderLoop();
  applyLoopToEngine();
}
function setB(){
  if (!state.fileURL) return;
  state.loopB = pos();
  normLoop();
  if (state.loopA != null) state.loopOn = true;
  renderLoop();
  applyLoopToEngine();
}
function toggleLoop(){
  if (state.loopA != null && state.loopB != null){
    state.loopOn = !state.loopOn;
    renderLoop();
    applyLoopToEngine();
  }
}

$('setA').addEventListener('click', setA);
$('setB').addEventListener('click', setB);
$('loopToggle').addEventListener('click', toggleLoop);
$('loopClear').addEventListener('click', () => {
  state.loopA = state.loopB = null;
  state.loopOn = false;
  renderLoop();
  applyLoopToEngine();
});
['A', 'B'].forEach(point => {
  const input = point === 'A' ? $('loopAInput') : $('loopBInput');
  input.addEventListener('change', () => commitLoopBoundary(point, input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter'){
      event.preventDefault();
      if (commitLoopBoundary(point, input.value)) input.blur();
    } else if (event.key === 'Escape'){
      input.classList.remove('invalid');
      input.value = point === 'A'
        ? (state.loopA == null ? '' : fmtPrecise(state.loopA))
        : (state.loopB == null ? '' : fmtPrecise(state.loopB));
      input.blur();
    }
  });
});
document.querySelectorAll('[data-loop-nudge]').forEach(button => {
  button.addEventListener('click', () => nudgeLoopBoundary(
    button.dataset.loopPoint,
    Number(button.dataset.loopNudge),
  ));
});

/* ---------------- markers & session ---------------- */
function addMarker(){
  if (!state.fileURL) return;
  state.markers = Core.addMarker(state.markers, pos(), state.duration);
  renderMarkers();
}

function renderMarkers(){
  const list = $('markerList');
  list.innerHTML = '';
  if (!state.markers.length){
    list.innerHTML = '<div class="empty">No markers yet — press M while listening.</div>';
    return;
  }
  state.markers.forEach((m, i) => {
    const row = document.createElement('div'); row.className = 'mrow';
    const t = document.createElement('span');
    t.className = 'mt'; t.textContent = fmt(m.t); t.title = 'Jump here';
    t.addEventListener('click', () => seekTo(m.t));
    const inp = document.createElement('input');
    inp.placeholder = 'label…'; inp.value = m.label;
    inp.addEventListener('input', () => { m.label = inp.value; });
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '×'; del.title = 'Delete marker';
    del.addEventListener('click', () => { state.markers.splice(i, 1); renderMarkers(); });
    row.append(t, inp, del);
    list.appendChild(row);
  });
}
$('addMarker').addEventListener('click', addMarker);
$('exportMk').addEventListener('click', () => {
  const data = {
    file: state.fileName,
    loop: { a: state.loopA, b: state.loopB, on: state.loopOn },
    view: { start: state.viewStart, end: state.viewEnd, followPlayhead: state.followPlayhead },
    markers: state.markers,
    regions: state.regions,
    bpm: state.bpm,
    settings: { tempo: state.tempo, semitones: state.semitones, cents: state.cents },
  };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    baseName() + '.session.json');
});
$('importMk').addEventListener('click', () => $('mkFile').click());
$('mkFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(txt => {
    try {
      const d = JSON.parse(txt);
      if (Array.isArray(d.markers)) state.markers = d.markers.filter(m => typeof m.t === 'number');
      if (d.loop){
        state.loopA = d.loop.a ?? null;
        state.loopB = d.loop.b ?? null;
        normLoop();
        state.loopOn = Boolean(d.loop.on) && state.loopA != null && state.loopB != null;
      }
      if (d.settings){
        if (typeof d.settings.tempo === 'number') applyTempo(d.settings.tempo);
        if (typeof d.settings.semitones === 'number') state.semitones = d.settings.semitones;
        if (typeof d.settings.cents === 'number'){ state.cents = d.settings.cents; $('cents').value = state.cents; }
        applyPitch();
      }
      if (Array.isArray(d.regions)) state.regions = d.regions.filter(r => typeof r.start === 'number' && typeof r.end === 'number' && typeof r.pct === 'number');
      if (d.bpm && typeof d.bpm.bpm === 'number') state.bpm = d.bpm;
      if (d.view && typeof d.view === 'object'){
        state.followPlayhead = Boolean(d.view.followPlayhead);
        const start = Number(d.view.start);
        const end = Number(d.view.end);
        if (Number.isFinite(start) && Number.isFinite(end)) setWaveView(start, end, { draw: false });
      }
      lastEff = null;
      state.markers = Core.sortMarkers(state.markers, state.duration);
      renderMarkers(); renderLoop(); applyLoopToEngine(); renderRegions(); renderBpm();
    } catch(_){}
  });
  e.target.value = '';
});

/* ---------------- pitch detection & retune ---------------- */
function detectPitchHz(samples, sr, fMin = 50, fMax = 1000){
  const FRAME = 4096, HOP = 2048;
  const minLag = Math.max(2, Math.floor(sr / fMax));
  const maxLag = Math.min(FRAME - 2, Math.ceil(sr / fMin));
  const results = [];
  for (let start = 0; start + FRAME <= samples.length; start += HOP){
    let mean = 0;
    for (let i = 0; i < FRAME; i++) mean += samples[start + i];
    mean /= FRAME;
    const x = new Float32Array(FRAME);
    let energy = 0;
    for (let i = 0; i < FRAME; i++){ x[i] = samples[start + i] - mean; energy += x[i]*x[i]; }
    if (energy / FRAME < 1e-6) continue;
    const r = new Float32Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++){
      let num = 0, ea = 0, eb = 0;
      const n = FRAME - lag;
      for (let i = 0; i < n; i++){ num += x[i]*x[i+lag]; ea += x[i]*x[i]; eb += x[i+lag]*x[i+lag]; }
      r[lag] = num / (Math.sqrt(ea*eb) + 1e-12);
    }
    let rmax = 0;
    for (let lag = minLag+1; lag < maxLag; lag++) if (r[lag] > rmax) rmax = r[lag];
    if (rmax < 0.5) continue;
    let best = -1;
    for (let lag = minLag+1; lag < maxLag; lag++){
      if (r[lag] > r[lag-1] && r[lag] >= r[lag+1] && r[lag] >= 0.9*rmax){ best = lag; break; }
    }
    if (best < 0) continue;
    const a = r[best-1], b = r[best], c = r[best+1];
    const denom = a - 2*b + c;
    const shift = denom !== 0 ? 0.5*(a - c)/denom : 0;
    results.push(sr / (best + Math.max(-0.5, Math.min(0.5, shift))));
  }
  if (!results.length) return null;
  results.sort((p, q) => p - q);
  return results[Math.floor(results.length / 2)];
}
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function describePitch(hz, refA = 440){
  const midiFloat = 69 + 12 * Math.log2(hz / refA);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  return {
    hz, midi, cents,
    note: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    targetHz: refA * Math.pow(2, (midi - 69) / 12),
  };
}
function renderTune(){
  const el = $('tuneResult');
  const d = state.detected;
  const has = !!d;
  $('snapBtn').disabled = !has;
  $('targetNote').disabled = !has;
  $('retuneBtn').disabled = !has;
  if (!has){
    el.innerHTML = '<span class="off2">Select a sustained stretch (drone, held note) with A–B, then detect.</span>';
    return;
  }
  const sign = d.cents >= 0 ? '+' : '';
  el.innerHTML = '<span class="hz">' + d.hz.toFixed(1) + ' Hz</span> ≈ ' +
    d.note + d.octave + ' <span class="off2">' + sign + d.cents + '¢ (A4 = ' + state.refA + ' Hz)</span>';
  renderTuneLive();
}
$('detectBtn').addEventListener('click', () => {
  if (!state.decoded){ $('tuneResult').innerHTML = '<span class="off2">No decoded audio to analyze.</span>'; return; }
  const sr = state.decoded.sampleRate;
  const ch = state.decoded.getChannelData(0);
  let t0, t1;
  if (state.loopA != null && state.loopB != null){ t0 = state.loopA; t1 = state.loopB; }
  else { t0 = Math.max(0, pos() - 2); t1 = Math.min(state.duration, pos() + 2); }
  const s0 = Math.floor(t0 * sr), s1 = Math.min(ch.length, Math.floor(t1 * sr));
  if (s1 - s0 < 8192){ $('tuneResult').innerHTML = '<span class="off2">Selection too short to analyze.</span>'; return; }
  state.refA = parseFloat($('refA').value) || 440;
  const hz = detectPitchHz(ch.subarray(s0, s1), sr);
  if (!hz){ state.detected = null; renderTune(); $('tuneResult').innerHTML = '<span class="off2">No stable pitch found — try a cleaner sustained passage.</span>'; return; }
  state.detected = describePitch(hz, state.refA);
  renderTune();
});
function tuneMode(){ return document.querySelector('input[name="tuneMode"]:checked').value; }
function renderTuneLive(){
  const el = $('tuneLive'); if (!el) return;
  if (!state.detected){ el.textContent = ''; return; }
  const eff = state.detected.hz * Math.pow(2, totalSemis() / 12);
  const d = describePitch(eff, state.refA || 440);
  const sign = d.cents >= 0 ? '+' : '';
  el.innerHTML = 'now sounding → <span style="color:var(--brass)">' + eff.toFixed(1) + ' Hz</span> ≈ ' +
    d.note + d.octave + ' <span class="off2">' + sign + d.cents + '¢</span>';
}
function applyCorrectionCents(totalCents){
  /* totalCents describes the correction for the ORIGINAL file, so it is
     applied absolutely (replacing the current shift) — idempotent. */
  if (tuneMode() === 'tape'){
    // tape drift: correct speed and pitch together by the same ratio
    applyTempo(100 * Math.pow(2, -totalCents / 1200));
  }
  const semis = Math.max(-12, Math.min(12, Math.round(totalCents / 100)));
  state.semitones = semis;
  state.cents = Math.max(-100, Math.min(100, Math.round(totalCents - semis * 100)));
  $('cents').value = state.cents;
  applyPitch();
}
$('snapBtn').addEventListener('click', () => {
  if (!state.detected) return;
  applyCorrectionCents(-state.detected.cents);
});
$('retuneBtn').addEventListener('click', () => {
  if (!state.detected) return;
  const targetPc = NOTE_NAMES.indexOf($('targetNote').value);
  const d = state.detected;
  const curPc = ((d.midi % 12) + 12) % 12;
  let deltaSemis = targetPc - curPc;
  if (deltaSemis > 6) deltaSemis -= 12;
  if (deltaSemis < -6) deltaSemis += 12;      // nearest octave of the target note
  applyCorrectionCents(deltaSemis * 100 - d.cents);
});
document.querySelectorAll('[data-cent]').forEach(b =>
  b.addEventListener('click', () => {
    state.cents = Math.max(-100, Math.min(100, state.cents + parseInt(b.dataset.cent, 10)));
    $('cents').value = state.cents;
    applyPitch();
  }));

/* ---------------- tempo detection & beat grid ---------------- */
function onsetEnvelope(samples, sr){
  const FR = 1024, HOP = 512;
  const nF = Math.floor((samples.length - FR) / HOP);
  if (nF < 16) return null;
  const env = new Float32Array(nF);
  let prevLog = null;
  for (let f = 0; f < nF; f++){
    let e = 0; const off = f * HOP;
    for (let i = 0; i < FR; i++){ const v = samples[off + i]; e += v * v; }
    const le = Math.log(e + 1e-10);
    env[f] = prevLog === null ? 0 : Math.max(0, le - prevLog);
    prevLog = le;
  }
  const sm = new Float32Array(nF);   // light smoothing for off-grid frame boundaries
  for (let i = 0; i < nF; i++) sm[i] = (env[i-1] || 0) * .25 + env[i] * .5 + (env[i+1] || 0) * .25;
  return { env: sm, frameRate: sr / HOP };
}
function detectTempo(samples, sr){
  const oe = onsetEnvelope(samples, sr);
  if (!oe) return null;
  const { env, frameRate } = oe;
  let total = 0, strong = 0;
  for (let i = 0; i < env.length; i++){ total += env[i]; if (env[i] > 0.3) strong++; }
  if (total < 1e-4 || strong < 8) return null;         // periodic ripple ≠ beats: need real onsets
  const minLag = Math.max(4, Math.floor(frameRate * 60 / 220));
  const maxLag = Math.min(env.length - 2, Math.ceil(frameRate * 60 / 40));
  if (maxLag <= minLag + 2) return null;
  const r = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++){
    let num = 0, ea = 0, eb = 0;
    const n = env.length - lag;
    for (let i = 0; i < n; i++){ num += env[i] * env[i + lag]; ea += env[i] * env[i]; eb += env[i + lag] * env[i + lag]; }
    r[lag] = num / (Math.sqrt(ea * eb) + 1e-12);
  }
  let best = -1, bestScore = -1;
  for (let lag = minLag + 1; lag < maxLag; lag++){
    if (r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]){
      const score = r[lag] + 0.5 * (2 * lag <= maxLag ? r[2 * lag] : 0);
      if (score > bestScore){ bestScore = score; best = lag; }
    }
  }
  if (best < 0 || r[best] < 0.2) return null;
  const half = Math.round(best / 2);                   // prefer a strong subdivision
  if (half >= minLag && r[half] > 0.85 * r[best]) best = half;
  const a = r[best - 1], b = r[best], c = r[best + 1] || 0;
  const den = a - 2 * b + c;
  const lagF = best + (den !== 0 ? Math.max(-.5, Math.min(.5, .5 * (a - c) / den)) : 0);
  const period = lagF / frameRate;
  const steps = Math.max(8, Math.round(lagF * 2));     // half-frame phase resolution
  let bestPh = 0, bestPhScore = -1;
  for (let sI = 0; sI < steps; sI++){
    const ph = sI / steps * lagF;
    let s = 0;
    for (let tt = ph; tt < env.length; tt += lagF) s += env[Math.round(tt)] || 0;
    if (s > bestPhScore){ bestPhScore = s; bestPh = ph; }
  }
  return { bpm: 60 / period, period, phase: bestPh / frameRate, confidence: r[best] };
}
function snapToGrid(t, grid){
  return grid.phaseAbs + Math.round((t - grid.phaseAbs) / grid.period) * grid.period;
}
function renderBpm(){
  const el = $('bpmVal'), eff = $('bpmEff');
  if (!el) return;
  if (!state.bpm){ el.textContent = '—'; eff.textContent = ''; }
  else {
    el.textContent = state.bpm.bpm.toFixed(1);
    const conf = state.bpm.tapped ? 'tapped'
      : state.bpm.confidence >= 0.5 ? 'high confidence'
      : state.bpm.confidence >= 0.3 ? 'medium confidence' : 'low confidence';
    eff.textContent = ' BPM · ' + conf +
      (state.tempo !== 100 ? ' · at ' + state.tempo + '% → ' + (state.bpm.bpm * state.tempo / 100).toFixed(1) + ' BPM heard' : '');
  }
  if ($('snapBeats')) $('snapBeats').disabled = !(state.bpm && state.loopA != null && state.loopB != null);
}
const BPM_HINT_DEFAULT = $('bpmHint') ? $('bpmHint').textContent : '';
$('detectBpm').addEventListener('click', () => {
  if (!state.decoded){ $('bpmHint').textContent = 'No decoded audio to analyze.'; return; }
  const sr = state.decoded.sampleRate, ch = state.decoded.getChannelData(0);
  let t0, t1;
  if (state.loopA != null && state.loopB != null){ t0 = state.loopA; t1 = state.loopB; }
  else { t0 = Math.max(0, pos() - 15); t1 = Math.min(state.duration, t0 + 60); }
  if (t1 - t0 < 4){ $('bpmHint').textContent = 'Need at least 4 seconds to estimate a tempo.'; return; }
  const res = detectTempo(ch.subarray(Math.floor(t0 * sr), Math.floor(t1 * sr)), sr);
  if (!res){ state.bpm = null; renderBpm(); $('bpmHint').textContent = 'No stable tempo found — unmetered or too sparse for a grid.'; return; }
  state.bpm = { bpm: res.bpm, period: res.period, phaseAbs: t0 + res.phase, confidence: res.confidence };
  $('bpmHint').textContent = BPM_HINT_DEFAULT;
  renderBpm(); renderLoop();
});
$('bpmDouble').addEventListener('click', () => {
  if (!state.bpm || state.bpm.bpm * 2 > 320) return;
  state.bpm.bpm *= 2; state.bpm.period /= 2; renderBpm();
});
$('bpmHalf').addEventListener('click', () => {
  if (!state.bpm || state.bpm.bpm / 2 < 20) return;
  state.bpm.bpm /= 2; state.bpm.period *= 2; renderBpm();
});
let taps = [];
$('tapBpm').addEventListener('click', () => {
  const wall = performance.now() / 1000;
  if (taps.length && wall - taps[taps.length - 1] > 3) taps = [];
  taps.push(wall);
  if (taps.length >= 3){
    const d = [];
    for (let i = 1; i < taps.length; i++) d.push(taps[i] - taps[i - 1]);
    d.sort((p, q) => p - q);
    let period = d[Math.floor(d.length / 2)];
    const playingNow = state.engine === 'buffer' ? state.playing : !media.paused;
    if (playingNow && lastEff) period *= lastEff;     // wall-clock taps → file-time period
    if (period > 0.18 && period < 2.5){
      state.bpm = { bpm: 60 / period, period, phaseAbs: pos(), confidence: 1, tapped: true };
      renderBpm(); renderLoop();
    }
  }
});
$('snapBeats').addEventListener('click', () => {
  if (!state.bpm || state.loopA == null || state.loopB == null) return;
  const g = { phaseAbs: state.bpm.phaseAbs, period: state.bpm.period };
  let a = snapToGrid(state.loopA, g), b = snapToGrid(state.loopB, g);
  if (b - a < state.bpm.period / 2) b = a + state.bpm.period;
  state.loopA = Math.max(0, a); state.loopB = Math.min(state.duration, b);
  renderLoop(); applyLoopToEngine();
});

/* ---------------- speed regions ---------------- */
function renderRegions(){
  const list = $('regionList');
  if (!list) return;
  list.innerHTML = '';
  if (!state.regions.length){
    list.innerHTML = '<div class="empty">No regions — select A–B, then add one.</div>';
    return;
  }
  state.regions.forEach((r, i) => {
    const row = document.createElement('div'); row.className = 'mrow';
    const t = document.createElement('span');
    t.className = 'mt'; t.textContent = fmt(r.start) + '–' + fmt(r.end); t.title = 'Jump here';
    t.addEventListener('click', () => seekTo(r.start));
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = 25; inp.max = 200; inp.value = r.pct;
    inp.className = 'numIn'; inp.style.width = '64px';
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (v >= 25 && v <= 200){ r.pct = v; lastEff = null; }
    });
    const pc = document.createElement('span'); pc.textContent = '%'; pc.className = 'hint';
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '×'; del.title = 'Delete region';
    del.addEventListener('click', () => { state.regions.splice(i, 1); lastEff = null; renderRegions(); });
    row.append(t, inp, pc, del);
    list.appendChild(row);
  });
}
$('addRegion').addEventListener('click', () => {
  if (state.loopA == null || state.loopB == null) return;
  const a = state.loopA, b = state.loopB;
  if (state.regions.some(r => a < r.end && b > r.start)){
    $('regionMsg').textContent = 'Overlaps an existing region.';
    setTimeout(() => { $('regionMsg').textContent = ''; }, 2500);
    return;
  }
  state.regions.push({ start: a, end: b, pct: 100 });
  state.regions.sort((x, y) => x.start - y.start);
  lastEff = null;
  renderRegions();
});

/* ---------------- export ---------------- */
function baseName(){ return (state.fileName.replace(/\.[^.]+$/, '') || 'vilambit'); }
function downloadBlob(blob, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function setExportScope(s){
  state.exportScope = s;
  $('scopeSel').classList.toggle('active', s === 'sel');
  $('scopeAll').classList.toggle('active', s === 'all');
}
$('scopeSel').addEventListener('click', () => setExportScope('sel'));
$('scopeAll').addEventListener('click', () => setExportScope('all'));

function exportRange(){
  if (state.exportScope === 'sel' && state.loopA != null && state.loopB != null){
    return [state.loopA, state.loopB];
  }
  return [0, state.duration];
}
function status(msg, cls){ const el = $('exportStatus'); el.textContent = msg; el.className = cls || ''; }

function sliceChannels(ab, t0, t1){
  const sr = ab.sampleRate;
  const s0 = Math.max(0, Math.floor(t0 * sr));
  const s1 = Math.min(ab.length, Math.ceil(t1 * sr));
  const out = [];
  const nCh = Math.min(2, ab.numberOfChannels);
  for (let c = 0; c < nCh; c++) out.push(ab.getChannelData(c).slice(s0, s1));
  return { channels: out, sr, length: s1 - s0 };
}

/* offline render through the stretch engine, with a pure-JS fallback */
function segmentsFor(t0, t1, regions, globalRate){
  const edges = [t0, t1];
  for (const r of regions){
    if (r.start > t0 && r.start < t1) edges.push(r.start);
    if (r.end > t0 && r.end < t1) edges.push(r.end);
  }
  edges.sort((a, b) => a - b);
  const segs = [];
  for (let i = 0; i < edges.length - 1; i++){
    const a = edges[i], b = edges[i + 1];
    if (b - a < 1e-6) continue;
    const mid = (a + b) / 2;
    const reg = regions.find(r => mid >= r.start && mid < r.end);
    segs.push({ start: a, end: b, rate: globalRate * (reg ? reg.pct / 100 : 1) });
  }
  return segs;
}
async function renderProcessed(t0, t1, globalRate, semis){
  const segs = segmentsFor(t0, t1, state.regions, globalRate);
  if (segs.length <= 1){
    return renderSegment(t0, t1, segs.length ? segs[0].rate : globalRate, semis);
  }
  const parts = [];
  for (const s of segs) parts.push(await renderSegment(s.start, s.end, s.rate, semis));
  const nCh = Math.max(...parts.map(p => p.channels.length));
  const total = parts.reduce((acc, p) => acc + p.channels[0].length, 0);
  const channels = [];
  for (let c = 0; c < nCh; c++){
    const arr = new Float32Array(total);
    let off = 0;
    for (const p of parts){
      arr.set(p.channels[Math.min(c, p.channels.length - 1)], off);
      off += p.channels[0].length;
    }
    channels.push(arr);
  }
  return { channels, sr: parts[0].sr };
}
async function renderSegment(t0, t1, rate, semis){
  const src = sliceChannels(state.decoded, t0, t1);
  const outLen = Math.max(1, Math.round(src.length / rate));
  // source peak (for the silence watchdog)
  let srcPeak = 0;
  for (const ch of src.channels) for (let i = 0; i < ch.length; i += 50) srcPeak = Math.max(srcPeak, Math.abs(ch[i]));
  try {
    const octx = new OfflineAudioContext(src.channels.length, outLen, src.sr);
    const node = await SignalsmithStretch(octx, { numberOfInputs: 0, outputChannelCount: [src.channels.length] });
    node.addBuffers(src.channels);
    node.schedule({ active: true, input: 0, rate, semitones: semis });
    node.connect(octx.destination);
    const rendered = await octx.startRendering();
    let peak = 0;
    const c0 = rendered.getChannelData(0);
    for (let i = 0; i < c0.length; i += 50) peak = Math.max(peak, Math.abs(c0[i]));
    if (srcPeak > 1e-4 && peak < 1e-6) throw new Error('silent render');
    const chans = [];
    for (let c = 0; c < rendered.numberOfChannels; c++) chans.push(rendered.getChannelData(c));
    return { channels: chans, sr: src.sr };
  } catch (e){
    console.warn('offline worklet render failed, using JS fallback', e);
    return jsRender(src, rate, semis);
  }
}

/* pure-JS fallback: varispeed resample to fix duration, granular shift to fix pitch */
function jsRender(src, rate, semis){
  const pitchRatio = Math.pow(2, semis / 12);
  // step 1: varispeed by `rate` (duration correct, pitch multiplied by rate)
  const mid = src.channels.map(ch => resampleLinear(ch, rate));
  // step 2: granular shift by pitchRatio / rate to land on the target pitch
  const corr = pitchRatio / rate;
  const out = Math.abs(corr - 1) < 1e-9 ? mid : mid.map(ch => granularShift(ch, corr));
  return { channels: out, sr: src.sr };
}
function resampleLinear(ch, step){
  const outLen = Math.max(1, Math.round(ch.length / step));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++){
    const p = i * step;
    const i0 = Math.floor(p), fr = p - i0;
    const a = ch[i0] || 0, b = ch[i0 + 1] !== undefined ? ch[i0 + 1] : a;
    out[i] = a * (1 - fr) + b * fr;
  }
  return out;
}
function granularShift(ch, ratio){
  const D = GRAIN;
  const out = new Float32Array(ch.length);
  let phase = D / 2;
  const slope = 1 - ratio;
  for (let i = 0; i < ch.length; i++){
    phase += slope;
    if (phase >= D) phase -= D; else if (phase < 0) phase += D;
    const d1 = phase, d2 = (phase + D/2) % D;
    const s = Math.sin(Math.PI * d1 / D);
    const w1 = s*s, w2 = 1 - w1;
    let p = i - d1; let v1 = 0;
    if (p >= 0){ const i0 = Math.floor(p), fr = p - i0; const b = ch[i0+1] !== undefined ? ch[i0+1] : ch[i0]; v1 = ch[i0]*(1-fr) + b*fr; }
    p = i - d2; let v2 = 0;
    if (p >= 0){ const i0 = Math.floor(p), fr = p - i0; const b = ch[i0+1] !== undefined ? ch[i0+1] : ch[i0]; v2 = ch[i0]*(1-fr) + b*fr; }
    out[i] = v1*w1 + v2*w2;
  }
  return out;
}

function interleave16(channels){
  const n = channels[0].length, nCh = channels.length;
  const out = new Int32Array(n * nCh);
  for (let i = 0; i < n; i++){
    for (let c = 0; c < nCh; c++){
      let v = Math.max(-1, Math.min(1, channels[c][i]));
      out[i * nCh + c] = Math.round(v * 32767);
    }
  }
  return out;
}
function encodeWav(channels, sr){
  const pcm = interleave16(channels);
  const nCh = channels.length, bytesPerSample = 2;
  const dataSize = pcm.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const wstr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); dv.setUint32(4, 36 + dataSize, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, nCh, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * nCh * bytesPerSample, true);
  dv.setUint16(32, nCh * bytesPerSample, true); dv.setUint16(34, 16, true);
  wstr(36, 'data'); dv.setUint32(40, dataSize, true);
  const i16 = new Int16Array(buf, 44);
  for (let i = 0; i < pcm.length; i++) i16[i] = pcm[i];
  return new Blob([buf], { type: 'audio/wav' });
}
function flacReady(){
  return new Promise((res, rej) => {
    if (!window.Flac) return rej(new Error('FLAC encoder missing'));
    if (Flac.isReady()) return res();
    Flac.on('ready', () => res());
    setTimeout(() => Flac.isReady() ? res() : rej(new Error('FLAC init timeout')), 8000);
  });
}
async function encodeFlac(channels, sr){
  await flacReady();
  const pcm = interleave16(channels);
  const nCh = channels.length, total = channels[0].length;
  const enc = Flac.create_libflac_encoder(sr, nCh, 16, 5, total, false);
  if (!enc) throw new Error('FLAC encoder create failed');
  const chunks = [];
  const st = Flac.init_encoder_stream(enc, (buf) => { chunks.push(new Uint8Array(buf)); });
  if (st !== 0) throw new Error('FLAC init failed: ' + st);
  const CHUNK = 65536;
  for (let s = 0; s < total; s += CHUNK){
    const n = Math.min(CHUNK, total - s);
    const ok = Flac.FLAC__stream_encoder_process_interleaved(enc, pcm.subarray(s * nCh, (s + n) * nCh), n);
    if (!ok) throw new Error('FLAC encode failed');
  }
  if (!Flac.FLAC__stream_encoder_finish(enc)) throw new Error('FLAC finish failed');
  Flac.FLAC__stream_encoder_delete(enc);
  let totalB = 0; chunks.forEach(c => totalB += c.length);
  const out = new Uint8Array(totalB); let off = 0;
  chunks.forEach(c => { out.set(c, off); off += c.length; });
  return new Blob([out], { type: 'audio/flac' });
}

async function doExport(fmt){
  if (!state.decoded){ status('No decoded audio to export.', 'err'); return; }
  const [t0, t1] = exportRange();
  if (t1 - t0 < 0.05){ status('Selection too short.', 'err'); return; }
  const apply = $('applyProc').checked;
  const rate = apply ? state.tempo / 100 : 1;
  const semis = apply ? totalSemis() : 0;
  const processed = apply && (rate !== 1 || semis !== 0 || state.regions.length > 0);
  try {
    let result;
    if (!processed){
      status('Trimming…');
      const s = sliceChannels(state.decoded, t0, t1);
      result = { channels: s.channels, sr: s.sr };
    } else {
      status('Rendering with speed & pitch applied…');
      result = await renderProcessed(t0, t1, rate, semis);
    }
    status(fmt === 'flac' ? 'Encoding FLAC…' : 'Writing WAV…');
    const blob = fmt === 'flac' ? await encodeFlac(result.channels, result.sr)
                                : encodeWav(result.channels, result.sr);
    const sel = (state.exportScope === 'sel' && state.loopA != null && state.loopB != null) ? '_trim' : '';
    const proc = processed
      ? '_' + state.tempo + 'pct' + (state.semitones ? (state.semitones > 0 ? '+' : '') + state.semitones + 'st' : '') +
        (state.cents ? (state.cents > 0 ? '+' : '') + state.cents + 'c' : '') +
        (state.regions.length ? '_map' : '')
      : '';
    downloadBlob(blob, baseName() + sel + proc + '.' + fmt);
    status('Saved ' + fmt.toUpperCase() + ' (' + (blob.size / 1048576).toFixed(2) + ' MB).', 'ok');
  } catch (e){
    console.error(e);
    status('Export failed: ' + (e.message || e), 'err');
  }
}
$('expWav').addEventListener('click', () => doExport('wav'));
$('expFlac').addEventListener('click', () => doExport('flac'));

/* ---------------- keyboard ---------------- */
document.addEventListener('keydown', e => {
  if (e.target && e.target.matches && e.target.matches('input,textarea,select,[contenteditable]')) return;
  switch (e.key){
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'ArrowLeft':  e.preventDefault(); seekTo(pos() + (e.shiftKey ? -1 : -5)); break;
    case 'ArrowRight': e.preventDefault(); seekTo(pos() + (e.shiftKey ?  1 :  5)); break;
    case 'ArrowUp':    e.preventDefault(); applyTempo(state.tempo + (e.shiftKey ? 1 : 5)); break;
    case 'ArrowDown':  e.preventDefault(); applyTempo(state.tempo - (e.shiftKey ? 1 : 5)); break;
    case 'a': case 'A': setA(); break;
    case 'b': case 'B': setB(); break;
    case 'l': case 'L': toggleLoop(); break;
    case 'm': case 'M': addMarker(); break;
    case '0': applyTempo(100); break;
  }
});

/* ---------------- file pickers & drag/drop ---------------- */
$('openBtn').addEventListener('click', () => $('fileInput').click());
$('dropzone').addEventListener('click', () => $('fileInput').click());
$('dropzone').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') $('fileInput').click(); });
$('fileInput').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
['dragover','dragenter'].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault(); $('dropzone').classList.add('drag');
}));
['dragleave','drop'].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault(); $('dropzone').classList.remove('drag');
}));
document.addEventListener('drop', e => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) loadFile(f);
});

/* ---------------- clock / loop / redraw ---------------- */
function fmt(t){
  if (!isFinite(t)) return '0:00.0';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}
function tick(){
  if (state.fileURL){
    const p = pos();
    const active = state.engine === 'buffer' ? state.playing : !media.paused;
    if (active && !realtimeCaptureActive){
      const eff = effRateAt(p);
      if (lastEff === null || Math.abs(eff - lastEff) > 1e-9) setEngineRate(eff);
    }
    if (!realtimeCaptureActive && state.engine !== 'buffer' &&
        state.loopOn && state.loopA != null && state.loopB != null &&
        media.currentTime >= state.loopB - 0.02){
      media.currentTime = state.loopA;
    }
    if (state.engine === 'buffer' && state.playing && !state.loopOn && p >= state.duration - 0.03){
      state.posPaused = state.duration;
      stretch.schedule({ active: false });
      state.playing = false;
      paintPlayBtn();
    }
    $('cur').textContent = fmt(p);
    if (active && state.followPlayhead) followWaveAt(p);
    if (state.duration) drawWave();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

state.refA = 440;
applyTempo(100);
applyPitch();
setExportScope('sel');
renderLoop();
renderWaveViewControls();
renderRegions();
renderBpm();

/* pure functions exposed for the test harness */
window.VILAMBIT_TEST = { detectPitchHz, describePitch, encodeWav, interleave16, resampleLinear, granularShift, fmt,
  detectTempo, snapToGrid, segmentsFor, hitTest, effRateAt, fmtPrecise, formatSpan,
  currentWaveView, setWaveView, zoomWave, panWave, fitLoopInWave, commitLoopBoundary, nudgeLoopBoundary,
  _setDetected: (hz) => { state.refA = parseFloat($('refA').value) || 440; state.detected = describePitch(hz, state.refA); renderTune(); },
  _getShift: () => ({ semitones: state.semitones, cents: state.cents, tempo: state.tempo }),
  _setDuration: (d) => { state.duration = d; },
  _setLoop: (a, b) => { state.loopA = a; state.loopB = b; renderLoop(); },
  _setMarkers: (ms) => { state.markers = ms; renderMarkers(); },
  _getState: () => ({
    loopA: state.loopA, loopB: state.loopB, regions: state.regions.map(r => ({...r})),
    bpm: state.bpm ? {...state.bpm} : null,
    view: { start: state.viewStart, end: state.viewEnd, followPlayhead: state.followPlayhead },
  }) };
/* SARGAM_VILAMBIT_BRIDGE_V1 — versioned, same-origin iframe contract. */
(() => {
  const BRIDGE_CHANNEL = 'sargam.vilambit';
  const BRIDGE_VERSION = 1;
  const BRIDGE_COMMANDS = new Set([
    'request-state', 'play', 'pause', 'toggle', 'seek', 'skip',
    'set-loop', 'clear-loop', 'jump-marker', 'extract-loop',
  ]);
  const bridgeTargetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
  let bridgeError = null;
  let bridgeLastJSON = '';
  let bridgeLastSentAt = 0;

  function bridgeIsPlaying(){
    return state.engine === 'buffer'
      ? Boolean(state.playing)
      : Boolean(state.fileURL) && !media.paused;
  }

  function bridgeSnapshot(){
    return Core.createPublicSnapshot({
      ready: true,
      fileURL: state.fileURL,
      fileName: state.fileName,
      fileSize: state.fileSize,
      fileLastModified: state.fileLastModified,
      isVideo: state.isVideo,
      duration: state.duration,
      position: pos(),
      playing: bridgeIsPlaying(),
      extractable: Boolean(state.decoded) || canCaptureMediaElement(),
      tempo: state.tempo,
      semitones: state.semitones,
      cents: state.cents,
      loopA: state.loopA,
      loopB: state.loopB,
      loopOn: state.loopOn,
      markers: state.markers,
      error: bridgeError,
    });
  }

  function bridgePublish(type = 'state', force = false){
    if (window.parent === window) return;
    const payload = bridgeSnapshot();
    const json = JSON.stringify(payload);
    const now = Date.now();
    // Position needs a quick cadence while playing. When idle, a one-second
    // heartbeat prevents the parent missing an early ready event or hot reload.
    if (!force && json === bridgeLastJSON && now - bridgeLastSentAt < 1000) return;
    bridgeLastJSON = json;
    bridgeLastSentAt = now;
    window.parent.postMessage({
      channel: BRIDGE_CHANNEL,
      version: BRIDGE_VERSION,
      direction: 'event',
      type,
      payload,
    }, bridgeTargetOrigin);
  }

  function bridgePublishClip(payload){
    if (window.parent === window) return;
    const transfer = payload && payload.buffer instanceof ArrayBuffer ? [payload.buffer] : [];
    window.parent.postMessage({
      channel: BRIDGE_CHANNEL,
      version: BRIDGE_VERSION,
      direction: 'event',
      type: 'clip',
      payload,
    }, bridgeTargetOrigin, transfer);
  }

  function bridgeTrustedEvent(event){
    if (event.source !== window.parent) return false;
    if (window.location.origin === 'null') return event.origin === 'null';
    if (event.origin !== window.location.origin) return false;
    return true;
  }

  function bridgeNumber(payload, key){
    const value = Number(payload && payload[key]);
    if (!Number.isFinite(value)) throw new TypeError(`Vilambit command requires numeric ${key}.`);
    return value;
  }

  async function bridgeRunCommand(type, payload){
    if (type === 'request-state') return;
    if (!state.fileURL) throw new Error('Load a recording in Vilambit first.');

    if (type === 'play') {
      if (!bridgeIsPlaying()) await togglePlay();
      return;
    }
    if (type === 'pause') {
      if (bridgeIsPlaying()) await togglePlay();
      return;
    }
    if (type === 'toggle') {
      await togglePlay();
      return;
    }
    if (type === 'seek') {
      seekTo(bridgeNumber(payload, 'seconds'));
      return;
    }
    if (type === 'skip') {
      seekTo(pos() + bridgeNumber(payload, 'deltaSeconds'));
      return;
    }
    if (type === 'set-loop') {
      const loop = Core.normalizeLoop(
        bridgeNumber(payload, 'a'),
        bridgeNumber(payload, 'b'),
        state.duration,
      );
      state.loopA = loop.loopA;
      state.loopB = loop.loopB;
      state.loopOn = Boolean(payload.on ?? true) && loop.ready;
      renderLoop();
      applyLoopToEngine();
      return;
    }
    if (type === 'clear-loop') {
      const cleared = Core.clearLoop();
      state.loopA = cleared.loopA;
      state.loopB = cleared.loopB;
      state.loopOn = cleared.loopOn;
      renderLoop();
      applyLoopToEngine();
      return;
    }
    if (type === 'extract-loop') {
      const requestId = String(payload && payload.requestId || '');
      if (!requestId) throw new TypeError('Clip extraction requires a requestId.');
      const requestedA = payload && payload.a != null ? bridgeNumber(payload, 'a') : state.loopA;
      const requestedB = payload && payload.b != null ? bridgeNumber(payload, 'b') : state.loopB;
      const loop = Core.normalizeLoop(requestedA, requestedB, state.duration);
      if (!loop.ready || loop.loopB - loop.loopA < 0.05) throw new Error('Set a complete A–B loop before extracting a clip.');

      let blob;
      let mimeType;
      let extension;
      if (state.decoded) {
        const sliced = sliceChannels(state.decoded, loop.loopA, loop.loopB);
        blob = encodeWav(sliced.channels, sliced.sr);
        mimeType = blob.type || 'audio/wav';
        extension = 'wav';
      } else {
        const captured = await captureMediaRangeRealtime(loop.loopA, loop.loopB);
        blob = captured.blob;
        mimeType = captured.mimeType;
        extension = captured.extension;
      }

      const buffer = await blob.arrayBuffer();
      bridgePublishClip({
        requestId,
        buffer,
        mimeType,
        extension,
        startTime: loop.loopA,
        endTime: loop.loopB,
        source: {
          name: state.fileName,
          kind: state.isVideo ? 'video' : 'audio',
          ...(state.fileSize != null ? { size: state.fileSize } : {}),
          ...(state.fileLastModified != null ? { lastModified: state.fileLastModified } : {}),
        },
      });
      return;
    }
    if (type === 'jump-marker') {
      const index = Math.trunc(bridgeNumber(payload, 'index'));
      state.markers = Core.sortMarkers(state.markers, state.duration);
      const marker = state.markers[index];
      if (!marker) throw new RangeError(`No Vilambit marker at index ${index}.`);
      seekTo(marker.t);
    }
  }

  window.addEventListener('message', async (event) => {
    if (!bridgeTrustedEvent(event)) return;
    const message = event.data;
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;
    if (message.channel !== BRIDGE_CHANNEL || message.version !== BRIDGE_VERSION) return;
    if (message.direction !== 'command' || !BRIDGE_COMMANDS.has(message.type)) return;
    if (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) return;

    try {
      await bridgeRunCommand(message.type, message.payload);
      bridgeError = null;
      bridgePublish('state', true);
    } catch (error) {
      bridgeError = error && error.message ? error.message : String(error);
      bridgePublish('error', true);
    }
  });

  window.setInterval(() => bridgePublish('state'), 250);
  bridgePublish('ready', true);
})();

