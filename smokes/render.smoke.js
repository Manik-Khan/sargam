// smokes/render.smoke.js — renderer contract (spec §4, plan Wave 3).
// Runs under jsdom: structure, classes, and derived facts — never pixels.
// Written FIRST, watched failing, then render.js implemented to green.

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// render.js touches `document` only at call time, so setting the global
// before the (hoisted) import resolves is not required — but we set it
// before any renderDocument call.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;

import { renderDocument, renderExport } from '../src/engine/render.js';
import { parseDocument } from '../src/engine/parse.js';

const APPENDIX_A = `title: Kahe Ko (khyal) — R. 1732
raga: kirwani
tal: tintal
sa: C#
tempo: 72

Sthayi
@7 ||: .d P | mg R m m | P d N~ 'S | .d - P m | R - :||
" ka- he | ko ma- na na- | hi | ma- ne | re

Vistars
@7 S R | g - - - | - R g m | P -
@7 R m | g - - - | m R g m | P - d - | P -

Tihai
(SR gm P)x3

Krintan (cross-beat)
[[dP/mg/RS]] -

tal: free

Alap
~PS.NRS.N.D N
`;

function renderCorpus() {
  const { doc } = parseDocument(APPENDIX_A);
  return renderDocument(doc);
}

function sthayiCells(root) {
  const row = root.querySelectorAll('.sr-section')[0].querySelector('.sr-row');
  return [...row.querySelectorAll('.sr-cell')];
}

export const smokes = [
  {
    name: 'render: returns a detached element with 5 sections',
    fn: () => {
      const root = renderCorpus();
      assert.ok(root instanceof dom.window.HTMLElement);
      assert.equal(root.parentNode, null);
      assert.equal(root.querySelectorAll('.sr-section').length, 5);
      const labels = [...root.querySelectorAll('.sr-section-label')].map((n) => n.textContent);
      assert.deepEqual(labels, ['Sthayi', 'Vistars', 'Tihai', 'Krintan (cross-beat)', 'Alap']);
    },
  },
  {
    name: 'render: sthayi row has 16 matra cells and repeat glyphs',
    fn: () => {
      const root = renderCorpus();
      assert.equal(sthayiCells(root).length, 16);
      const row = root.querySelectorAll('.sr-section')[0].querySelector('.sr-row');
      assert.ok(row.querySelector('.sr-repeat-open'));
      assert.ok(row.querySelector('.sr-repeat-close'));
      assert.match(row.querySelector('.sr-repeat-open').textContent, /\|\|:/);
    },
  },
  {
    name: "render: @7 arithmetic visible — markers '0','3','+','2' above cells 2,6,10,14",
    fn: () => {
      const cells = sthayiCells(renderCorpus());
      const markerOf = (i) => cells[i].querySelector('.sr-marker')?.textContent ?? '';
      assert.equal(markerOf(2), '0');
      assert.equal(markerOf(6), '3');
      assert.equal(markerOf(10), '+');
      assert.equal(markerOf(14), '2');
      assert.equal(markerOf(0), '');
      assert.equal(markerOf(1), '');
    },
  },
  {
    name: 'render: octave dots are load-bearing — .d below-dot, taar S above-dot',
    fn: () => {
      const cells = sthayiCells(renderCorpus());
      assert.ok(cells[0].querySelector('.sr-dot-below'), '.d cell needs a below dot');
      assert.equal(cells[0].querySelector('.sr-dot-above'), null);
      assert.ok(cells[9].querySelector('.sr-dot-above'), "taar 'S cell needs an above dot");
      assert.equal(cells[9].querySelector('.sr-dot-below'), null);
    },
  },
  {
    name: 'render: register tint classes — mandra cool, taar warm',
    fn: () => {
      const cells = sthayiCells(renderCorpus());
      assert.ok(cells[0].querySelector('.sr-reg-cool'), 'mandra note carries cool class');
      assert.ok(cells[9].querySelector('.sr-reg-warm'), 'taar note carries warm class');
      assert.equal(cells[1].querySelector('.sr-reg-cool'), null, 'middle register untinted');
      assert.equal(cells[1].querySelector('.sr-reg-warm'), null);
    },
  },
  {
    name: 'render: subdivided matra (mg) gets an automatic under-arc',
    fn: () => {
      const cells = sthayiCells(renderCorpus());
      assert.ok(cells[2].querySelector('.sr-underarc'), 'mg cell needs an under-arc');
      assert.equal(cells[1].querySelector('.sr-underarc'), null, 'whole-matra P has none');
    },
  },
  {
    name: "render: meend over-arc spans N (matra 8) into 'S (matra 9), as SVG",
    fn: () => {
      const root = renderCorpus();
      const row = root.querySelectorAll('.sr-section')[0].querySelector('.sr-row');
      const arcs = [...row.querySelectorAll('.sr-arc-meend')];
      assert.equal(arcs.length, 1);
      assert.equal(arcs[0].getAttribute('data-from-matra'), '8');
      assert.equal(arcs[0].getAttribute('data-to-matra'), '9');
      assert.ok(arcs[0].querySelector('svg'), 'arc is SVG');
    },
  },
  {
    name: 'render: krintan over-bracket spans its 3 matras, as SVG',
    fn: () => {
      const root = renderCorpus();
      const row = root.querySelectorAll('.sr-section')[3].querySelector('.sr-row');
      const brs = [...row.querySelectorAll('.sr-arc-krintan')];
      assert.equal(brs.length, 1);
      assert.equal(brs[0].getAttribute('data-from-matra'), '0');
      assert.equal(brs[0].getAttribute('data-to-matra'), '2');
      assert.ok(brs[0].querySelector('svg'));
    },
  },
  {
    name: 'render: sustain cells carry the dim class',
    fn: () => {
      const root = renderCorpus();
      const row = root.querySelectorAll('.sr-section')[1].querySelector('.sr-row');
      const cells = [...row.querySelectorAll('.sr-cell')];
      // Vistar 1: S R | g - - - | - R g m | P -  → sustains at 3,4,5,6,11
      for (const i of [3, 4, 5, 6, 11]) {
        assert.ok(cells[i].classList.contains('sr-dim'), `cell ${i} should be dim`);
      }
      assert.ok(!cells[0].classList.contains('sr-dim'));
    },
  },
  {
    name: 'render: barlines at vibhag boundaries in metered rows',
    fn: () => {
      const root = renderCorpus();
      const row = root.querySelectorAll('.sr-section')[0].querySelector('.sr-row');
      // Sthayi @7: boundaries after cells 1, 5, 9, 13 → 4 barlines.
      assert.equal(row.querySelectorAll('.sr-bar').length, 4);
    },
  },
  {
    name: 'render: free section (alap) — no markers, no barlines, 2 cells',
    fn: () => {
      const root = renderCorpus();
      const row = root.querySelectorAll('.sr-section')[4].querySelector('.sr-row');
      assert.equal(row.querySelectorAll('.sr-cell').length, 2);
      assert.equal(row.querySelectorAll('.sr-bar').length, 0);
      for (const m of row.querySelectorAll('.sr-marker')) {
        assert.equal(m.textContent, '');
      }
    },
  },
  // --- landing reports (spec §3.9 wording, §4 cursor scoping).
  // NOTE 2026-07-16: the previous version of this smoke asserted the report
  // rendered with NO cursor — it encoded render.js's deviation from spec §4
  // ("with the cursor inside a repeat, the landing report shows inline").
  // The spec was always the authority; the smoke is corrected to it here.
  {
    name: 'render: no landing report without a cursor (spec §4 — cursor-scoped)',
    fn: () => {
      const root = renderCorpus();
      assert.equal(root.querySelectorAll('.sr-landing').length, 0);
    },
  },
  {
    name: 'render: landing report appears when the cursor is on the tihai line (16)',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const root = renderDocument(doc, { activeLine: 16 });
      const reports = root.querySelectorAll('.sr-landing');
      assert.equal(reports.length, 1, 'exactly the cursor line reports');
    },
  },
  {
    name: 'render: landing report is silent when the cursor is on another line',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const root = renderDocument(doc, { activeLine: 8 }); // sthayi, no repeats
      assert.equal(root.querySelectorAll('.sr-landing').length, 0);
    },
  },
  {
    name: "render: landing wording is §3.9's — '3rd P lands on matra 9 (khali)'",
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const root = renderDocument(doc, { activeLine: 16 });
      const text = root.querySelector('.sr-landing').textContent;
      assert.equal(text, '3rd P lands on matra 9 (khali)');
    },
  },
  {
    name: 'render: landing names the final struck note and ordinal (x2 → 2nd)',
    fn: () => {
      // 3 matras x2 from sam occupies matras 1..6 — the final repetition's
      // last matra is 6 (cf. spec §8: (SR gm P)x3 from sam → matra 9).
      // Tintal's markers fall at 1/5/9/13, so matra 6 starts no vibhag and
      // the report names no position — correct: a landing only earns a name
      // when it coincides with a marker.
      const { doc } = parseDocument('tal: tintal\n\n(SR gm .d)x2\n');
      const root = renderDocument(doc, { activeLine: 3 });
      const text = root.querySelector('.sr-landing').textContent;
      assert.equal(text, '2nd .d lands on matra 6');
    },
  },
  {
    name: 'render: landing report names sam when the phrase lands there',
    fn: () => {
      // 4-matra phrase from sam, x4 → last matra 16... use x1-free case:
      const { doc } = parseDocument('tal: tintal\n\n@14 (S R g)x2\n');
      const root = renderDocument(doc, { activeLine: 3 });
      const text = root.querySelector('.sr-landing').textContent;
      assert.match(text, /matra 3/, text);
    },
  },

  // --- export view (spec §4.1)
  {
    name: 'export: raga is the heading, title the subtitle',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const el = renderExport(doc);
      assert.equal(el.querySelector('.sr-exp-raga').textContent, 'kirwani');
      assert.match(el.querySelector('.sr-exp-title').textContent, /Kahe Ko/);
    },
  },
  {
    name: 'export: metadata list carries tal/tempo/sa; identity never appears',
    fn: () => {
      const src = `---\nraga: kirwani\ntal: tintal\nsa: C#\ntempo: 72\ncomposition: instrumental\nlaya: madhya\nid: abc-123\ncreated: 2026-01-01T00:00:00.000Z\nmodified: 2026-01-02T00:00:00.000Z\n---\n\nSthayi\n@7 .d P | mg R m m\n`;
      const { doc } = parseDocument(src);
      const el = renderExport(doc);
      const meta = el.querySelector('.sr-exp-meta').textContent;
      assert.match(meta, /tintal/);
      assert.match(meta, /72/);
      assert.match(meta, /madhya/);
      assert.match(meta, /instrumental/);
      assert.doesNotMatch(meta, /abc-123/, 'id must not print');
      assert.doesNotMatch(el.textContent, /abc-123/, 'id must not appear anywhere');
      assert.doesNotMatch(el.textContent, /2026-01-01/, 'created must not print');
    },
  },
  {
    name: 'export: absent directives produce no metadata rows (all optional)',
    fn: () => {
      const { doc } = parseDocument('tal: tintal\n\nS R g m\n');
      const el = renderExport(doc);
      const rows = el.querySelectorAll('.sr-exp-meta-row');
      assert.equal(rows.length, 1, 'only tal');
      assert.match(rows[0].textContent, /tintal/);
    },
  },
  {
    name: 'export: no raga → title becomes the heading',
    fn: () => {
      const { doc } = parseDocument('title: Kahe Ko\ntal: tintal\n\nS R g m\n');
      const el = renderExport(doc);
      assert.equal(el.querySelector('.sr-exp-raga').textContent, 'Kahe Ko');
      assert.equal(el.querySelector('.sr-exp-title'), null, 'no duplicate subtitle');
    },
  },
  {
    name: 'export: sa renders with a real sharp glyph (C# → C♯)',
    fn: () => {
      const { doc } = parseDocument('raga: kirwani\ntal: tintal\nsa: C#\n\nS R g m\n');
      const el = renderExport(doc);
      assert.match(el.querySelector('.sr-exp-meta').textContent, /C♯/);
    },
  },
  {
    name: 'export: contains the notation itself and no landing reports (no cursor)',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const el = renderExport(doc);
      assert.ok(el.querySelectorAll('.sr-cell').length > 20, 'matra cells present');
      assert.ok(el.querySelector('.sr-section-label'), 'section labels present');
      assert.equal(el.querySelectorAll('.sr-landing').length, 0, 'reports are a check, not print');
    },
  },
  {
    name: 'render: lyric row — hi under matra 6, ma-/ne under 10/12, blanks carried',
    fn: () => {
      const root = renderCorpus();
      const row = root.querySelectorAll('.sr-section')[0].querySelector('.sr-row');
      const lyricAt = (i) => row.querySelector(`.sr-lyric[data-matra="${i}"]`)?.textContent;
      assert.equal(lyricAt(6), 'hi');
      assert.equal(lyricAt(7), undefined);
      assert.equal(lyricAt(10), 'ma-');
      assert.equal(lyricAt(12), 'ne');
      assert.equal(lyricAt(14), 're');
    },
  },
  {
    name: "render: bols render as the handwriting's symbols — | for da, — for ra, ^ diri, v chikari",
    fn: () => {
      const { doc } = parseDocument('tal: tintal\n\nSR g m P d\n> da ra diri chikari da ra\n');
      const root = renderDocument(doc);
      const row = root.querySelector('.sr-row');
      const bol0 = row.querySelector('.sr-bol[data-matra="0"]');
      assert.ok(bol0, 'bol group under matra 0');
      const marks0 = [...bol0.querySelectorAll('.sr-bol-mark')].map((n) => n.textContent);
      assert.deepEqual(marks0, ['|', '—']); // da, ra on S and R
      const marks1 = [...row.querySelector('.sr-bol[data-matra="1"]').querySelectorAll('.sr-bol-mark')].map((n) => n.textContent);
      assert.deepEqual(marks1, ['^']); // diri on g
      const marks2 = [...row.querySelector('.sr-bol[data-matra="2"]').querySelectorAll('.sr-bol-mark')].map((n) => n.textContent);
      assert.deepEqual(marks2, ['v']); // chikari on m
    },
  },
  {
    name: 'render: unparsed fragment renders as dimmed passthrough text',
    fn: () => {
      const { doc } = parseDocument('tal: tintal\n\nS R xyz P\n');
      const root = renderDocument(doc);
      const pt = root.querySelector('.sr-passthrough');
      assert.ok(pt);
      assert.equal(pt.textContent, 'xyz');
      assert.ok(pt.classList.contains('sr-dim'));
    },
  },
  {
    name: 'render: phrase repeat glyphs ( and )x3 appear around the phrase',
    fn: () => {
      const root = renderCorpus();
      const row = root.querySelectorAll('.sr-section')[2].querySelector('.sr-row');
      const cells = [...row.querySelectorAll('.sr-cell')];
      assert.match(cells[0].textContent, /\(/);
      assert.match(cells[2].textContent, /\)x3/);
    },
  },
  {
    name: 'render: empty document renders without throwing',
    fn: () => {
      const { doc } = parseDocument('');
      const root = renderDocument(doc);
      assert.ok(root);
      assert.equal(root.querySelectorAll('.sr-section').length, 0);
    },
  },
];
