import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

export const smokes = [
  {
    name: 'workspace shell: branded header exposes Music, Notation, File, and Queue',
    async fn() {
      const toolbar = await read('../src/shell/Toolbar.jsx');
      for (const phrase of [
        '/aacm-logo-2015.jpg',
        'Notation',
        'Music',
        'File',
        'Queue',
        'Open recording',
      ]) {
        assert.ok(toolbar.includes(phrase), `missing ${phrase}`);
      }
      assert.doesNotMatch(toolbar, /File\s*<span[^>]*>\d/);
      assert.doesNotMatch(toolbar, /Queue\s*<span[^>]*>\d/);
      assert.match(toolbar, />Save<\/button>/);
      assert.match(toolbar, />Print \/ PDF<\/button>/);
    },
  },
  {
    name: 'workspace shell: notation click is single view while drag opens split',
    async fn() {
      const rail = await read('../src/shell/WorkspaceRail.jsx');
      assert.match(rail, /onView\('notation'\)/);
      assert.match(rail, /event\.clientX - drag\.current\.startX < 28/);
      assert.match(rail, /onView\('split'\)/);
      assert.match(rail, /Ali Akbar College of Music/);
    },
  },
  {
    name: 'workspace shell: player iframe stays mounted across all three view modes',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      const css = await read('../src/shell/sargam.css');
      assert.match(app, /'notation' \| 'vilambit' \| 'split'/);
      assert.match(app, /<WorkspaceRail[\s\S]*?<iframe[\s\S]*?ref=\{vilambitRef\}/);
      assert.match(app, /view === 'notation' \? ' app-veiled' : ''/);
      assert.match(app, /workspace-split-divider/);
      assert.match(
        css,
        /\.app-stage > \.app-vilambit\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;[\s\S]*?width:\s*100%;[\s\S]*?background:\s*transparent;/,
      );
      assert.match(
        css,
        /\.app-workspace-split > \.app-vilambit\s*\{[\s\S]*?width:\s*100%/,
      );
    },
  },
];
