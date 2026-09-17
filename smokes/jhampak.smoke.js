import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { getTal, markerAtMatra, wrapMatra, landing } from '../src/engine/tala.js';
import { parseDocument } from '../src/engine/parse.js';
import { serializeDocument } from '../src/engine/serialize.js';
import { scheduleDocument } from '../src/engine/schedule.js';
import { performedMatraCount } from '../src/engine/performed-time.js';
import { buildLineGeometry } from '../src/engine/notation-geometry.js';
import { scanMusicLine, meterTicksForMatra, rational, rationalNumber } from '../src/engine/meter.js';
import { replaceGridCellToken } from '../src/engine/grid-edit.js';
import { renderDocument, renderExport } from '../src/engine/render.js';
import { documentToMusicXML } from '../src/engine/western.js';
import { rhythmGridIdentity, rhythmGridLabel } from '../src/shell/rhythm-grid.js';
import { parseReturnCueToken } from '../src/engine/return-cue.js';

const CYCLE = 'S R | G m P | D N | S:1/2 R:1/2 S:1/2';
function parse(body, tal = 'jhampak') {
  const result = parseDocument(`tal: ${tal}\ntempo: 60\n\n${body}`);
  assert.deepEqual(result.problems, []);
  return result.doc;
}
const line = (doc) => doc.sections[0].lines[0];
const notes = (doc) => scheduleDocument(doc).events.filter(e => e.kind === 'note' && !e.grace);
function dom() { globalThis.document = new JSDOM('<!doctype html>').window.document; }

export const smokes = [
  { name: 'jhampak: approved 8½ cycle, ending strokes, and provisional khali on 6', fn() {
    const tal = getTal('Jhampak');
    assert.equal(tal.matras, 8.5);
    assert.deepEqual(tal.vibhags, [2,3,2,1.5]);
    assert.deepEqual(tal.strokeDurations, [1,1,1,1,1,1,1,.5,.5,.5]);
    assert.equal(markerAtMatra(tal, 6), '0');
    assert.equal(wrapMatra(tal, 9.5), 1);
  }},
  { name: 'jhampak: two cycles land on sam every 8½ seconds at 60 BPM', fn() {
    const doc = parse(`${CYCLE}\n${CYCLE}\nS`);
    const schedule = scheduleDocument(doc);
    assert.deepEqual(notes(doc).map(e=>e.t), [0,1,2,3,4,5,6,7,7.5,8,8.5,9.5,10.5,11.5,12.5,13.5,14.5,15.5,16,16.5,17]);
    assert.deepEqual(schedule.events.filter(e=>e.accent === 'sam').map(e=>e.t), [0,8.5,17]);
    assert.deepEqual(schedule.events.filter(e=>e.accent === 'khali').map(e=>e.t), [5,13.5]);
    assert.equal(performedMatraCount(line(doc)), 8.5);
    assert.equal(schedule.duration, 18);
    assert.equal(scheduleDocument(doc, {tempo:120}).duration, 9);
  }},
  { name: 'half cells: standalone, subdivided, rest, sustain, grace, and invalid drafts', fn() {
    for (const body of ['S:1/2','[S R]:1/2','.:1/2','-:1/2','{R}S:1/2']) {
      assert.equal(scheduleDocument(parse(body)).duration, .5, body);
    }
    assert.deepEqual(notes(parse('[S R]:1/2')).map(e=>e.dur), [.25,.25]);
    assert.equal(notes(parse('S -:1/2'))[0].dur, 1.5);
    for (const body of ['S:1/3','S:0','S :1/2','S:1/2:1/2','--:1/2']) {
      assert.ok(parseDocument(`tal: jhampak\n\n${body}`).problems.length, body);
    }
  }},
  { name: 'half cells: whole-line and phrase repeats retain their exact duration', fn() {
    assert.equal(scheduleDocument(parse(`||: ${CYCLE} :||`)).duration, 17);
    const doc = parse('S R G m P D N (S:1/2 R:1/2 S:1/2)x3\nS');
    assert.equal(performedMatraCount(line(doc)), 11.5);
    assert.equal(notes(doc).at(-1).t, 11.5);
    assert.equal(doc.sections[0].lines[1].startMatra, 4);
    assert.equal(landing(getTal('jhampak'),8,1.5,1,.5).matra,9);
  }},
  { name: 'half cells: canonical text round-trips duration and fractional entry', fn() {
    const doc = parse(`@8.5 R:1/2 S:1/2\n${CYCLE}`);
    const text = serializeDocument(doc);
    const restored = parseDocument(text);
    assert.deepEqual(restored.problems, []);
    assert.deepEqual(notes(restored.doc), notes(doc));
    assert.equal(serializeDocument(restored.doc), text);
  }},
  { name: 'half cells: hold-to-division stops at sam without adding half a beat', fn() {
    const doc = parse('@8 S:1/2 _\nS');
    assert.equal(notes(doc)[0].dur,1.5);
    assert.equal(notes(doc).at(-1).t,1.5);
    assert.deepEqual(notes(parseDocument(serializeDocument(doc)).doc),notes(doc));
    const last = parse('@9 _\nS');
    assert.equal(notes(last)[0].t,.5);
  }},
  { name: 'half cells: grid edits retain half duration and reject incomplete changes', fn() {
    const src = `tal: jhampak\ntempo: 60\n\n${CYCLE}`;
    const changed = replaceGridCellToken(src,4,8,'G');
    assert.equal(changed.ok,true);
    assert.equal(scheduleDocument(changed.doc).duration,8.5);
    assert.equal(line(changed.doc).matras[8].events[0].ch,'G');
    assert.equal(replaceGridCellToken(src,4,8,'').ok,false);
    assert.equal(replaceGridCellToken(src,4,8,'G:1/').ok,false);
    const full = replaceGridCellToken(src,4,8,'G:1');
    assert.equal(full.ok,true);
    assert.equal(scheduleDocument(full.doc).duration,9);
  }},
  { name: 'half cells: source anchors and rendered geometry agree on exact offsets', fn() {
    const doc=parse(CYCLE); const geometry=buildLineGeometry(line(doc));
    const scan=scanMusicLine(CYCLE);
    assert.equal(scan.error,null);
    assert.equal(rationalNumber(scan.duration),8.5);
    assert.deepEqual(scan.attacks.map(a=>rationalNumber(a.time)),geometry.attacks.map(a=>a.time.num/a.time.den));
    assert.equal(geometry.durationLabel,'17/2');
    const group=scanMusicLine('[S R]:1/2 G:1/2');
    assert.deepEqual(group.attacks.map(a=>rationalNumber(a.time)),[0,.25,.5]);
  }},
  { name: 'half cells: local meter clicks use shortened cells and true written offsets', fn() {
    const doc=parse('S:1/2 R:1/2 G');
    const spans=[{sourceLine:4,start:rational(0),end:rational(2),unit:rational(1,4),valid:true,label:'4/1'}];
    assert.deepEqual(meterTicksForMatra(spans,4,1,line(doc)).map(t=>rationalNumber(t.offset)),[.25]);
    const schedule=scheduleDocument(doc,{meterSpans:spans});
    assert.deepEqual(schedule.events.filter(e=>e.subdivision).map(e=>e.t),[.25,.75,1.25,1.5,1.75]);
  }},
  { name: 'jhampak: score, graph paper, and print label all half cells and khali', fn() {
    dom(); const doc=parse(`${CYCLE}\nS`);
    for (const options of [{},{graphPaper:true,graphColumns:16,maxSystemEm:40}]) {
      const root=renderDocument(doc,options);
      assert.equal(root.querySelectorAll('.sr-half-beat').length,3);
      const cells=[...root.querySelectorAll('.sr-cell')];
      assert.equal(cells[5].querySelector('.sr-marker').textContent,'0');
      assert.equal(cells[8].dataset.cycleMatra,'8.5');
      assert.equal(cells[10].querySelector('.sr-marker').textContent,'+');
      assert.match(rhythmGridLabel(rhythmGridIdentity(cells[8])),/tala matra 8.5, half-beat cell/);
    }
    assert.equal(renderExport(doc).querySelectorAll('.sr-half-beat').length,3);
  }},
  { name: 'audit: free-time grid cells do not claim tala matra zero', fn() {
    dom(); const root=renderDocument(parse('S R','free'));
    const identity=rhythmGridIdentity(root.querySelector('.sr-cell'));
    assert.equal(identity.cycleMatra,null);
    assert.match(rhythmGridLabel(identity),/^written matra 1/);
  }},
  { name: 'jhampak: MusicXML emits integer 17/8 and exact measure lengths', fn() {
    const xml=documentToMusicXML(parse(`${CYCLE}\n${CYCLE}`));
    const doc=new JSDOM(xml,{contentType:'text/xml'}).window.document;
    assert.equal(doc.querySelector('beats').textContent,'17');
    assert.equal(doc.querySelector('beat-type').textContent,'8');
    for(const measure of doc.querySelectorAll('measure')) {
      assert.equal([...measure.querySelectorAll('duration')].reduce((sum,e)=>sum+Number(e.textContent),0),17);
    }
    assert.match(documentToMusicXML(parse('')) , /<duration>17<\/duration>/);
  }},
  { name: 'audit: staff export follows first/second endings like playback', fn() {
    const doc=parse('||: S R |1 G :||\nm','tintal');
    assert.equal(scheduleDocument(doc).duration,6);
    const xml=new JSDOM(documentToMusicXML(doc),{contentType:'text/xml'}).window.document;
    assert.deepEqual([...xml.querySelectorAll('pitch step')].map(e=>e.textContent),['C','D','E','C','D','F']);
  }},
  { name: 'half cells: slides and krintan retain duration through canonicalization', fn() {
    for (const body of ['S~:1/2 R:1/2', '~(S:1/2 R:1/2)', '[[S:1/2/R:1/2]]']) {
      const doc=parse(body);
      const restored=parseDocument(serializeDocument(doc));
      assert.deepEqual(restored.problems,[]);
      assert.equal(scheduleDocument(restored.doc).duration,1);
      assert.deepEqual(notes(restored.doc),notes(doc));
    }
  }},
  { name: 'jhampak: fractional and final half-beat Gat entries are accepted', fn() {
    assert.equal(scanMusicLine('S:1/2 R:1/2 gat@8.5..@1').error,null);
    assert.equal(parseReturnCueToken('gat@8.5..@1',getTal('jhampak')).ok,true);
    assert.equal(parseReturnCueToken('gat@9',getTal('jhampak')).ok,true);
    assert.equal(parseReturnCueToken('gat@9.5',getTal('jhampak')).ok,false);
    const doc=parse(`Gat\n${CYCLE}\nS\nVistar\nS gat@8.5..@1\nR`);
    assert.deepEqual(notes(doc).slice(-4).map(e=>e.ch),['S','R','S','R']);
  }},
];
