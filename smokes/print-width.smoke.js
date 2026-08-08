// Browser-measured export width + Rupak sam-only continuation planning.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  clearMeasuredLineLayout,
  planLineSystems,
  setMeasuredLineLayout,
} from '../src/engine/layout.js';
import { getTal } from '../src/engine/tala.js';

function lineOf(count, startMatra = 1) {
  return {
    startMatra,
    matras: Array.from({ length: count }, () => ({ events: [{ type: 'note', ch: 'S' }] })),
    spans: [],
    phraseRepeats: [],
    passthrough: [],
  };
}

export const smokes = [
  {
    name: 'print width: browser measurements replace conservative estimates',
    fn() {
      const line = lineOf(8);
      const tal = getTal('tintal');

      assert.ok(planLineSystems(line, tal, { maxEm: 10 }).length > 1);

      setMeasuredLineLayout(line, {
        widths: Array(8).fill(1),
        prefixEm: 0,
        suffixEm: 0,
      });
      assert.deepEqual(planLineSystems(line, tal, { maxEm: 10 }), [
        { from: 0, to: 7, reason: 'fits' },
      ]);

      clearMeasuredLineLayout(line);
      assert.ok(planLineSystems(line, tal, { maxEm: 10 }).length > 1);
    },
  },
  {
    name: 'print width: Rupak continuation systems begin only on sam',
    fn() {
      const line = lineOf(21);
      const tal = getTal('rupak');
      setMeasuredLineLayout(line, {
        widths: Array(21).fill(3),
        prefixEm: 0,
        suffixEm: 0,
      });

      const ranges = planLineSystems(line, tal, { maxEm: 22 });
      assert.deepEqual(ranges, [
        { from: 0, to: 6, reason: 'sam' },
        { from: 7, to: 13, reason: 'sam' },
        { from: 14, to: 20, reason: 'fits' },
      ]);
      clearMeasuredLineLayout(line);
    },
  },
  {
    name: 'print width: a Rupak pickup folds immediately before the next sam',
    fn() {
      const line = lineOf(14, 4);
      const tal = getTal('rupak');
      setMeasuredLineLayout(line, {
        widths: Array(14).fill(3),
        prefixEm: 0,
        suffixEm: 0,
      });

      const ranges = planLineSystems(line, tal, { maxEm: 13 });
      assert.equal(ranges[0].to, 3);
      assert.equal(ranges[1].from, 4);
      assert.equal(ranges[0].reason, 'sam');
      clearMeasuredLineLayout(line);
    },
  },
  {
    name: 'print width: metered systems prefer sam over a later arbitrary beat',
    fn() {
      const line = lineOf(20);
      const tal = getTal('jhaptal');
      setMeasuredLineLayout(line, {
        widths: Array(20).fill(2),
        prefixEm: 0,
        suffixEm: 0,
      });
      const ranges = planLineSystems(line, tal, { maxEm: 25 });
      assert.equal(ranges[0].to, 9);
      assert.equal(ranges[1].from, 10);
      assert.equal(ranges[0].reason, 'musical-boundary');
      clearMeasuredLineLayout(line);
    },
  },
  {
    name: 'print width: export remeasures without replacing browser printing',
    fn() {
      const source = readFileSync(new URL('../src/shell/ExportView.jsx', import.meta.url), 'utf8');
      assert.match(source, /maxSystemEm:\s*Infinity/);
      assert.match(source, /beforeprint/);
      assert.match(source, /window\.print\(\)/);
      assert.match(source, /contentWidthInEm/);
      assert.match(source, /SCORE_GUTTER_EM = 2/);
      assert.match(source, /const score = el\.querySelector\('\.sr-export'\) \|\| el;/);
      assert.match(source, /const fontSize = Number\.parseFloat\(scoreStyle\.fontSize\) \|\| 15;/);
      assert.match(source, /querySelector\('\.sr-paper-tail'\)/);
      assert.match(source, /tailRect\?\.left \?\? rowRect\.right/);
      assert.match(source, /aria-label="PDF page color"/);
      assert.match(source, /aria-label="PDF typeface"/);
      assert.match(source, /aria-label="PDF notation grid"/);
      assert.match(source, /value: 'paper', label: 'Graph paper'/);
      assert.match(source, /aria-label="PDF ink style"/);
      assert.match(source, /app-export-grid/);
      assert.match(source, /app-export-graph-paper/);
      assert.match(source, /app-export-monochrome/);
      assert.match(source, /useStoredOption\(store, 'exportPaperColor'/);
      assert.match(source, /useStoredOption\(store, 'exportGridStyle'/);
      assert.match(source, /useStoredOption\(store, 'exportInkStyle'/);
      assert.match(source, /--sr-export-paper/);
      assert.match(source, /--sr-export-font/);
      assert.match(source, /document\.documentElement/);
      assert.match(source, /root\.style\.setProperty\('--sr-export-paper', paperColor\)/);
      assert.match(source, /const beforePrint = \(\) => \{[\s\S]*?printActive = true;[\s\S]*?cancelAnimationFrame/);
      assert.match(source, /if \(disposed \|\| printActive\) return;/);
      assert.match(source, /if \(printActive\) return;[\s\S]*?contentRect/);
      assert.doesNotMatch(source, /const beforePrint = \(\) => renderSized\(\)/);
      assert.doesNotMatch(source, /const afterPrint = \(\) => renderSized\(\)/);
    },
  },

  {
    name: 'print width: screen paper matches printable width and uses compact export typography',
    fn() {
      const css = readFileSync(new URL('../src/shell/sargam.css', import.meta.url), 'utf8');
      const render = readFileSync(new URL('../src/engine/render.js', import.meta.url), 'utf8');
      assert.match(css, /\.app-export-paper\s*\{[^}]*background:\s*var\(--sr-export-paper, #fff\);[^}]*width:\s*816px;[^}]*padding:\s*29px 27px 31px;[^}]*box-sizing:\s*border-box;/s);
      assert.match(css, /\.app-export\s*\{[^}]*z-index:\s*120;/s);
      assert.match(css, /\.sr-export\s*\{[^}]*font-size:\s*15px;/s);
      assert.match(css, /\.sr-export \.sr-glyphs\s*\{\s*font-size:\s*19px;/);
      assert.match(css, /\.sr-export \.sr-cell\s*\{[^}]*min-width:\s*1\.72em;[^}]*padding-inline:\s*2px;/s);
      assert.match(css, /\.sr-export \.sr-cell:has\(\.sr-sustain\)\s*\{[^}]*min-width:\s*1em;[^}]*padding-inline:\s*0;/s);
      assert.match(css, /\.sr-export \.sargam-render,[\s\S]*?\.sr-export \.sr-return-cue\s*\{\s*font-family:\s*inherit;/);
      assert.match(css, /@page\s*\{\s*size:\s*Letter portrait;\s*margin:\s*0\.3in 0\.28in;/);
      assert.match(css, /\.sr-bar\s*\{[^}]*border-inline-start:\s*1px solid currentColor;[^}]*background:\s*transparent;/s);
      assert.match(css, /\.app-export::before\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*-0\.3in -0\.28in;[^}]*background:\s*var\(--sr-export-paper, #fff\);/s);
      assert.match(css, /\.sr-marker-on-boundary::after\s*\{\s*content:\s*none;/);
      assert.match(css, /\.app-rhythm-grid \.sr-cell,[\s\S]*?\.app-export-grid \.sr-cell\s*\{[^}]*border:\s*1px solid/s);
      assert.match(css, /\.app-export-grid \.sr-slot \+ \.sr-slot\s*\{[^}]*border-inline-start:\s*1px dashed/s);
      assert.match(css, /\.app-export-grid \.sr-cell,[\s\S]*?width:\s*2\.65em;[\s\S]*?max-width:\s*2\.65em;/);
      assert.match(css, /\.app-export-grid \.sr-cell\[data-grid-span="2"\],[\s\S]*?width:\s*3\.65em;/);
      assert.match(css, /grid-template-columns:\s*repeat\(var\(--sr-written-slots\), minmax\(0, 1fr\)\) !important;/);
      assert.match(css, /\.app-export-grid \.sr-ornament-graces,[\s\S]*?position:\s*absolute;/s);
      assert.match(css, /\.app-rhythm-grid \.sr-ornament-graces,[\s\S]*?right:\s*calc\(50% \+ 0\.14em\);[\s\S]*?bottom:\s*0\.76em;/s);
      assert.match(css, /\.app-export-graph-paper \.app-export-paper\s*\{[^}]*min-height:\s*1056px;[^}]*background-image:/s);
      assert.match(css, /\.app-export-graph-paper \.sr-cell\[data-grid-span="2"\],[\s\S]*?width:\s*5\.3em;/);
      assert.match(css, /\.app-export-graph-paper::before\s*\{[^}]*background-image:[^}]*background-position:\s*0\.28in 0\.3in;/s);
      assert.match(css, /\.app-rhythm-grid-paper\s*\{[^}]*background-image:[^}]*background-size:\s*var\(--sr-graph-square\)/s);
      assert.match(css, /\.app-grid-writer-paper \.app-grid-writer-scroll\s*\{[^}]*background-image:/s);
      assert.match(css, /\.app-export\.app-export-monochrome\s*\{[^}]*--sr-ink:\s*#080808;[^}]*--sr-dim:\s*#363636;[^}]*--sr-cool:\s*#252525;/s);
      assert.match(css, /\.app-export-monochrome \.sr-sustain \.sr-ch::after\s*\{[^}]*border-top-width:\s*1\.7px;/s);
      assert.match(render, /--sr-written-slots/);
      assert.match(render, /sr-ornament-graces/);
      assert.match(render, /sr-paper-tail/);
      assert.match(render, /data-grid-span/);
      assert.match(css, /\.sr-export \.sr-line-group\s*\{[^}]*break-inside:\s*auto;/s);
      assert.match(css, /@media print\s*\{[\s\S]*?\.app-root\.is-exporting\s*\{[^}]*display:\s*block !important;[^}]*height:\s*auto !important;[^}]*overflow:\s*visible !important;/s);
      assert.match(css, /\.app-export-scroll\s*\{[^}]*display:\s*block !important;[^}]*overflow:\s*visible !important;/s);
      assert.match(css, /@media print\s*\{[\s\S]*?\.sr-section\s*\{[^}]*break-inside:\s*auto;[^}]*page-break-inside:\s*auto;/s);
      assert.match(css, /@media print\s*\{[\s\S]*?\.sr-line-group\s*\{[^}]*break-inside:\s*auto;[^}]*page-break-inside:\s*auto;/s);
      assert.match(css, /@media print\s*\{[\s\S]*?\.sr-line-block\s*\{[^}]*break-inside:\s*avoid;[^}]*page-break-inside:\s*avoid;/s);
    },
  },
];
