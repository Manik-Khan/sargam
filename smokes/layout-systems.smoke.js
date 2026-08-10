// Responsive musical-system layout + Bageshri starter (2026-07-18).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { renderDocument, renderExport } from '../src/engine/render.js';
import { getTal } from '../src/engine/tala.js';
import { isSafeBreak, planLineSystems } from '../src/engine/layout.js';
import { BAGESHRI_STARTER } from '../src/examples/bageshri.js';

const shellCss = readFileSync(new URL('../src/shell/sargam.css', import.meta.url), 'utf8');
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;

export const smokes = [
  {
    name: 'systems: a long source line folds into whole-matra ranges',
    fn() {
      const { doc } = parseDocument('tal: rupak\n\nS R g m P d n S R g m P d n\n');
      const line = doc.sections[0].lines[0];
      const ranges = planLineSystems(line, getTal('rupak'), { maxEm: 18 });
      assert.ok(ranges.length > 1);
      assert.equal(ranges[0].from, 0);
      assert.equal(ranges.at(-1).to, line.matras.length - 1);
      for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i].from, ranges[i - 1].to + 1);
    },
  },
  {
    name: 'systems: a ranged slide is never divided between systems',
    fn() {
      const { doc } = parseDocument('tal: rupak\n\nS R ~(g m P d) n S R g m\n');
      const line = doc.sections[0].lines[0];
      const ranges = planLineSystems(line, getTal('rupak'), { maxEm: 10 });
      const slide = line.spans.find((s) => s.type === 'meend');
      for (const range of ranges) {
        const cutsSlide = range.to >= slide.from.matraIndex && range.to < slide.to.matraIndex;
        assert.equal(cutsSlide, false, `system ended inside slide at ${range.to}`);
      }
    },
  },
  {
    name: 'systems: a two-note Diri is never divided between printed systems',
    fn() {
      const { doc, problems } = parseDocument('tal: tintal\n\nS R G m\n> . di-ri .\n');
      assert.deepEqual(problems, []);
      const line = doc.sections[0].lines[0];
      assert.equal(isSafeBreak(line, 0), true);
      assert.equal(isSafeBreak(line, 1), false);
      assert.equal(isSafeBreak(line, 2), true);
    },
  },
  {
    name: 'systems: Graph Paper gives dense matras real multi-square spans',
    fn() {
      const source = `tal: jhaptal\n\n${Array(10).fill('SSSS').join(' ')}\n`;
      const { doc } = parseDocument(source);
      const line = doc.sections[0].lines[0];
      assert.deepEqual(
        planLineSystems(line, getTal('jhaptal'), { maxEm: 52, graphColumns: 20 }),
        [{ from: 0, to: 9, reason: 'fits' }]
      );
      assert.ok(
        planLineSystems(line, getTal('jhaptal'), { graphColumns: 10 }).length > 1,
        'ten two-square matras fold instead of overflowing ten paper squares'
      );
      assert.ok(
        planLineSystems(line, getTal('jhaptal'), { maxEm: 26 }).length > 1,
        'ordinary notation still reserves extra width for dense matras'
      );
    },
  },
  {
    name: 'systems: rendered Graph Paper cells span the same columns charged by planning',
    fn() {
      const { doc } = parseDocument('tal: tintal\n\nS SSSS ((SSSS)x3)\n');
      const root = renderDocument(doc, { graphPaper: true, graphColumns: 8, maxSystemEm: 20.8 });
      const cells = [...root.querySelectorAll('.sr-line-block:first-child .sr-cell')];
      assert.equal(cells[0].dataset.gridSpan, '1');
      assert.equal(cells[1].dataset.gridSpan, '2');
      assert.equal(cells[2].dataset.gridSpan, '3');
      assert.match(cells[1].style.gridColumn, /\/ 4$/);
      assert.match(cells[2].style.gridColumn, /\/ 7$/);
    },
  },
  {
    name: 'systems: Graph Paper counts repeat punctuation as structural cells',
    fn() {
      const { doc } = parseDocument(`tal: jhaptal\n\n||: ${Array(10).fill('S').join(' ')} :||\n`);
      const line = doc.sections[0].lines[0];
      assert.deepEqual(
        planLineSystems(line, getTal('jhaptal'), { graphColumns: 12 }),
        [{ from: 0, to: 9, reason: 'fits' }]
      );
      assert.ok(planLineSystems(line, getTal('jhaptal'), { graphColumns: 11 }).length > 1);
    },
  },
  {
    name: 'systems: rendered folds retain original absolute matra indices',
    fn() {
      const { doc } = parseDocument('tal: rupak\n\nS R g m P d n S R g m P d n\n');
      const root = renderDocument(doc, { maxSystemEm: 18 });
      assert.ok(root.querySelectorAll('.sr-line-block').length > 1);
      const indices = [...root.querySelectorAll('.sr-cell')].map((c) => Number(c.dataset.matra));
      assert.deepEqual(indices, Array.from({ length: 14 }, (_, i) => i));
      assert.equal(root.querySelectorAll('[style*="zoom"]').length, 0);
    },
  },
  {
    name: 'systems: folded continuations keep the same left origin',
    fn() {
      assert.match(
        shellCss,
        /\.sr-line-block\[data-system-index\] \.sr-row \{ margin-inline-start: 0; \}/,
      );
      assert.doesNotMatch(
        shellCss,
        /data-system-index[^}]*margin-left:\s*1\.45em/s,
      );
    },
  },
  {
    name: 'systems: repeat glyphs and return cue live only at the outer edges',
    fn() {
      const src = 'tal: rupak\n\nGat\nS R\n\nA\n||: S R g m P d n S R g m P d n :|| gat!\n';
      const { doc } = parseDocument(src);
      const root = renderDocument(doc, { maxSystemEm: 18 });
      const group = root.querySelectorAll('.sr-line-group')[1];
      assert.ok(group.querySelectorAll('.sr-line-block').length > 1);
      assert.equal(group.querySelectorAll('.sr-line-repeat-open').length, 1);
      assert.equal(group.querySelectorAll('.sr-line-repeat-close').length, 1);
      assert.equal(group.querySelectorAll('.sr-return-cue').length, 1);
      assert.equal(group.querySelector('.sr-return-cue').textContent, 'gat');
    },
  },
  {
    name: 'export: long lines use multiple readable systems',
    fn() {
      const { doc } = parseDocument('raga: test\ntal: rupak\n\nLong\nS R g m P d n S R g m P d n S R g m P d n\n');
      const page = renderExport(doc);
      assert.ok(page.querySelectorAll('.sr-line-block').length > 1);
      for (const block of page.querySelectorAll('.sr-line-block')) {
        assert.ok(block.dataset.systemFrom !== undefined);
        assert.ok(block.dataset.systemTo !== undefined);
      }
    },
  },
  {
    name: 'systems: compact alternate endings keep a shared tail beside both real ending grids',
    fn() {
      const src = [
        'tal: tintal',
        '',
        '||: S R g m P d n S S R g m P d n S |1 R S :||',
        "D n 'S n",
        '',
      ].join('\n');
      const { doc } = parseDocument(src);
      const root = renderDocument(doc, { maxSystemEm: 18 });
      const pair = root.querySelector('.sr-alternate-ending-pair');
      const aligned = pair?.querySelector('.sr-alternate-ending-system');
      assert.ok(pair && aligned);
      assert.ok(
        [...pair.children].some((child) =>
          child.classList.contains('sr-line-block') &&
          !child.classList.contains('sr-alternate-ending-common')
        ),
        'long shared material folds before the indivisible ending block'
      );
      const common = aligned.querySelector(':scope > .sr-alternate-ending-common');
      const first = aligned.querySelector(':scope > .sr-alternate-ending-first');
      const second = aligned.querySelector(':scope > .sr-alternate-ending-second');
      assert.ok(common?.querySelector('.sr-cell'));
      assert.ok(first?.querySelector('.sr-cell'));
      assert.ok(second?.querySelector('.sr-cell'));
      assert.equal(second.dataset.sourceLine, '4');
    },
  },
  {
    name: 'starter: Bageshri replaces Kirwani and carries no copied identity',
    fn() {
      const parsed = parseDocument(BAGESHRI_STARTER);
      assert.deepEqual(parsed.problems, []);
      assert.equal(parsed.doc.directives.raga, 'Raga Bageshri');
      assert.equal(parsed.doc.directives.tal, 'rupak');
      assert.equal('id' in parsed.doc.directives, false);
      assert.equal('created' in parsed.doc.directives, false);
      assert.equal('modified' in parsed.doc.directives, false);
      assert.doesNotMatch(BAGESHRI_STARTER, /kirwani/i);
      const page = renderExport(parsed.doc);
      assert.ok(page.querySelectorAll('.sr-line-block').length > parsed.doc.sections.flatMap((s) => s.lines).length);
    },
  },
];
