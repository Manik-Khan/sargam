// smokes/vilambit-source-workspace.smoke.js — precision waveform and A–B source editing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

export const smokes = [
  {
    name: 'vilambit source workspace: entry page exposes zoom, pan, follow, and precise loop controls',
    async fn() {
      const html = await read('../public/vilambit.html');
      for (const id of [
        'waveZoomIn', 'waveZoomOut', 'waveZoomLoop', 'waveZoomAll',
        'wavePanBack', 'wavePanForward', 'waveFollow', 'waveViewRange',
        'loopAInput', 'loopBInput', 'loopDuration',
      ]) {
        assert.match(html, new RegExp(`id=["']${id}["']`));
      }
      assert.match(html, /data-loop-nudge="-0\.01"/);
      assert.match(html, /data-loop-nudge="0\.01"/);
    },
  },
  {
    name: 'vilambit source workspace: app maps waveform interactions through the visible time window',
    async fn() {
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(app, /Core\.normalizeViewWindow/);
      assert.match(app, /Core\.zoomViewWindow/);
      assert.match(app, /Core\.panViewWindow/);
      assert.match(app, /Core\.ensureTimeVisible/);
      assert.match(app, /view\.start \+ xCss \/ waveWidthCss\(\) \* view\.span/);
      assert.match(app, /drawDecodedWave/);
      assert.match(app, /followWaveAt\(p\)/);
    },
  },
  {
    name: 'vilambit source workspace: A and B edits remain routed through pure boundary helpers',
    async fn() {
      const app = await read('../public/vilambit/vilambit-app.js');
      assert.match(app, /Core\.parseTimecode/);
      assert.match(app, /Core\.setLoopBoundary/);
      assert.match(app, /Core\.nudgeLoopBoundary/);
      assert.match(app, /Loop duration:/);
      assert.match(app, /applyLoopToEngine\(\)/);
    },
  },
];
