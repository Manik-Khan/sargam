// smokes/anchor-geometry.smoke.js — semantic geometry shared by Preview and
// Export. These checks avoid browser pixels: identities and exact slot edges
// must be correct before the browser adapter measures them.

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { buildLineGeometry } from '../src/engine/notation-geometry.js';
import { renderDocument } from '../src/engine/render.js';
import { attackCenterX, endpointEdgeX, xForMetricTime } from '../src/shell/score-geometry.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;

const diriSource = `---\ntal: jhaptal\n---\n\nGAT\n.D--.n -S gm D - ~(D m) P-D- m-gg R-S-`;
const meterSource = `---\ntal: jhaptal\n---\n\nGAT\n@8 ||: .D--.n -S gm D - ~(D m) [[g---RS R-]] S- :||`;
const repeatedSource = `---\ntal: jhaptal\n---\n\nGAT\n@8 {n~}D--{n~}D`;

function firstLine(source) {
  const { doc, problems } = parseDocument(source);
  assert.equal(problems.length, 0, problems.map((problem) => problem.msg).join('; '));
  return { doc, line: doc.sections[0].lines[0] };
}

export const smokes = [
  {
    name: 'anchor geometry: Diri endpoints are consecutive exact attack identities',
    fn() {
      const { line } = firstLine(diriSource);
      const geometry = buildLineGeometry(line);
      const first = geometry.attacks[11];
      const second = geometry.attacks[12];
      assert.deepEqual([first.note, first.timeLabel, first.ordinal], ['g', '17/2', 11]);
      assert.deepEqual([second.note, second.timeLabel, second.ordinal], ['g', '35/4', 12]);
      assert.equal(second.ordinal, first.ordinal + 1);
    },
  },
  {
    name: 'anchor geometry: repeated local approaches expose D--D slot edges',
    fn() {
      const { line } = firstLine(repeatedSource);
      const geometry = buildLineGeometry(line);
      assert.deepEqual(geometry.attacks.map((attack) => [attack.note, attack.timeLabel]), [
        ['D', '0'],
        ['D', '3/4'],
      ]);
      assert.deepEqual(geometry.matras[0].slots.map((slot) => [slot.kind, slot.startLabel, slot.endLabel]), [
        ['attack', '0', '1/4'],
        ['hold', '1/4', '1/2'],
        ['hold', '1/2', '3/4'],
        ['attack', '3/4', '1'],
      ]);
    },
  },
  {
    name: 'anchor geometry: repeated approaches render as independent mirrored under-brackets',
    fn() {
      const { doc } = firstLine(repeatedSource);
      const root = renderDocument(doc);
      const approaches = [...root.querySelectorAll('.sr-approach-slide-body')];
      assert.equal(approaches.length, 2);
      assert.deepEqual(approaches.map((node) => node.querySelector('.sr-approach-source')?.textContent), ['n', 'n']);
      assert.deepEqual(approaches.map((node) => node.querySelector('.sr-approach-destination')?.textContent), ['D', 'D']);
      for (const approach of approaches) {
        assert.equal(approach.querySelector('.sr-svg-approach path')?.getAttribute('d'), 'M4,2 L4,15 L96,15 L96,2');
      }
    },
  },
  {
    name: 'anchor geometry: render stamps exact attack, slot-edge, and boundary targets',
    fn() {
      const { doc } = firstLine(meterSource);
      const root = renderDocument(doc);
      const g = root.querySelector('[data-anchor-kind="attack"][data-anchor-ordinal="8"]');
      const landingR = root.querySelector('[data-anchor-kind="attack"][data-anchor-ordinal="11"]');
      assert.ok(g && landingR);
      assert.equal(g.getAttribute('data-anchor-time'), '7');
      assert.equal(g.getAttribute('data-geometry-start'), '7');
      assert.equal(landingR.getAttribute('data-anchor-time'), '8');
      assert.equal(landingR.getAttribute('data-geometry-end'), '17/2');
      assert.ok(root.querySelector('[data-anchor-kind="boundary"][data-anchor-time="0"]'));
      assert.ok(root.querySelector('[data-anchor-kind="boundary"][data-anchor-time="10"]'));
    },
  },
  {
    name: 'anchor geometry: lower lanes have one deterministic core-rendered order',
    fn() {
      const { doc } = firstLine(meterSource);
      const block = renderDocument(doc).querySelector('.sr-line-block');
      const stack = block.querySelector(':scope > .sr-annotation-stack');
      assert.ok(stack);
      assert.deepEqual([...stack.children].map((node) => node.className), [
        'sr-articulation-lane',
        'sr-meter-lane',
        'sr-anchored-meter-lane',
      ]);
    },
  },
  {
    name: 'anchor geometry: browser coordinates are lane-relative and use exact slot edges',
    fn() {
      const block = document.createElement('div');
      const lane = document.createElement('div');
      const slot = document.createElement('span');
      const note = document.createElement('span');
      note.className = 'sr-ch';
      slot.className = 'sr-slot';
      slot.setAttribute('data-anchor-kind', 'attack');
      slot.setAttribute('data-geometry-start', '3/4');
      slot.setAttribute('data-geometry-end', '1');
      slot.appendChild(note);
      block.appendChild(slot);
      block.appendChild(lane);

      lane.getBoundingClientRect = () => ({ left: 100, right: 400, width: 300 });
      slot.getBoundingClientRect = () => ({ left: 140, right: 180, width: 40 });
      note.getBoundingClientRect = () => ({ left: 150, right: 160, width: 10 });

      assert.equal(attackCenterX(lane, slot), 55);
      assert.equal(endpointEdgeX(lane, slot, 'start'), 40);
      assert.equal(endpointEdgeX(lane, slot, 'end'), 80);
      assert.equal(xForMetricTime(lane, block, { n: 750000, d: 1000000 }, 'start'), 40);
      assert.equal(xForMetricTime(lane, block, { n: 1, d: 1 }, 'end'), 80);
    },
  },
];
