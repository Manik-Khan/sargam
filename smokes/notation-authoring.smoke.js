import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { history, undo, redo, isolateHistory } from '@codemirror/commands';
import { parseDocument } from '../src/engine/parse.js';
import { prepareOrnamentEdit, describeNotationSelection, sourceEditChange } from '../src/shell/notation-authoring.js';

const source = music => `---\ntal: jhampak\n---\n${music}`;
const range = (text, selected) => ({ start: text.indexOf(selected), end: text.indexOf(selected) + selected.length });
function apply(text, selected, kind) {
  const result = prepareOrnamentEdit(text, range(text, selected), kind);
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(parseDocument(result.text).problems, []);
  return result;
}
const line = text => parseDocument(text).doc.sections[0].lines[0];
export const smokes = [
  { name: 'writing controls: typed and button ornaments use the same editable grammar', fn() {
    for (const [kind, expected] of [['slide','~(Gm)'],['krintan','[[Gm]]'],['kan','{G}m']]) {
      const result = apply(source('Gm R S'), 'Gm', kind);
      assert.equal(result.text, source(`${expected} R S`));
      assert.equal(result.text.slice(result.selectionStart,result.selectionEnd), expected);
      const typed = describeNotationSelection(result.text, range(result.text,expected));
      assert.equal(typed.kind, kind);
      assert.equal(line(result.text).matras.length, 3);
    }
  } },
  { name: 'writing controls: switching and removing ornaments never nests wrappers', fn() {
    const original = source('Gm R S');
    const slide = apply(original,'Gm','slide');
    const krintan = apply(slide.text,'~(Gm)','krintan');
    const kan = apply(krintan.text,'[[Gm]]','kan');
    const plain = apply(kan.text,'{G}m','none');
    assert.equal(plain.text, original);
    assert.equal(apply(source('~Gm R'),'~Gm','slide').text, source('~(Gm) R'));
  } },
  { name: 'writing controls: kan remaps every bol pass to destinations and following notes', fn() {
    const text = source('Gm R S\n> da ra diri chikari\n>2 ra da chikari ra');
    const result = apply(text,'Gm','kan');
    const parsedLine = line(result.text);
    assert.deepEqual(parsedLine._bolPasses[0].assignments,['ra','diri','chikari']);
    assert.deepEqual(parsedLine._bolPasses[1].assignments,['da','chikari','ra']);
    const restored = apply(result.text,'{G}m','none');
    assert.deepEqual(line(restored.text)._bolPasses[0].assignments,[null,'ra','diri','chikari']);
    assert.match(result.message,/destination bols kept/);
  } },
  { name: 'writing controls: a diri cannot silently move to an unrelated pair after kan', fn() {
    const result = apply(source('Gm R S\n> di-ri da ra'),'Gm','kan');
    assert.deepEqual(line(result.text)._bolPasses[0].assignments,[null,'da','ra']);
  } },
  { name: 'writing controls: partial cluster slides retain rhythm; unsafe krintan scopes explain the issue', fn() {
    assert.equal(apply(source('DDDP R'),'DP','slide').text,source('DD~(DP) R'));
    const result = prepareOrnamentEdit(source('DDDP R'),range(source('DDDP R'),'DP'),'krintan');
    assert.equal(result.ok,false);
    assert.match(result.message,/boundaries/);
  } },
  { name: 'writing controls: incomplete selections and structural text never corrupt notation', fn() {
    for (const [music, selected, kind] of [['Gm R','G','kan'],['G m R','G m','kan'],["'Gm R",'Gm','slide'],['~(Gm) R','~(G','krintan']]) {
      const text = source(music);
      assert.equal(prepareOrnamentEdit(text,range(text,selected),kind).ok,false,selected);
    }
    const text = source('Gm R');
    assert.equal(prepareOrnamentEdit(text,range(text,'jhampak'),'slide').ok,false);
    assert.equal(prepareOrnamentEdit(text,{start:text.length,end:text.length},'slide').ok,false);
  } },
  { name: 'writing controls: Jhampak half-cell and inline krintan are preserved', fn() {
    const text = source('@8 Gm ND S');
    const result = apply(text,'ND','slide');
    assert.equal(line(result.text).matras[1].duration.num / line(result.text).matras[1].duration.den,0.5);
    const inline = apply(source('[-[[RS]]-.n] G'),'[[RS]]','none');
    assert.equal(line(inline.text).matras.length,2);
    assert.equal(inline.text,source('[-RS-.n] G'));
  } },
  { name: 'writing controls: gap chikari stays on its written hold when attack ordinals change', fn() {
    const text = source('Gm -S\n> da ra ^da');
    const result = apply(text,'Gm','kan');
    const lane = line(result.text)._bolPasses[0];
    assert.deepEqual(lane.assignments,['ra','da']);
    assert.equal(lane.gapChikaris[1],true);
    assert.equal(lane.plan.slots[1].kind,'hold');
    const restored = apply(result.text,'{G}m','none');
    assert.equal(line(restored.text)._bolPasses[0].gapChikaris[2],true);
  } },
  { name: 'writing controls: a caret between adjacent notes targets just the following note', fn() {
    const text = source('Gm R');
    const position = text.indexOf('Gm')+1;
    const selected = describeNotationSelection(text,{start:position,end:position});
    assert.deepEqual(selected.attacks.map(attack => attack.note),['m']);
  } },
  { name: 'writing controls: one undo restores notes, bols and selection together', fn() {
    const original = source('Gm R S\n> da ra diri chikari');
    const selected = range(original,'Gm');
    const result = apply(original,'Gm','kan');
    let state = EditorState.create({ doc:original, selection:{anchor:selected.start,head:selected.end}, extensions:[history()] });
    state = state.update({ changes:sourceEditChange(original,result.text), selection:{anchor:result.selectionStart,head:result.selectionEnd}, annotations:isolateHistory.of('full'), userEvent:'input.notation' }).state;
    const target = { get state() { return state; }, dispatch(transaction) { state=transaction.state; } };
    assert.equal(undo(target),true);
    assert.equal(state.doc.toString(),original);
    assert.equal(state.selection.main.from,selected.start);
    assert.equal(state.selection.main.to,selected.end);
    assert.equal(redo(target),true);
    assert.equal(state.doc.toString(),result.text);
  } },
];
