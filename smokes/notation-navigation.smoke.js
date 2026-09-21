import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { alignBolSpans } from '../src/shell/anchor-overlay.js';
import { attackCenterX } from '../src/shell/score-geometry.js';
import { parseDocument } from '../src/engine/parse.js';
import { scheduleDocument, timeFor } from '../src/engine/schedule.js';
import { renderDocument, renderExport } from '../src/engine/render.js';
import { positionFromSource, positionFromScore, sourceRangeForPosition, metricOffsetForPosition, editorClickPosition } from '../src/shell/notation-navigation.js';

function fixture(music, tal = 'jhampak') {
  const text = `---\ntal: ${tal}\ntempo: 60\n---\n${music}`;
  const parsed = parseDocument(text);
  assert.equal(parsed.problems.length, 0, JSON.stringify(parsed.problems));
  return { text, doc: parsed.doc, schedule: scheduleDocument(parsed.doc) };
}
function seek(f, local, within = 0) {
  const position = f.text.lastIndexOf(local) + within;
  const target = positionFromSource(f.text, f.doc, position);
  assert.ok(target, `target for ${local}`);
  const time = timeFor(f.schedule, target.sourceLine, target.matraIndex, metricOffsetForPosition(f.doc, target.sourceLine, target.matraIndex, target.metricTime));
  return { target, time };
}
export const smokes = [
  { name: 'graph geometry: measured diri endpoints follow unequal cell widths', fn() {
    globalThis.document = new JSDOM('<body></body>').window.document;
    const f = fixture('S RGmP\n> di-ri da ra da');
    const score = renderDocument(f.doc);
    const span = score.querySelector('.sr-bol-cross-span');
    span.getBoundingClientRect = () => ({ left:100, width:200 });
    const attacks = score.querySelectorAll('[data-anchor-kind="attack"]');
    attacks[0].querySelector('.sr-ch').getBoundingClientRect = () => ({ left:115, width:10 });
    attacks[1].querySelector('.sr-ch').getBoundingClientRect = () => ({ left:145, width:10 });
    alignBolSpans(score);
    assert.match(span.querySelector('path').getAttribute('d'), /^M10,19 L25,19 /);
  } },
  { name: 'graph geometry: ornament anchors use the destination, not a grace glyph', fn() {
    globalThis.document = new JSDOM('<body></body>').window.document;
    const score = renderDocument(fixture('{dP}m').doc);
    const slot = score.querySelector('[data-anchor-kind="attack"]');
    score.getBoundingClientRect = () => ({ left:0, width:200 });
    slot.querySelector('.sr-grace .sr-ch').getBoundingClientRect = () => ({ left:10, width:10 });
    slot.querySelector('.sr-note:not(.sr-grace) > .sr-ch').getBoundingClientRect = () => ({ left:95, width:10 });
    assert.equal(attackCenterX(score, slot), 100);
  } },
  { name: 'notation navigation: Jhampak half-beat returns to sam in source and score', fn() {
    const f = fixture('@3 ||: G - Gm | R- S | .N.D .N|S - :||');
    const result = seek(f, 'S -');
    assert.equal(result.time, 6.5);
    assert.equal(result.target.matraIndex, 7);
    assert.equal(seek(f, 'Gm', 1).time, 2.5);
    const range = sourceRangeForPosition(f.text, f.doc, 5, 7, 6.5);
    assert.equal(f.text.slice(range.start, range.end), 'S');
  } },
  { name: 'notation navigation: parser owns timing after holds, scoped krintans and repeats', fn() {
    const f = fixture('S _ [-[[RS]]-.n] (G m)x3 P', 'tintal');
    assert.equal(seek(f, '.n').time, 4.75);
    assert.equal(seek(f, 'G m').time, 5);
    assert.equal(seek(f, 'P').time, 11);
    assert.equal(seek(f, 'RS', 1).time, 4.25);
  } },
  { name: 'notation navigation: same-beat ornaments retain destination identity', fn() {
    const f = fixture('{dP}m ~(.N.D S) {n~}D--{n~}D');
    assert.equal(seek(f, '}m', 1).time, 0);
    assert.equal(seek(f, 'dP').time, 0);
    assert.equal(seek(f, '.N.D', 2).time, 1.5);
    assert.equal(seek(f, '}D', 1).time, 3.75);
  } },
  { name: 'notation navigation: headings, bol lanes, metadata and whitespace do not seek', fn() {
    const f = fixture('S R\n> da ra');
    for (const index of [f.text.indexOf('tal:'), f.text.indexOf('tempo'), f.text.lastIndexOf('da'), f.text.indexOf('S R') + 1]) {
      assert.equal(positionFromSource(f.text, f.doc, index), null);
    }
  } },
  { name: 'notation navigation: clicking a subdivision or hold uses its exact score slot', fn() {
    globalThis.document = new JSDOM('<body></body>').window.document;
    const f = fixture('Gm D--N');
    const score = renderDocument(f.doc);
    const slots = score.querySelectorAll('.sr-slot');
    assert.equal(positionFromScore(slots[1]).metricTime, 0.5);
    assert.equal(positionFromScore(slots[3]).metricTime, 1.25);
    assert.equal(positionFromScore(score), null);
  } },
  { name: 'notation navigation: text dragging and modified clicks never seek', fn() {
    const view = { state: { selection: { main: { empty: true } } }, posAtCoords: () => 5, coordsAtPos: () => ({ left: 60 }) };
    const event = { button: 0, detail: 1, clientX: 55, clientY: 10, target: { closest: () => true } };
    assert.equal(editorClickPosition(event, view), 4);
    assert.equal(editorClickPosition({ ...event, shiftKey: true }, view), null);
    assert.equal(editorClickPosition({ ...event, detail: 2 }, view), null);
    view.state.selection.main.empty = false;
    assert.equal(editorClickPosition(event, view), null);
  } },
  { name: 'graph geometry: cross-cell diri includes expanded destination columns in screen and export', fn() {
    globalThis.document = new JSDOM('<body></body>').window.document;
    const f = fixture('S RGmP\n> di-ri da ra da');
    for (const render of [renderDocument, renderExport]) {
      const score = render(f.doc, { graphPaper: true, graphColumns: 8 });
      const cells = score.querySelectorAll('.sr-cell');
      assert.equal(cells[1].getAttribute('data-grid-span'), '2');
      const span = score.querySelector('.sr-bol-cross-span');
      assert.ok(span);
      assert.equal(span.style.gridColumn, '1 / 4');
      const path = span.querySelector('path').getAttribute('d');
      assert.match(path, /16\.666/);
      assert.match(path, /41\.666/);
    }
  } },
  { name: 'graph geometry: extra bol passes and lyrics reserve separate vertical space', fn() {
    globalThis.document = new JSDOM('<body></body>').window.document;
    const f = fixture('||: S R :||\n> da ra\n>2 ra da');
    const line = f.doc.sections.flatMap(section => section.lines)[0];
    line.lyrics = [{ matraIndex: 0, text: 'sa' }];
    for (const render of [renderDocument, renderExport]) {
      const score = render(f.doc, { graphPaper: true, graphColumns: 8 });
      const row = score.querySelector('.sr-graph-row');
      assert.equal(row.style.getPropertyValue('--sr-graph-bol-count'), '2');
      assert.equal(row.style.getPropertyValue('--sr-graph-lyric-height'), '1.2em');
      assert.equal(row.style.getPropertyValue('--sr-graph-cell-height'), 'calc(var(--sr-graph-base-cell-height) + 2.28em)');
    }
  } },
];
