// smokes/notation-structure.smoke.js
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { serializeDocument } from '../src/engine/serialize.js';
import { scheduleDocument } from '../src/engine/schedule.js';
import { renderDocument } from '../src/engine/render.js';

function parsed(text) {
  const result = parseDocument(text);
  assert.deepEqual(result.problems, [], JSON.stringify(result.problems));
  return result.doc;
}
function firstLine(doc) { return doc.sections[0].lines[0]; }

export const smokes = [
  {
    name: 'ranged slide: ~(...) preserves three written matras under one span',
    fn() {
      const doc = parsed('tal: free\n\n~(.D.n.D S.n.D .n) .D - -\n');
      const line = firstLine(doc);
      assert.equal(line.matras.length, 6);
      const spans = line.spans.filter((s) => s.type === 'meend');
      assert.equal(spans.length, 1);
      assert.equal(spans[0].ranged, true);
      assert.deepEqual(spans[0].from, { matraIndex: 0, eventIndex: 0 });
      assert.equal(spans[0].to.matraIndex, 2);
    },
  },
  {
    name: 'ranged slide: serialize and parse round-trip keeps ~(...)',
    fn() {
      const doc = parsed('tal: free\n\n~(S R g) m\n');
      const text = serializeDocument(doc);
      assert.match(text, /~\(S R g\)/);
      const again = parsed(text);
      assert.equal(firstLine(again).spans[0].ranged, true);
      assert.equal(firstLine(again).spans[0].to.matraIndex, 2);
    },
  },
  {
    name: 'first ending: |1 is structural and survives serialization',
    fn() {
      const src = 'tal: tintal\n\n@1 ||: S R g m | P D n N |1 S R g m | P D n N :||\n';
      const doc = parsed(src);
      const line = firstLine(doc);
      assert.equal(line.lineRepeat, true);
      assert.equal(line.firstEndingFrom, 8);
      const text = serializeDocument(doc);
      assert.match(text, /\|1 S R g m/);
      assert.equal(firstLine(parsed(text)).firstEndingFrom, 8);
    },
  },
  {
    name: 'first ending: first pass is complete and second pass stops at |1',
    fn() {
      const src = [
        'tempo: 60',
        'tal: tintal',
        '',
        '@1 ||: S R g m | P D n N |1 S R g m | P D n N :||',
        '@1 m - - -',
        '',
      ].join('\n');
      const doc = parsed(src);
      const schedule = scheduleDocument(doc);
      const cursors = schedule.events.filter((e) => e.kind === 'cursor' && e.lineIndex === 0);
      assert.equal(cursors.length, 24, '16 matras first pass + 8 common matras second pass');
      assert.equal(cursors.filter((e) => e.matraIndex < 8).length, 16);
      assert.equal(cursors.filter((e) => e.matraIndex >= 8).length, 8);
      assert.equal(schedule.lineStarts[1].t, 24, 'next line replaces the skipped first ending');
    },
  },
  {
    name: 'render: ranged arc and structural first-ending marker are present',
    fn() {
      const priorDocument = globalThis.document;
      const dom = new JSDOM('<!doctype html><body></body>');
      globalThis.document = dom.window.document;
      try {
        const doc = parsed('tal: tintal\n\n@1 ||: ~(S R g m) | P D n N |1 S R g m | P D n N :||\n');
        const root = renderDocument(doc);
        const arc = root.querySelector('.sr-arc-meend[data-from-matra="0"][data-to-matra="3"]');
        const volta = root.querySelector('.sr-volta-first[data-first-ending="8"]');
        assert.ok(arc, 'ranged meend arc');
        assert.ok(volta, 'structural first-ending marker');
        assert.equal(volta.textContent, '1st time');
      } finally {
        globalThis.document = priorDocument;
        dom.window.close();
      }
    },
  },
  {
    name: 'render: the line replacing |1 is visibly marked as the second ending',
    fn() {
      const priorDocument = globalThis.document;
      const dom = new JSDOM('<!doctype html><body></body>');
      globalThis.document = dom.window.document;
      try {
        const doc = parsed([
          'tal: tintal',
          '',
          '||: D--D DDDP n--n nnnn D--D DDmm P-DD m-gg |1 RS-.D .nSgm :||',
          "RS-S gmDn 'S-'S'S n-nn",
          '',
        ].join('\n'));
        const root = renderDocument(doc);
        assert.equal(root.querySelector('.sr-volta-first')?.textContent, '1st time');
        assert.equal(root.querySelector('.sr-volta-second')?.textContent, '2nd time');
        const pair = root.querySelector('.sr-alternate-ending-pair');
        const aligned = pair?.querySelector('.sr-alternate-ending-system');
        assert.ok(pair && aligned, 'the two endings share one aligned visual system');
        assert.ok(aligned.querySelector(':scope > .sr-alternate-ending-common'));
        assert.ok(aligned.querySelector(':scope > .sr-alternate-ending-first'));
        assert.ok(aligned.querySelector(':scope > .sr-alternate-ending-second'));
        assert.equal(
          [...aligned.querySelectorAll('.sr-alternate-ending-common .sr-cell')].at(-1)?.dataset.matra,
          '7',
          'the shared phrase ends immediately before |1'
        );
        assert.equal(
          aligned.querySelector('.sr-alternate-ending-first .sr-cell')?.dataset.matra,
          '8',
          'the first ending begins at the divergence'
        );
        assert.equal(
          aligned.querySelector('.sr-alternate-ending-second .sr-cell')?.dataset.matra,
          '0',
          'the replacement ending begins at the same visual origin'
        );
        assert.equal(aligned.querySelectorAll('.sr-line-repeat-close').length, 1);
        const schedule = scheduleDocument(doc);
        const first = schedule.events.filter((event) => event.kind === 'cursor' && event.lineIndex === 0);
        const second = schedule.events.filter((event) => event.kind === 'cursor' && event.lineIndex === 1);
        assert.equal(first.length, 18, '10 written matras plus 8 repeated common matras');
        assert.equal(second.length, 4, 'only the compact second ending is written again');
      } finally {
        globalThis.document = priorDocument;
        dom.window.close();
      }
    },
  },
  {
    name: 'first ending diagnostics: |1 requires a repeat and nonempty common/ending material',
    fn() {
      const outside = parseDocument('tal: tintal\n\nS R g m | P D n N |1 S R g m | P D n N\n');
      assert.ok(outside.problems.some((p) => p.msg.includes('requires ||:')));
      const empty = parseDocument('tal: tintal\n\n||: S R g m | P D n N |1 :||\n');
      assert.ok(empty.problems.some((p) => p.msg.includes('first ending is empty')));
    },
  },
  {
    name: 'render: graph-paper alternate endings share one divergence and real trailing cells',
    fn() {
      const priorDocument = globalThis.document;
      const dom = new JSDOM('<!doctype html><body></body>');
      globalThis.document = dom.window.document;
      try {
        const doc = parsed([
          'tal: jhaptal',
          '',
          '||: D--D DDDP n--n nnnn D--D DDmm P-DD m-gg |1 RS-.D .nSgm :||',
          "@9 RS-S gmDn 'S-'S'S n-nn",
          '',
        ].join('\n'));
        const root = renderDocument(doc, {
          graphPaper: true,
          graphColumns: 16,
          maxSystemEm: 41.6,
        });
        const aligned = root.querySelector('.sr-alternate-ending-system');
        const commonRow = aligned?.querySelector(':scope > .sr-alternate-ending-common .sr-row');
        const firstRow = aligned?.querySelector(':scope > .sr-alternate-ending-first .sr-row');
        const secondRow = aligned?.querySelector(':scope > .sr-alternate-ending-second .sr-row');
        assert.ok(commonRow && firstRow && secondRow);
        assert.equal(
          Number(commonRow.dataset.graphColumns) + Number(firstRow.dataset.graphColumns),
          16,
          'the top branch uses exactly one printable graph-paper row'
        );
        assert.equal(secondRow.dataset.graphColumns, firstRow.dataset.graphColumns);
        assert.ok(firstRow.querySelectorAll('.sr-graph-empty-cell').length > 0);
        assert.ok(
          secondRow.querySelectorAll('.sr-cell').length > 0,
          'a dense replacement ending may use its complete allotted grid without overflow'
        );
      } finally {
        globalThis.document = priorDocument;
        dom.window.close();
      }
    },
  },
];
