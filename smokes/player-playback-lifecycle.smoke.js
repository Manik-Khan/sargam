import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

export async function player() {
  const root = new URL('../', import.meta.url);
  const [html, core, app] = await Promise.all([
    'public/sargam-player/index.html', 'public/vilambit/vilambit-core.js',
    'public/vilambit/vilambit-app.js',
  ].map(path => readFile(new URL(path, root), 'utf8')));
  const dom = new JSDOM(html, { url: 'http://localhost/sargam-player/', runScripts: 'outside-only' });
  const w = dom.window;
  const stats = { contexts: 0, connections: 0, plays: 0, closed: 0, nodes: [] };
  const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {} });
  const node = () => {
    const n = { gain: param(), Q: param(), frequency: param(), connect() {}, disconnect() { n.disconnected = true; },
      addBuffers() {}, dropBuffers() {}, setUpdateInterval() {}, start() {}, schedule() {}, inputTime: 0,
      getFloatTimeDomainData() {}, getByteTimeDomainData() {} };
    stats.nodes.push(n);
    return n;
  };
  const bound = new WeakSet();
  w.AudioContext = class {
    constructor() { stats.contexts++; this.state = 'running'; this.destination = node(); this.currentTime = 0; }
    createGain() { return node(); }
    createScriptProcessor() { return node(); }
    createBiquadFilter() { return node(); }
    createAnalyser() { return node(); }
    createMediaElementSource(el) {
      if (bound.has(el)) throw new w.DOMException('Media element already connected', 'InvalidStateError');
      bound.add(el); stats.connections++; return node();
    }
    async resume() { this.state = 'running'; }
    async close() { this.state = 'closed'; stats.closed++; }
  };
  w.SignalsmithStretch = async () => node();
  w.console.warn = () => {};
  w.requestAnimationFrame = () => 1;
  w.cancelAnimationFrame = () => {};
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
  w.HTMLMediaElement.prototype.load = () => {};
  let paused = true;
  Object.defineProperty(w.HTMLMediaElement.prototype, 'paused', { get: () => paused });
  w.HTMLMediaElement.prototype.pause = function() { paused = true; this.dispatchEvent(new w.Event('pause')); };
  w.HTMLMediaElement.prototype.play = async function() {
    if (stats.playError) throw stats.playError;
    stats.plays++; paused = false; this.dispatchEvent(new w.Event('play'));
  };
  w.eval(core);
  w.eval(app + '\nwindow.testPlayer = { loadFile, record: () => localRecording, resetSourceState, togglePlay, buildGraph, state, media, setDecoded(value) { state.decoded = value; }, graph() { return {actx, srcNode, stretch}; } };');
  const p = w.testPlayer;
  const load = name => {
    p.resetSourceState({ url: `blob:http://localhost/${name}`, name, archive: false });
    Object.defineProperty(p.media, 'duration', { configurable: true, value: 31 });
    Object.defineProperty(p.media, 'videoWidth', { configurable: true, value: name.endsWith('.mp4') ? 480 : 0 });
    p.media.dispatchEvent(new w.Event('loadedmetadata'));
  };
  return { w, p, stats, node, load, close: () => w.close() };
}

export const smokes = [
  { name: 'player lifecycle: successive local videos reuse one media audio connection', async fn() {
    const t = await player();
    try {
      for (const name of ['first.mp4', 'second.mp4', 'first.mp4']) {
        t.load(name); await t.p.togglePlay();
        assert.equal(t.p.media.paused, false, name + ' should play');
        assert.equal(t.p.state.engine, 'video');
      }
      assert.equal(t.stats.plays, 3);
      assert.equal(t.stats.connections, 1);
      assert.equal(t.stats.closed, 0);
    } finally { t.close(); }
  } },
  { name: 'player lifecycle: video, decoded audio, and video preserve playback and pre-play seek', async fn() {
    const t = await player();
    try {
      t.load('first.mp4'); await t.p.togglePlay();
      t.load('song.m4a');
      t.p.setDecoded({ getChannelData: () => new Float32Array(4), numberOfChannels: 2 });
      t.p.state.posPaused = 12;
      await t.p.togglePlay();
      assert.equal(t.p.state.engine, 'buffer');
      assert.equal(t.p.state.playing, true);
      assert.equal(t.p.state.posPaused, 12);
      t.load('last.mp4'); await t.p.togglePlay();
      assert.equal(t.p.media.paused, false);
      assert.equal(t.stats.connections, 1);
    } finally { t.close(); }
  } },
  { name: 'player lifecycle: local file errors do not claim archive URL failure', async fn() {
    const t = await player();
    try {
      t.load('bad.m4a');
      Object.defineProperty(t.p.media, 'error', { value: { code: 4 }, configurable: true });
      t.p.media.dispatchEvent(new t.w.Event('error'));
      const message = t.w.document.querySelector('#sourceNotice').textContent;
      assert.match(message, /local|browser/i);
      assert.doesNotMatch(message, /archive|URL/);
    } finally { t.close(); }
  } },
  { name: 'player lifecycle: replacing a recording during setup cancels stale playback', async fn() {
    const t = await player();
    try {
      let finishOld;
      t.w.SignalsmithStretch = () => new Promise(resolve => { finishOld = resolve; });
      t.load('old.mp4');
      const oldPlay = t.p.togglePlay();
      t.load('new.mp4');
      t.w.SignalsmithStretch = async () => t.node();
      await t.p.togglePlay();
      const active = t.p.graph().stretch;
      const stale = t.node();
      finishOld(stale);
      assert.equal(await oldPlay, false);
      assert.equal(t.stats.plays, 1);
      assert.equal(t.p.graph().stretch, active);
      assert.equal(stale.disconnected, true);
      assert.equal(t.p.media.paused, false);
    } finally { t.close(); }
  } },
  { name: 'player lifecycle: rapid Play clicks share setup instead of starting a partial graph', async fn() {
    const t = await player();
    try {
      let finish;
      t.w.SignalsmithStretch = () => new Promise(resolve => { finish = resolve; });
      t.load('clip.mp4');
      const first = t.p.togglePlay();
      const second = t.p.togglePlay();
      assert.equal(first, second);
      assert.equal(t.stats.plays, 0);
      finish(t.node());
      await first;
      assert.equal(t.stats.plays, 1);
      assert.equal(t.stats.connections, 1);
    } finally { t.close(); }
  } },
  { name: 'player lifecycle: rejected playback reports an error and can be retried', async fn() {
    const t = await player();
    try {
      t.load('clip.mp4');
      t.stats.playError = new t.w.DOMException('Blocked', 'NotAllowedError');
      assert.equal(await t.p.togglePlay(), false);
      assert.match(t.w.document.querySelector('#sourceNotice').textContent, /blocked/i);
      assert.equal(t.p.media.paused, true);
      t.stats.playError = null;
      assert.equal(await t.p.togglePlay(), true);
      assert.equal(t.p.media.paused, false);
      assert.equal(t.w.document.querySelector('#sourceNotice').textContent, '');
      assert.equal(t.stats.connections, 1);
    } finally { t.close(); }
  } },
  { name: 'player lifecycle: compatibility playback also survives recording changes', async fn() {
    const t = await player();
    try {
      t.w.SignalsmithStretch = undefined;
      for (const name of ['one.mp4', 'two.mp4']) {
        t.load(name);
        assert.equal(await t.p.togglePlay(), true);
        assert.equal(t.p.state.engine, 'fallback');
      }
      assert.equal(t.stats.connections, 1);
      assert.equal(t.stats.plays, 2);
    } finally { t.close(); }
  } },
  { name: 'player lifecycle: archive errors retain archive-specific guidance', async fn() {
    const t = await player();
    try {
      t.p.resetSourceState({ url: 'http://localhost/classaudio/missing.mp4', name: 'missing.mp4', archive: true });
      t.p.media.dispatchEvent(new t.w.Event('error'));
      assert.match(t.w.document.querySelector('#sourceNotice').textContent, /archive.*URL/);
    } finally { t.close(); }
  } },

];
