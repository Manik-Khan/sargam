// Static checks for the small Windows archive-server deployment payload.
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  PLAYER_SERVER_FILES,
  PLAYER_SERVER_OUTPUT,
} from '../scripts/build-player-server.mjs';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

export const smokes = [
  {
    name: 'player server: package exposes a dedicated static-bundle command',
    async fn() {
      const pkg = JSON.parse(await read('../package.json'));
      assert.equal(pkg.scripts['build:player-server'], 'node scripts/build-player-server.mjs');
      assert.equal(pkg.scripts['build:waveform-worker'], 'node scripts/build-waveform-worker.mjs');
      assert.equal(PLAYER_SERVER_OUTPUT, 'dist-player');
    },
  },
  {
    name: 'player server: allow-list contains every required asset and no duplicate app',
    async fn() {
      for (const relative of PLAYER_SERVER_FILES) {
        await access(new URL(`../${relative}`, import.meta.url));
      }
      assert.ok(PLAYER_SERVER_FILES.includes('public/sargam-player/index.html'));
      assert.ok(PLAYER_SERVER_FILES.includes('public/vilambit/vilambit-app.js'));
      assert.ok(PLAYER_SERVER_FILES.includes('public/vilambit/vilambit-remote-waveform.js'));
      assert.ok(PLAYER_SERVER_FILES.includes('public/vilambit/vendor/signalsmith-stretch.js'));
      assert.ok(PLAYER_SERVER_FILES.includes('public/vilambit/vendor/libflac.js'));
      assert.ok(!PLAYER_SERVER_FILES.some((file) => file.includes('vilambit-app 2.js')));
      assert.ok(!PLAYER_SERVER_FILES.some((file) => file.startsWith('src/')));
      assert.ok(!PLAYER_SERVER_FILES.some((file) => file.includes('node_modules')));
    },
  },
  {
    name: 'player server: deployment guide keeps player and audio on one origin',
    async fn() {
      const guide = await read('../docs/sargam-player-windows-server.md');
      assert.match(guide, /http:\/\/10\.0\.0\.2\/sargam-player\/\?src=/);
      assert.match(guide, /classaudio/);
      assert.match(guide, /Accept-Ranges: bytes/);
      assert.match(guide, /206 Partial Content/);
      assert.match(guide, /does not require Node, npm, Vite, or FileMaker at runtime/);
    },
  },
];
