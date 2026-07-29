// Browser-shell boot checks for archive mode. Media and audio remain mocked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

export const smokes = [
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
