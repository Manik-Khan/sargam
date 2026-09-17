import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { scheduleDocument } from '../src/engine/schedule.js';
import { serializeDocument } from '../src/engine/serialize.js';
import { renderDocument, renderExport } from '../src/engine/render.js';
import { buildLineGeometry } from '../src/engine/notation-geometry.js';
import { attacksForLine } from '../src/engine/anchors.js';
import { scanDocumentMusicLine, selectionToMeterRange, parseMeterDocument, rationalNumber } from '../src/engine/meter.js';
import { selectionToAudioAnchorRange } from '../src/engine/audio-links.js';
import { replaceGridCellToken } from '../src/engine/grid-edit.js';
import { documentToMusicXML } from '../src/engine/western.js';
import { rhythmGridIdentity, rhythmGridLabel } from '../src/shell/rhythm-grid.js';

const PHRASE = '@3 ||: G - Gm | R- S | .N.D .N|S - :||';
const SOURCE = `tal: jhampak\ntempo: 60\n\n${PHRASE}`;
function parse(text = SOURCE) { const p = parseDocument(text);assert.deepEqual(p.problems, []);return p.doc; }
const first = doc => doc.sections[0].lines[0];
const ticks = doc => scheduleDocument(doc).events.filter(e=>e.kind==='tick');

export const smokes = [
  {name:'jhampak automatic: Manik’s unchanged phrase puts final S on sam on both passes',fn(){
    const doc=parse();const schedule=scheduleDocument(doc);
    assert.equal(schedule.duration,17);
    assert.deepEqual(ticks(doc).filter(t=>t.accent==='sam').map(t=>t.t),[6.5,15]);
    const samNotes=schedule.events.filter(e=>e.kind==='note' && [6.5,15].includes(e.t));
    assert.deepEqual(samNotes.map(e=>e.ch),['S','S']);
    assert.deepEqual(first(doc).matras.map(m=>m.duration?.num/m.duration?.den || 1),[1,1,1,1,1,1,.5,1,1]);
    assert.equal(first(doc).matras[6].implicitDuration,true);
  }},
  {name:'jhampak automatic: screen and print show final half then sam without beat 9',fn(){
    globalThis.document=new JSDOM('<!doctype html>').window.document;
    const doc=parse();
    for(const root of [renderDocument(doc),renderDocument(doc,{graphPaper:true,graphColumns:16,maxSystemEm:40}),renderExport(doc)]) {
      const cells=[...root.querySelectorAll('.sr-cell')];
      assert.deepEqual(cells.map(c=>c.dataset.cycleLabel),['3','4','5','6','7','8','½','1','2']);
      assert.equal(cells[6].dataset.gridCoordinate,'½');
      assert.equal(cells[7].querySelector('.sr-marker').textContent,'+');
      assert.match(rhythmGridLabel(rhythmGridIdentity(cells[6])),/final half-beat/);
    }
  }},
  {name:'jhampak automatic: continuing lines, holds, rests, and subdivisions share the tail duration',fn(){
    for(const tail of ['.N','-','.','[.N .D]','{.D}.N','--']) {
      const doc=parse(`tal: jhampak\n\n@9 ${tail}\nS`);
      const last=doc.sections[0].lines.at(-1);
      assert.equal(last.startMatra,tail==='--'?2:1);
      assert.equal(first(doc).matras[0].duration.den,2);
    }
    const doc=parse(`tal: jhampak\n\n@8 .N.D\n.N\nS`);
    assert.deepEqual(ticks(doc).map(t=>t.t),[0,1,1.5]);
    assert.deepEqual(ticks(doc).map(t=>t.cycleMatra),[8,9,1]);
  }},
  {name:'jhampak automatic: grid note edits and canonicalization preserve inferred timing',fn(){
    const edited=replaceGridCellToken(SOURCE,4,6,'.D');
    assert.equal(edited.ok,true);assert.doesNotMatch(edited.text,/:1\/2/);
    assert.equal(scheduleDocument(edited.doc).duration,17);
    const text=serializeDocument(parse());assert.doesNotMatch(text,/:1\/2/);
    assert.equal(scheduleDocument(parse(text)).duration,17);
    assert.equal(serializeDocument(parse(text)),text);
    const full=replaceGridCellToken(SOURCE,4,6,'.N:1');
    assert.equal(full.ok,true);assert.match(serializeDocument(full.doc),/\.N:1/);
    assert.equal(first(full.doc).matras[6].duration.den,1);
  }},
  {name:'jhampak automatic: source anchors and audio selections agree with score timing after half beat',fn(){
    const doc=parse();const geometry=buildLineGeometry(first(doc));
    const scanned=scanDocumentMusicLine(SOURCE,4);
    const expected=geometry.attacks.map(a=>a.time.num/a.time.den);
    assert.deepEqual(scanned.attacks.map(a=>rationalNumber(a.time)),expected);
    assert.deepEqual(attacksForLine(SOURCE,4).attacks.map(a=>rationalNumber(a.time)),expected);
    for(const a of scanned.attacks) assert.equal(PHRASE[a.index],a.ch);
    const start=SOURCE.indexOf('.N.D');const end=SOURCE.indexOf('|S -')+2;
    const range=selectionToAudioAnchorRange(SOURCE,start,end);
    assert.equal(range.ok,true);assert.equal(range.end.time,'13/2');
    const meter=selectionToMeterRange(SOURCE,start,end);
    assert.equal(meter.ok,true);assert.equal(rationalNumber(meter.end),6.5);
    assert.equal(parseMeterDocument(SOURCE+'\n>> 2/1 @5..13/2').problems.length,0);
  }},
  {name:'jhampak automatic: staff export and other talas keep correct durations',fn(){
    const doc=parse();const xml=new JSDOM(documentToMusicXML(doc),{contentType:'text/xml'}).window.document;
    assert.equal(xml.querySelector('beats').textContent,'17');
    assert.deepEqual([...xml.querySelectorAll('measure')].map(m=>[...m.querySelectorAll('duration')].reduce((n,e)=>n+Number(e.textContent),0)),[17,17]);
    assert.equal(scheduleDocument(parse(SOURCE.replace('jhampak','jhaptal'))).duration,18);
  }},
];
