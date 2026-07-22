// Phase 3C — shell wiring for one-file portable projects.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

export const smokes = [
  {
    name: 'portable project UI: Project menu opens and exports one .sargam file',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      const toolbar = await read('../src/shell/Toolbar.jsx');
      assert.match(toolbar, /Open Portable Project…/);
      assert.match(toolbar, /Export Portable \.sargam…/);
      assert.match(app, /buildPortableProject\(/);
      assert.match(app, /savePortableFile\(blob, name\)/);
      assert.match(app, /parsePortableProject\(await file\.arrayBuffer\(\)\)/);
    },
  },
  {
    name: 'portable project UI: dropped packages validate before destination access',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      const dialog = await read('../src/shell/PortableProjectImport.jsx');
      assert.match(app, /window\.addEventListener\('drop', onDrop\)/);
      assert.match(app, /readPortableCandidate\(file\)/);
      assert.match(dialog, /Choose Destination Folder…/);
      assert.match(dialog, /new independent project/i);
    },
  },
  {
    name: 'portable project UI: package safety limits and missing clips narrate',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      assert.match(app, /PORTABLE_HARD_LIMIT_BYTES/);
      assert.match(app, /PORTABLE_SOFT_LIMIT_BYTES/);
      assert.match(app, /Portable project rejected/);
      assert.match(app, /Check the Clip Vault/);
    },
  },
];
