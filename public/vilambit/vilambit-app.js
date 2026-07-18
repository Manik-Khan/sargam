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

const state = {
  fileURL: null, fileName: '', isVideo: false,
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
};

/* ---------------- shared audio context & nodes ---------------- */
let actx = null, master = null;
let stretch = null;          // Signalsmith node (buffer or live mode)
let srcNode = null;          // MediaElementSource (video / fallback)
let granular = null, dryGain = null, wetGain = null;   // fallback shifter
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
  state.tempo = Math.min(200, Math.max(25, Math.round(v)));
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
  if (state.engine === 'buffer') return state.playing ? (stretch.inputTime || 0) : state.posPaused;
  // Engine still unchosen (before first play): posPaused is authoritative.
  // media.currentTime can lag or stay 0 if the element hasn't finished
  // loading, which would snap the playhead back to the start after a seek.
  if (state.engine === 'none') return state.posPaused || media.currentTime || 0;
  return media.currentTime || 0;
}
function seekTo(t){
  t = Math.min(state.duration, Math.max(0, t));
  // The engine isn't chosen until buildGraph() runs on the first play, so
  // until then `state.engine` is 'none' and we cannot know which position
  // store will be read: the buffer engine reads state.posPaused, the media
  // engines read media.currentTime. Writing only one meant a seek made
  // BEFORE the first play was silently discarded — the buffer engine then
  // started from 0 (or nowhere), which looked like "it won't play until
  // you refresh and press play first". Write both; they reconcile when the
  // engine is chosen. (M, 2026-07-16)
  if (state.engine === 'none'){
    state.posPaused = t;
    try { media.currentTime = t; } catch (e) { /* metadata not in yet — posPaused carries it */ }
    return;
  }
  if (state.engine === 'buffer'){
    state.posPaused = t;
    if (stretch){ lastEff = effRateAt(t); stretch.schedule({ input: t, rate: lastEff, semitones: totalSemis(), active: state.playing }); }
  } else {
    media.currentTime = t;
  }
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
    peaks: null, decoded: null, detected: null,
    loopA: null, loopB: null, loopOn: false, markers: [],
    regions: [], bpm: null,
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
      if (!state.isVideo){ state.duration = ab.duration; $('dur').textContent = fmt(ab.duration); }
      computePeaks(ab);
      $('expWav').disabled = $('expFlac').disabled = false;
      if (stretch && state.engine === 'buffer'){
        stretch.dropBuffers();
        stretch.addBuffers(bufferChannels(ab));
      }
      waveCache = null; drawWave();
      return dctx.close();
    });
  }).catch(() => {
    $('exportStatus').textContent = 'Could not decode audio track — waveform, tuning and export unavailable for this file.';
  });
}

/* ---------------- waveform ---------------- */
const wave = $('wave');
const wctx = wave.getContext && wave.getContext('2d');
let waveCache = null;

function sizeWave(){
  if (!wctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = wave.clientWidth || wave.parentElement.clientWidth || 800;
  wave.width = Math.round(w * dpr);
  wave.height = Math.round(150 * dpr);
  waveCache = null;
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
    for (let s = s0; s < s1; s += 4){
      const v = (ch0[s] + ch1[s]) * 0.5;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    peaks[c] = [mn, mx];
  }
  state.peaks = peaks;
}
function getCss(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function drawWaveStatic(){
  const W = wave.width, H = wave.height, mid = H / 2;
  waveCache = document.createElement('canvas');
  waveCache.width = W; waveCache.height = H;
  const c = waveCache.getContext('2d');
  c.fillStyle = getCss('--panel-2'); c.fillRect(0, 0, W, H);
  if (state.peaks){
    c.strokeStyle = getCss('--wave-dim'); c.lineWidth = 1; c.beginPath();
    const n = state.peaks.length;
    for (let x = 0; x < W; x++){
      const p = state.peaks[Math.floor(x / W * n)];
      const y1 = mid + p[0]*mid*0.92, y2 = mid + p[1]*mid*0.92;
      c.moveTo(x+.5, y1); c.lineTo(x+.5, Math.max(y2, y1+1));
    }
    c.stroke();
  } else {
    c.strokeStyle = getCss('--line'); c.beginPath(); c.moveTo(0, mid); c.lineTo(W, mid); c.stroke();
  }
}
function drawWave(){
  if (!wctx) return;
  if (!wave.width) sizeWave();
  if (!waveCache) drawWaveStatic();
  const W = wave.width, H = wave.height;
  wctx.drawImage(waveCache, 0, 0);
  const dur = state.duration || 1;
  const x = t => t / dur * W;
  const px = x(pos());
  wctx.save();
  wctx.beginPath(); wctx.rect(0, 0, px, H); wctx.clip();
  if (state.peaks){
    wctx.strokeStyle = getCss('--wave'); wctx.lineWidth = 1; wctx.beginPath();
    const n = state.peaks.length, mid = H/2;
    for (let xx = 0; xx < Math.ceil(px); xx++){
      const p = state.peaks[Math.floor(xx / W * n)];
      const y1 = mid + p[0]*mid*0.92, y2 = mid + p[1]*mid*0.92;
      wctx.moveTo(xx+.5, y1); wctx.lineTo(xx+.5, Math.max(y2, y1+1));
    }
    wctx.stroke();
  }
  wctx.restore();
  const dpr = window.devicePixelRatio || 1;
  for (const rg of state.regions){
    const ra = x(rg.start), rb = x(rg.end);
    wctx.fillStyle = 'rgba(91,140,168,0.16)';
    wctx.fillRect(ra, 0, rb - ra, H);
    wctx.fillStyle = '#5b8ca8';
    wctx.fillRect(ra, 0, 1.5, H); wctx.fillRect(rb - 1.5, 0, 1.5, H);
    if (rb - ra > 34){
      wctx.font = Math.round(10 * dpr) + 'px monospace';
      wctx.fillText(rg.pct + '%', ra + 4 * dpr, 11 * dpr);
    }
  }
  if (state.bpm){
    const per = state.bpm.period;
    const step = per * Math.max(1, Math.ceil((dur / per) / 600));
    wctx.fillStyle = 'rgba(159,176,198,0.35)';
    let tg = state.bpm.phaseAbs % step;
    if (tg < 0) tg += step;
    for (let tt = tg; tt <= dur; tt += step) wctx.fillRect(x(tt), H - 10 * dpr, 1, 10 * dpr);
  }
  if (state.loopA != null && state.loopB != null){
    const a = x(state.loopA), b = x(state.loopB);
    wctx.fillStyle = state.loopOn ? getCss('--madder-soft') : 'rgba(194,91,78,0.10)';
    wctx.fillRect(a, 0, b - a, H);
    wctx.fillStyle = getCss('--madder');
    wctx.fillRect(a, 0, 2, H); wctx.fillRect(b - 2, 0, 2, H);
    wctx.fillRect(a - 3 * dpr, 0, 9 * dpr, 12 * dpr);
    wctx.fillRect(b - 6 * dpr, H - 12 * dpr, 9 * dpr, 12 * dpr);
  } else if (state.loopA != null){
    wctx.fillStyle = getCss('--madder'); wctx.fillRect(x(state.loopA), 0, 2, H);
  }
  wctx.fillStyle = getCss('--brass');
  for (const m of state.markers){
    const mx = x(m.t);
    wctx.fillRect(mx, 0, 1.5, H);
    wctx.beginPath(); wctx.moveTo(mx, 0); wctx.lineTo(mx+8, 0); wctx.lineTo(mx, 10); wctx.closePath(); wctx.fill();
  }
  wctx.fillStyle = getCss('--brass');
  wctx.fillRect(px - 1, 0, 2.5, H);
}
/* drag anywhere = selection · drag handles/markers to move · double-tap = seek */
const HIT_PX = 10;
function waveWidthCss(){ return wave.clientWidth || wave.getBoundingClientRect().width || 1; }
function hitTest(xCss, wCss){
  if (!state.duration) return { mode: 'none' };
  const xOf = t => t / state.duration * wCss;
  const cands = [];
  if (state.loopA != null) cands.push({ mode: 'a', d: Math.abs(xCss - xOf(state.loopA)) });
  if (state.loopB != null) cands.push({ mode: 'b', d: Math.abs(xCss - xOf(state.loopB)) });
  state.markers.forEach((m, idx) => cands.push({ mode: 'marker', idx, d: Math.abs(xCss - xOf(m.t)) + 2 }));
  cands.sort((p, q) => p.d - q.d);
  if (cands.length && cands[0].d <= HIT_PX) return { mode: cands[0].mode, idx: cands[0].idx };
  return { mode: 'select' };
}
let drag = null, lastTap = { t: 0, x: -99 };
wave.style.touchAction = 'none';
function evX(e){ const r = wave.getBoundingClientRect(); return e.clientX - r.left; }
function tAt(xCss){ return Math.min(state.duration, Math.max(0, xCss / waveWidthCss() * state.duration)); }
wave.addEventListener('pointerdown', e => {
  if (!state.duration) return;
  const x = evX(e);
  drag = Object.assign(hitTest(x, waveWidthCss()), { startX: x, anchorT: tAt(x), moved: false });
  try { wave.setPointerCapture(e.pointerId); } catch(_){}
});
wave.addEventListener('pointermove', e => {
  const x = evX(e);
  if (!drag){
    const h = hitTest(x, waveWidthCss());
    wave.style.cursor = (h.mode === 'select' || h.mode === 'none') ? 'crosshair' : 'ew-resize';
    return;
  }
  if (Math.abs(x - drag.startX) > 4) drag.moved = true;
  if (!drag.moved) return;
  const t = tAt(x);
  if (drag.mode === 'select'){
    state.loopA = Math.min(drag.anchorT, t);
    state.loopB = Math.max(drag.anchorT, t);
    renderLoop();
  } else if (drag.mode === 'a' || drag.mode === 'b'){
    state[drag.mode === 'a' ? 'loopA' : 'loopB'] = t;
    if (state.loopA != null && state.loopB != null && state.loopA > state.loopB){
      [state.loopA, state.loopB] = [state.loopB, state.loopA];
      drag.mode = drag.mode === 'a' ? 'b' : 'a';
    }
    renderLoop();
  } else if (drag.mode === 'marker'){
    state.markers[drag.idx].t = t;
  }
});
function endWaveDrag(e){
  if (!drag) return;
  const x = evX(e);
  if (!drag.moved){
    if (drag.mode === 'select' || drag.mode === 'none'){
      const now = performance.now();
      if (now - lastTap.t < 350 && Math.abs(x - lastTap.x) < 14){ seekTo(tAt(x)); lastTap = { t: 0, x: -99 }; }
      else lastTap = { t: now, x };
    }
  } else {
    if (drag.mode === 'marker'){ state.markers.sort((a, b) => a.t - b.t); renderMarkers(); }
    else { normLoop(); renderLoop(); applyLoopToEngine(); }
  }
  drag = null;
}
wave.addEventListener('pointerup', endWaveDrag);
wave.addEventListener('pointercancel', () => { drag = null; });
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
function renderLoop(){
  const el = $('loopState');
  if (state.loopA == null && state.loopB == null){
    el.innerHTML = '<span class="off">no loop set</span>';
  } else {
    const a = state.loopA != null ? fmt(state.loopA) : '—';
    const b = state.loopB != null ? fmt(state.loopB) : '—';
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
}
function normLoop(){
  if (state.loopA != null && state.loopB != null && state.loopB < state.loopA){
    [state.loopA, state.loopB] = [state.loopB, state.loopA];
  }
}
function setA(){ if (!state.fileURL) return; state.loopA = pos(); normLoop(); renderLoop(); applyLoopToEngine(); }
function setB(){ if (!state.fileURL) return; state.loopB = pos(); normLoop(); if (state.loopA != null) state.loopOn = true; renderLoop(); applyLoopToEngine(); }
function toggleLoop(){ if (state.loopA != null && state.loopB != null){ state.loopOn = !state.loopOn; renderLoop(); applyLoopToEngine(); } }
$('setA').addEventListener('click', setA);
$('setB').addEventListener('click', setB);
$('loopToggle').addEventListener('click', toggleLoop);
$('loopClear').addEventListener('click', () => {
  state.loopA = state.loopB = null; state.loopOn = false; renderLoop(); applyLoopToEngine();
});

/* ---------------- markers & session ---------------- */
function addMarker(){
  if (!state.fileURL) return;
  state.markers.push({ t: pos(), label: '' });
  state.markers.sort((a, b) => a.t - b.t);
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
    loop: { a: state.loopA, b: state.loopB },
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
      if (d.loop){ state.loopA = d.loop.a ?? null; state.loopB = d.loop.b ?? null; }
      if (d.settings){
        if (typeof d.settings.tempo === 'number') applyTempo(d.settings.tempo);
        if (typeof d.settings.semitones === 'number') state.semitones = d.settings.semitones;
        if (typeof d.settings.cents === 'number'){ state.cents = d.settings.cents; $('cents').value = state.cents; }
        applyPitch();
      }
      if (Array.isArray(d.regions)) state.regions = d.regions.filter(r => typeof r.start === 'number' && typeof r.end === 'number' && typeof r.pct === 'number');
      if (d.bpm && typeof d.bpm.bpm === 'number') state.bpm = d.bpm;
      lastEff = null;
      state.markers.sort((a, b) => a.t - b.t);
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
    if (active){
      const eff = effRateAt(p);
      if (lastEff === null || Math.abs(eff - lastEff) > 1e-9) setEngineRate(eff);
    }
    if (state.engine !== 'buffer' &&
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
    if (state.duration) drawWave();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

state.refA = 440;
applyTempo(100);
applyPitch();
setExportScope('sel');
renderRegions();
renderBpm();

/* pure functions exposed for the test harness */
window.VILAMBIT_TEST = { detectPitchHz, describePitch, encodeWav, interleave16, resampleLinear, granularShift, fmt,
  detectTempo, snapToGrid, segmentsFor, hitTest, effRateAt,
  _setDetected: (hz) => { state.refA = parseFloat($('refA').value) || 440; state.detected = describePitch(hz, state.refA); renderTune(); },
  _getShift: () => ({ semitones: state.semitones, cents: state.cents, tempo: state.tempo }),
  _setDuration: (d) => { state.duration = d; },
  _setLoop: (a, b) => { state.loopA = a; state.loopB = b; renderLoop(); },
  _setMarkers: (ms) => { state.markers = ms; renderMarkers(); },
  _getState: () => ({ loopA: state.loopA, loopB: state.loopB, regions: state.regions.map(r => ({...r})), bpm: state.bpm ? {...state.bpm} : null }) };
