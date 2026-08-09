// smokes/preview-scroll.smoke.js — stable notation position while typing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  lineAnchoredScrollTop,
  previewAnchorIdentity,
  previewAnchorElement,
  previewLineElement,
  previewSourceLine,
  revealElementScrollTop,
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
    name: 'preview scroll: the selected Grid Write matra is the stable editing anchor',
    fn() {
      const cell = {
        classList: { contains: (name) => name === 'sr-cell' },
        getAttribute: (name) => name === 'data-matra' ? '7' : null,
        closest: (selector) => selector === '[data-source-line]'
          ? { getAttribute: () => '61' }
          : null,
      };
      const root = {
        querySelector(selector) {
          return selector.includes('data-source-line="61"') && selector.includes('data-matra="7"')
            ? cell
            : null;
        },
      };
      assert.equal(previewAnchorElement(root, 61, null, { sourceLine: 61, matraIndex: 7 }), cell);
      assert.deepEqual(previewAnchorIdentity(cell), { kind: 'matra', sourceLine: 61, matraIndex: 7 });
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
    name: 'preview scroll: playback reveal moves only the score scroller',
    fn() {
      assert.equal(revealElementScrollTop({
        scrollTop: 300,
        scrollerTop: 100,
        scrollerBottom: 500,
        elementTop: 520,
        elementBottom: 560,
        scrollHeight: 1600,
        clientHeight: 400,
      }), 388);
      assert.equal(revealElementScrollTop({
        scrollTop: 300,
        scrollerTop: 100,
        scrollerBottom: 500,
        elementTop: 220,
        elementBottom: 260,
        scrollHeight: 1600,
        clientHeight: 400,
      }), 300);
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
