import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  centeredElementScrollTop,
  centeredLineScrollTop,
  sourceLineRange,
} from '../src/shell/editor-nav.js';

export const smokes = [
  {
    name: 'editor navigation: source lines resolve to exact textarea ranges',
    fn() {
      const text = 'title: Test\n\nGat\nS R g\nA\n@4 m D n';
      assert.deepEqual(sourceLineRange(text, 4), { start: 17, end: 22, line: 4 });
      assert.equal(text.slice(17, 22), 'S R g');
      assert.deepEqual(sourceLineRange(text, 6), { start: 25, end: text.length, line: 6 });
    },
  },
  {
    name: 'editor navigation: a rendered matra centers inside the Grid Write pane',
    fn() {
      assert.equal(centeredElementScrollTop({
        scrollTop: 320,
        containerTop: 600,
        containerHeight: 360,
        elementTop: 980,
        elementHeight: 72,
      }), 556);
      assert.equal(centeredElementScrollTop({
        scrollTop: 0,
        containerTop: 600,
        containerHeight: 360,
        elementTop: 620,
        elementHeight: 72,
      }), 0);
    },
  },
  {
    name: 'editor navigation: invalid line numbers clamp safely',
    fn() {
      assert.deepEqual(sourceLineRange('a\nb', -9), { start: 0, end: 1, line: 1 });
      assert.deepEqual(sourceLineRange('a\nb', 99), { start: 2, end: 3, line: 2 });
      assert.deepEqual(sourceLineRange('', 1), { start: 0, end: 0, line: 1 });
    },
  },
  {
    name: 'editor navigation: selected line is centered when space allows',
    fn() {
      assert.equal(
        centeredLineScrollTop({ line: 20, lineHeight: 20, paddingTop: 16, clientHeight: 200 }),
        306,
      );
      assert.equal(
        centeredLineScrollTop({ line: 1, lineHeight: 20, paddingTop: 16, clientHeight: 200 }),
        0,
      );
    },
  },
  {
    name: 'editor navigation: CodeMirror and rendered notation synchronize repeated line selections',
    fn() {
      const editor = readFileSync(new URL('../src/shell/EditorPane.jsx', import.meta.url), 'utf8');
      const gridEditor = readFileSync(new URL('../src/shell/GridEditor.jsx', import.meta.url), 'utf8');
      const app = readFileSync(new URL('../src/shell/App.jsx', import.meta.url), 'utf8');
      const preview = readFileSync(new URL('../src/shell/PreviewPane.jsx', import.meta.url), 'utf8');
      const render = readFileSync(new URL('../src/engine/render.js', import.meta.url), 'utf8');
      const css = readFileSync(new URL('../src/shell/sargam.css', import.meta.url), 'utf8');

      assert.match(editor, /centerSelection\(\)[\s\S]*?EditorView\.scrollIntoView/);
      assert.match(app, /syncSourceLineFromEditor[\s\S]*?setSourceSyncRevision/);
      assert.match(app, /typeof el\.centerSelection === 'function'/);
      assert.match(app, /editorSyncTargetRef\.current = range\.line[\s\S]*?requestAnimationFrame/);
      assert.match(app, /pendingTarget !== null[\s\S]*?sourceLine !== pendingTarget\) return[\s\S]*?editorSyncTargetRef\.current = null/);
      assert.match(app, /writeMode === 'grid'[\s\S]*?setGridSelection[\s\S]*?activeSelection=\{gridSelection\}/);
      assert.match(app, /modeSwitchTargetRef[\s\S]*?previewSourceLine[\s\S]*?focusSourceLine/);
      assert.match(app, /goToNotationBeginning[\s\S]*?↑ Beginning/);
      assert.match(gridEditor, /activeSelection[\s\S]*?centeredElementScrollTop[\s\S]*?preventScroll/);
      assert.match(gridEditor, /data-source-line=\{row\.sourceLine\}[\s\S]*?data-matra-index=\{cell\.matraIndex\}/);
      assert.match(preview, /syncRevision[\s\S]*?activeLine,\s*syncRevision/);
      assert.match(render, /sr-source-active/);
      assert.match(css, /\.app-preview \.sr-source-active/);
      assert.match(css, /\.app-grid-write-cell\.is-selected/);
    },
  },
];
