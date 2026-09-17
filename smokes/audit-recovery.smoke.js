import assert from 'node:assert/strict';
import { createStore } from '../src/engine/files.js';
import { createDraftAutosave } from '../src/shell/draft-autosave.js';

export const smokes = [
  { name: 'audit: malformed recent-file JSON cannot interrupt save or removal', fn() {
    for (const malformed of [{}, 'oops', 42, [null, 12, {}, {id:'old',title:'Old'}]]) {
      const data = new Map([['sargam.recents', JSON.stringify(malformed)]]);
      const store = createStore({getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}, {now:()=> '2026-09-16'});
      assert.ok(store.listRecents().every(r=>typeof r.id === 'string'));
      assert.equal(store.recordRecent({id:'new',name:'new.md'}),true);
      assert.equal(store.listRecents()[0].id,'new');
      store.removeRecent('new');
      assert.ok(store.listRecents().every(r=>r.id !== 'new'));
    }
  }},
  { name: 'audit: draft debounce saves latest text and pagehide flush cancels stale writes', fn() {
    const timers = new Map(); let nextId=0; const saved=[];
    const auto = createDraftAutosave({saveCurrent:text=>{saved.push(text);return true;}}, {
      setTimer:fn=>{timers.set(++nextId,fn);return nextId;},clearTimer:id=>timers.delete(id),
    });
    auto.schedule('old');auto.schedule('latest');
    assert.equal(timers.size,1);
    assert.equal(auto.flush(),true);
    assert.deepEqual(saved,['latest']);
    assert.equal(timers.size,0);
    auto.flush();assert.deepEqual(saved,['latest']);
    auto.schedule('');[...timers.values()][0]();
    assert.deepEqual(saved,['latest','']);
  }},
  { name: 'audit: storage failure reports recovery risk and retains draft for retry', fn() {
    let fail=true;let warnings=0;const saved=[];
    const auto=createDraftAutosave({saveCurrent:text=>{if(fail)return false;saved.push(text);return true;}},{onFailure:()=>warnings++,setTimer:()=>1,clearTimer:()=>{}});
    auto.schedule('unsaved music');assert.equal(auto.flush(),false);assert.equal(warnings,1);
    fail=false;assert.equal(auto.flush(),true);assert.deepEqual(saved,['unsaved music']);
  }},
];
