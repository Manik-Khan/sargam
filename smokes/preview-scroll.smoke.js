// smokes/preview-scroll.smoke.js — stable notation position while typing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  lineAnchoredScrollTop,
  previewAnchorIdentity,
  previewLineElement,
  previewSourceLine,
} from '../src/shell/preview-scroll.js';

export const smokes = [
  {
    name: 'preview scroll: active line keeps its viewport position after reflow above it',
    fn() {
      assert.equal(lineAnchoredScrollTop({
        scrollTop: 420,
        beforeTop: 180,
        afterTop: 224,
        scrollHeight: 1800,
        clientHeight: 600,
      }), 464);
      assert.equal(lineAnchoredScrollTop({
        scrollTop: 20,
        beforeTop: 140,
        afterTop: 90,
        scrollHeight: 1800,
        clientHeight: 600,
      }), 0);
    },
  },
  {
    name: 'preview scroll: invalid anchors leave manual scroll untouched',
    fn() {
      assert.equal(lineAnchoredScrollTop({
        scrollTop: 315,
        beforeTop: undefined,
        afterTop: 200,
      }), 315);
    },
  },
  {
    name: 'preview scroll: source lookup prefers the complete rendered line group',
    fn() {
      const group = { id: 'group' };
      const fallback = { id: 'fallback' };
      const root = {
        querySelector(selector) {
          if (selector.startsWith('.sr-line-group')) return group;
          return fallback;
        },
      };
      assert.equal(previewLineElement(root, 12), group);
      assert.equal(previewLineElement(root, 0), null);
    },
  },
  {
    name: 'preview scroll: bol attachment lanes remain attached to their music source line',
    fn() {
      const doc = { sections: [{ lines: [{ sourceLine: 10 }, { sourceLine: 15 }] }] };
      assert.equal(previewSourceLine(doc, 11), 10);
      assert.equal(previewSourceLine(doc, 12, { sourceLine: 10, ordinal: 3 }), 10);
      const attack = {
        getAttribute(name) {
          return name === 'data-anchor-line' ? '10' : name === 'data-anchor-ordinal' ? '3' : null;
        },
      };
      assert.deepEqual(previewAnchorIdentity(attack), { kind: 'attack', sourceLine: 10, ordinal: 3 });
    },
  },
  {
    name: 'preview scroll: render replacement captures and restores the active line synchronously',
    async fn() {
      const preview = await readFile(new URL('../src/shell/PreviewPane.jsx', import.meta.url), 'utf8');
      const css = await readFile(new URL('../src/shell/sargam.css', import.meta.url), 'utf8');
      assert.match(preview, /useLayoutEffect\(\(\) => \{[\s\S]*?beforeAnchor[\s\S]*?replaceChildren\(el\)[\s\S]*?afterAnchor[\s\S]*?lineAnchoredScrollTop/);
      assert.match(css, /\.app-preview\s*\{[\s\S]*?overflow-anchor:\s*none/);
    },
  },
];
