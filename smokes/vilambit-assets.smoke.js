// smokes/vilambit-assets.smoke.js — static integration checks for the split player.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

export const smokes = [
  {
    name: 'sargam player: canonical entry page loads legacy-compatible split assets in order',
    async fn() {
      const html = await read('../public/sargam-player/index.html');
      assert.match(html, /<title>Sargam Music/);
      assert.match(html, /<link rel="stylesheet" href="\.\.\/vilambit\/vilambit\.css">/);
      const signal = html.indexOf('../vilambit/vendor/signalsmith-stretch.js');
      const flac = html.indexOf('../vilambit/vendor/libflac.js');
      const remoteWaveform = html.indexOf('../vilambit/vilambit-remote-waveform.js');
      const core = html.indexOf('../vilambit/vilambit-core.js');
      const app = html.indexOf('../vilambit/vilambit-app.js');
      assert.ok(signal >= 0 && flac > signal && remoteWaveform > flac && core > remoteWaveform && app > core);
      assert.doesNotMatch(html, /Vilambit v2 — the musician's practice player/);
      assert.doesNotMatch(html, /var SignalsmithStretch =/);
    },
  },
  {
    name: 'sargam player: old Vilambit URL redirects while preserving query parameters',
    async fn() {
      const legacy = await read('../public/vilambit.html');
      assert.match(legacy, /url=sargam-player\//);
      assert.match(legacy, /window\.location\.search \+ window\.location\.hash/);
      assert.match(legacy, /window\.location\.replace\(target\)/);
    },
  },
  {
    name: 'sargam player: archive URLs load in same-origin streaming mode',
    async fn() {
      const html = await read('../public/sargam-player/index.html');
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(html, /id="sourceNotice"/);
      assert.match(app, /new URLSearchParams\(window\.location\.search\)/);
      assert.match(app, /params\.get\('src'\)/);
      assert.match(app, /url\.origin !== window\.location\.origin/);
      assert.match(app, /engine: archive streaming/);
      assert.match(app, /The recording stays on the host/);
      assert.doesNotMatch(app, /function loadArchiveURL[\s\S]{0,1200}arrayBuffer\(/);
    },
  },
  {
    name: 'sargam player: archive profile keeps practice tools and removes unfinished analysis and export UI',
    async fn() {
      const html = await read('../public/sargam-player/index.html');
      const css = await read('../public/vilambit/vilambit.css');
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(html, /tuningCard archiveUnsupported/);
      assert.match(html, /<!-- BEATS -->\s*<details class="card collapsibleCard archiveUnsupported">/);
      assert.match(html, /<!-- SPEED REGIONS -->\s*<details class="card collapsibleCard">/);
      assert.match(html, /<!-- EXPORT -->\s*<details class="card collapsibleCard archiveUnsupported">/);
      assert.match(css, /body\.archiveMode[\s\S]*?\.archiveUnsupported\{display:none!important\}/);
      assert.match(app, /setArchiveMode\(true\)/);
      assert.match(app, /captureLiveWaveform\(p\)/);
      assert.match(app, /fetchApproximateWavPeaks/);
    },
  },
  {
    name: 'sargam player: video uses a custom fullscreen practice shell without native download controls',
    async fn() {
      const html = await read('../public/sargam-player/index.html');
      const css = await read('../public/vilambit/vilambit.css');
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(html, /controlslist="nodownload noremoteplayback noplaybackrate"/);
      assert.match(html, /id="videoFullscreen"/);
      assert.match(html, /id="videoPanel"/);
      assert.match(html, /id="videoTempo"/);
      assert.match(html, /id="videoSetA"/);
      assert.match(html, /id="videoMarkerJump"/);
      assert.match(css, /#videoWrap:fullscreen/);
      assert.match(app, /requestFullscreen \|\| wrap\.webkitRequestFullscreen/);
      assert.match(app, /if \(state\.archive\) event\.preventDefault\(\)/);
    },
  },
  {
    name: 'sargam player: approved Chronicle composition wraps the live player controls',
    async fn() {
      const html = await read('../public/sargam-player/index.html');
      const css = await read('../public/vilambit/vilambit.css');
      const app = await read('../public/vilambit/vilambit-app.js');
      const shell = await read('../src/shell/App.jsx');
      assert.match(html, /class="music-heading"/);
      assert.match(html, /id="workspaceProjectTitle"/);
      assert.match(html, /<h2>Practice<\/h2>/);
      assert.match(html, /class="cardIndex"[^>]*>I<\/span>/);
      assert.match(html, /class="cardIndex"[^>]*>II<\/span>/);
      assert.match(html, /class="loopReadout"/);
      assert.match(html, /class="loopEditorDetails"/);
      assert.match(html, /data-cent="-10"/);
      assert.match(html, /data-cent="10"/);
      assert.match(css, /\.music-heading\{[\s\S]*?width:min\(820px,100%\)/);
      assert.match(css, /body\{[\s\S]*?background:transparent/);
      assert.match(css, /#controls\.on\{\s*display:grid;\s*grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
      assert.match(css, /#controls > \.playbackCard[\s\S]*?#controls > \.loopMarkersCard/);
      assert.match(app, /function syncWorkspaceContext\(\)/);
      assert.match(shell, /data-project-title=\{doc\.directives\.raga \|\| ''\}/);
      assert.match(shell, /data-project-tal=\{doc\.directives\.tal \|\| ''\}/);
    },
  },
  {
    name: 'vilambit: split assets retain vendor engines and app test hook',
    async fn() {
      const signal = await read('../public/vilambit/vendor/signalsmith-stretch.js');
      const flac = await read('../public/vilambit/vendor/libflac.js');
      const core = await read('../public/vilambit/vilambit-core.js');
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(signal, /var SignalsmithStretch =/);
      assert.match(flac, /window\.Flac|Flac/);
      assert.match(core, /root\.VilambitCore/);
      assert.match(app, /window\.VilambitCore/);
      assert.match(app, /Vilambit v2 — the musician's practice player/);
      assert.match(app, /window\.VILAMBIT_TEST/);
    },
  },
  {
    name: 'vilambit: app routes position and seek through the pure core',
    async fn() {
      const core = await read('../public/vilambit/vilambit-core.js');
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(app, /Core\.currentPosition/);
      assert.match(app, /Core\.planSeek/);
      assert.match(core, /engine === ENGINE_NONE/);
      assert.match(core, /writePausedPosition: true/);
      assert.match(core, /writeMediaTime: true/);
    },
  },
];
