// Browser-shell boot checks for archive mode. Media and audio remain mocked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

export const smokes = [
  {
    name: 'sargam player: recordings can be replaced without reloading the workspace',
    async fn() {
      const [html, css, app] = await Promise.all([
        read('../public/sargam-player/index.html'),
        read('../public/vilambit/vilambit.css'),
        read('../public/vilambit/vilambit-app.js'),
      ]);
      assert.match(html, /id="openBtn">Choose recording/);
      assert.match(css, /body\.hasSource \.music-source-meta #openBtn\{display:inline-flex\}/);
      assert.match(app, /function disposeAudioGraph\(\)/);
      assert.match(app, /\$\('openBtn'\)\.textContent = 'Change recording…'/);
      assert.doesNotMatch(app, /location\.reload\(\)/);
    },
  },
  {
    name: 'sargam player: EQ is audible, project-persistent, and archive-profile aware',
    async fn() {
      const [html, app, core] = await Promise.all([
        read('../public/sargam-player/index.html'),
        read('../public/vilambit/vilambit-app.js'),
        read('../public/vilambit/vilambit-core.js'),
      ]);
      assert.match(html, /EQ &amp; Restoration/);
      assert.match(html, /id="eqHighPass"/);
      assert.match(html, /id="eqLowPass"/);
      assert.match(app, /function buildEqGraph\(\)/);
      assert.match(app, /type = 'highpass'/);
      assert.match(app, /type = 'lowpass'/);
      assert.match(app, /kind: 'sargam-eq-profile'/);
      assert.match(app, /payload\.kind !== 'sargam-eq-profiles'/);
      assert.match(core, /function normalizeEqSettings/);
    },
  },
  {
    name: 'sargam player: integrated video enables live waveform capture outside archive mode',
    async fn() {
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(
        app,
        /else if \(state\.isVideo\) \{\s*ensureLiveWaveform\('Video waveform builds during playback'\);/,
      );
      assert.match(
        app,
        /function captureLiveWaveform\(time\)\{\s*if \(state\.waveformMode !== 'live'/,
      );
      assert.doesNotMatch(
        app,
        /function captureLiveWaveform\(time\)\{\s*if \(!state\.archive/,
      );
    },
  },
  {
    name: 'sargam player: missing class-audio sidecars request one lazy host build',
    async fn() {
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(app, /async function requestHostWaveform\(sourceURL\)/);
      assert.match(app, /RemoteWaveform\.workerURLForSource\(sourceURL\)/);
      assert.match(app, /if \(sidecarMissing && await beginHostWaveform\(sourceURL\)\) return;/);
      assert.match(app, /Preparing complete waveform on archive host/);
      assert.match(app, /pollHostWaveform\(sourceURL, generation\)/);
    },
  },
  {
    name: 'sargam player: archive shell boots with every custom video and waveform control wired',
    async fn() {
      const [html, remoteWaveform, core, app] = await Promise.all([
        read('../public/sargam-player/index.html'),
        read('../public/vilambit/vilambit-remote-waveform.js'),
        read('../public/vilambit/vilambit-core.js'),
        read('../public/vilambit/vilambit-app.js'),
      ]);
      const dom = new JSDOM(html, {
        url: 'http://10.0.0.2/sargam-player/?src=%2Fclassaudio%2Ftest.wav',
        runScripts: 'outside-only',
        pretendToBeVisual: true,
      });
      const { window } = dom;
      window.requestAnimationFrame = () => 1;
      window.cancelAnimationFrame = () => {};
      window.fetch = async () => ({ ok: false, status: 404 });
      window.HTMLMediaElement.prototype.load = () => {};
      window.HTMLMediaElement.prototype.play = async () => {};
      window.HTMLMediaElement.prototype.pause = () => {};
      window.HTMLCanvasElement.prototype.getContext = () => ({
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        drawImage() {},
        fillText() {},
        save() {},
        restore() {},
      });
      window.eval(remoteWaveform);
      window.eval(core);
      window.eval(app);

      assert.ok(window.document.body.classList.contains('archiveMode'));
      assert.equal(window.document.querySelector('#videoFullscreen').disabled, false);
      assert.equal(window.document.querySelector('#videoPanel').getAttribute('aria-hidden'), 'true');
      assert.equal(window.document.querySelector('#waveStatus').textContent, '');
      assert.equal(window.document.querySelector('#sourceNotice').classList.contains('ok'), true);
      assert.equal(window.document.querySelector('#fileName').textContent, 'test.wav');
      dom.window.close();
    },
  },
];
