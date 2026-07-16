// files.smoke.js — M2 "keep your music": identity maintenance, autosave store, file I/O seams.
// Engine rule: files.js is plain JS, no React, no DOM. Browser surfaces are injected,
// so every smoke here runs in bare node with mocks.
import assert from 'node:assert/strict';
import { ensureIdentity, createStore, createFileIO } from '../src/engine/files.js';

// ---------- fixtures ----------

const CLOCK = {
  now: () => '2026-07-16T18:00:00.000Z',
  uuid: () => '00000000-0000-4000-8000-000000000001',
};
const CLOCK2 = {
  now: () => '2026-07-16T19:30:00.000Z',
  uuid: () => 'ffffffff-ffff-4fff-8fff-fffffffffffe',
};

const KIRWANI_HEADER = `title: Kahe Ko (khyal) — R. 1732
raga: kirwani
tal: tintal
sa: C#
tempo: 72

Sthayi
@7 ||: .d P | mg R m m | P d N~ 'S | .d - P m | R - :||
" ka- he | ko ma- na na- | hi | ma- ne | re
`;

const FRONTMATTER_DOC = `---
title: Kahe Ko (khyal) — R. 1732
raga: kirwani
tal: tintal
---

Sthayi
@7 .d P | mg R m m
`;

function mockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

// ---------- ensureIdentity: plain (unfenced) headers ----------

export const smokes = [
  {
    name: 'identity: inserts id/created/modified after existing header directives',
    fn() {
      const { text, changed } = ensureIdentity(KIRWANI_HEADER, CLOCK);
      assert.equal(changed, true);
      const lines = text.split('\n');
      assert.equal(lines[4], 'tempo: 72');
      assert.equal(lines[5], 'id: 00000000-0000-4000-8000-000000000001');
      assert.equal(lines[6], 'created: 2026-07-16T18:00:00.000Z');
      assert.equal(lines[7], 'modified: 2026-07-16T18:00:00.000Z');
      assert.equal(lines[8], ''); // blank line before Sthayi untouched
      assert.equal(lines[9], 'Sthayi');
    },
  },
  {
    name: 'identity: music/lyric body is byte-identical after insertion',
    fn() {
      const { text } = ensureIdentity(KIRWANI_HEADER, CLOCK);
      const bodyBefore = KIRWANI_HEADER.split('\n').slice(6).join('\n');
      const bodyAfter = text.split('\n').slice(9).join('\n');
      assert.equal(bodyAfter, bodyBefore);
    },
  },
  {
    name: 'identity: preserves existing id and created; bumps only modified',
    fn() {
      const first = ensureIdentity(KIRWANI_HEADER, CLOCK).text;
      const { text: second } = ensureIdentity(first, CLOCK2);
      assert.match(second, /^id: 00000000-0000-4000-8000-000000000001$/m);
      assert.match(second, /^created: 2026-07-16T18:00:00\.000Z$/m);
      assert.match(second, /^modified: 2026-07-16T19:30:00\.000Z$/m);
      assert.doesNotMatch(second, /ffffffff/);
    },
  },
  {
    name: 'identity: idempotent under a fixed clock (byte-identical, changed=false)',
    fn() {
      const first = ensureIdentity(KIRWANI_HEADER, CLOCK).text;
      const again = ensureIdentity(first, CLOCK);
      assert.equal(again.text, first);
      assert.equal(again.changed, false);
    },
  },
  {
    name: 'identity: headerless doc (music from line 1) gets a header block prepended',
    fn() {
      const src = `@7 .d P | mg R m m\n`;
      const { text } = ensureIdentity(src, CLOCK);
      const lines = text.split('\n');
      assert.equal(lines[0], 'id: 00000000-0000-4000-8000-000000000001');
      assert.equal(lines[1], 'created: 2026-07-16T18:00:00.000Z');
      assert.equal(lines[2], 'modified: 2026-07-16T18:00:00.000Z');
      assert.equal(lines[3], '');
      assert.equal(lines[4], '@7 .d P | mg R m m');
    },
  },
  {
    name: 'identity: mid-document directives (tal: free) are never mistaken for header',
    fn() {
      const src = `tal: tintal\n\nSthayi\nS R g m\n\ntal: free\n\nAlap\n~PS.NRS\n`;
      const { text } = ensureIdentity(src, CLOCK);
      // id inserted once, in the top header only
      const idCount = (text.match(/^id: /gm) || []).length;
      assert.equal(idCount, 1);
      assert.match(text.split('\n\n')[0], /^tal: tintal\nid: /);
      // the mid-doc directive survives untouched in place
      assert.match(text, /\ntal: free\n/);
    },
  },
  {
    name: 'identity: empty document gets a bare identity header, no throw',
    fn() {
      const { text } = ensureIdentity('', CLOCK);
      assert.match(text, /^id: 00000000-0000-4000-8000-000000000001\n/);
      assert.match(text, /modified: 2026-07-16T18:00:00\.000Z\n$/);
    },
  },

  // ---------- ensureIdentity: frontmatter (---) fenced headers ----------

  {
    name: 'frontmatter: identity inserted inside the fences, before closing ---',
    fn() {
      const { text } = ensureIdentity(FRONTMATTER_DOC, CLOCK);
      const lines = text.split('\n');
      assert.equal(lines[0], '---');
      assert.equal(lines[4], 'id: 00000000-0000-4000-8000-000000000001');
      assert.equal(lines[5], 'created: 2026-07-16T18:00:00.000Z');
      assert.equal(lines[6], 'modified: 2026-07-16T18:00:00.000Z');
      assert.equal(lines[7], '---');
    },
  },
  {
    name: 'frontmatter: body after closing fence is byte-identical',
    fn() {
      const { text } = ensureIdentity(FRONTMATTER_DOC, CLOCK);
      const bodyBefore = FRONTMATTER_DOC.split('---\n')[2];
      const bodyAfter = text.split('---\n')[2];
      assert.equal(bodyAfter, bodyBefore);
    },
  },
  {
    name: 'frontmatter: idempotent; existing id/created inside fences preserved',
    fn() {
      const first = ensureIdentity(FRONTMATTER_DOC, CLOCK).text;
      const second = ensureIdentity(first, CLOCK);
      assert.equal(second.text, first);
      assert.equal(second.changed, false);
      const third = ensureIdentity(first, CLOCK2).text;
      assert.match(third, /^id: 00000000-0000-4000-8000-000000000001$/m);
      assert.match(third, /^modified: 2026-07-16T19:30:00\.000Z$/m);
    },
  },
  {
    name: 'frontmatter: a --- later in the body is not treated as a fence',
    fn() {
      // only a --- on line 1 opens frontmatter; this doc has none
      const src = `tal: tintal\n\nSthayi\nS R g m\n---\nmore text\n`;
      const { text } = ensureIdentity(src, CLOCK);
      assert.match(text, /^tal: tintal\nid: /);
      assert.match(text, /\n---\nmore text\n/);
    },
  },

  // ---------- createStore: autosave slot ----------

  {
    name: 'store: saveCurrent/loadCurrent round-trips text and savedAt',
    fn() {
      const store = createStore(mockStorage(), CLOCK);
      store.saveCurrent('S R g m');
      const got = store.loadCurrent();
      assert.equal(got.text, 'S R g m');
      assert.equal(got.savedAt, '2026-07-16T18:00:00.000Z');
    },
  },
  {
    name: 'store: loadCurrent is null when nothing autosaved',
    fn() {
      const store = createStore(mockStorage(), CLOCK);
      assert.equal(store.loadCurrent(), null);
    },
  },
  {
    name: 'store: clearCurrent removes the slot',
    fn() {
      const store = createStore(mockStorage(), CLOCK);
      store.saveCurrent('S R g m');
      store.clearCurrent();
      assert.equal(store.loadCurrent(), null);
    },
  },
  {
    name: 'store: corrupt JSON in the slot is treated as absent, never throws',
    fn() {
      const storage = mockStorage();
      storage.setItem('sargam.current', '{not json');
      const store = createStore(storage, CLOCK);
      assert.equal(store.loadCurrent(), null);
    },
  },

  // ---------- createStore: recents + per-id snapshots ----------

  {
    name: 'store: recordRecent + listRecents, most recent first, deduped by id',
    fn() {
      const store = createStore(mockStorage(), CLOCK);
      store.recordRecent({ id: 'a', title: 'Kahe Ko', name: 'kahe-ko.md' });
      store.recordRecent({ id: 'b', title: 'Desh 1979', name: 'desh.md' });
      store.recordRecent({ id: 'a', title: 'Kahe Ko', name: 'kahe-ko.md' });
      const r = store.listRecents();
      assert.equal(r.length, 2);
      assert.equal(r[0].id, 'a');
      assert.equal(r[1].id, 'b');
    },
  },
  {
    name: 'store: recents capped at 10, oldest dropped (and its snapshot with it)',
    fn() {
      const store = createStore(mockStorage(), CLOCK);
      for (let i = 1; i <= 11; i++) {
        store.recordRecent({ id: `id${i}`, title: `t${i}`, name: `f${i}.md` });
        store.saveSnapshot(`id${i}`, `text ${i}`);
      }
      const r = store.listRecents();
      assert.equal(r.length, 10);
      assert.equal(r[0].id, 'id11');
      assert.equal(r[9].id, 'id2');
      assert.equal(store.loadSnapshot('id1'), null);
      assert.equal(store.loadSnapshot('id2'), 'text 2');
    },
  },
  {
    name: 'store: saveSnapshot/loadSnapshot round-trip; removeRecent drops both',
    fn() {
      const store = createStore(mockStorage(), CLOCK);
      store.recordRecent({ id: 'a', title: 'Kahe Ko', name: 'kahe-ko.md' });
      store.saveSnapshot('a', 'S R g m');
      assert.equal(store.loadSnapshot('a'), 'S R g m');
      store.removeRecent('a');
      assert.equal(store.listRecents().length, 0);
      assert.equal(store.loadSnapshot('a'), null);
    },
  },
  {
    name: 'store: corrupt recents list narrates as empty, never throws',
    fn() {
      const storage = mockStorage();
      storage.setItem('sargam.recents', '[[[');
      const store = createStore(storage, CLOCK);
      assert.deepEqual(store.listRecents(), []);
    },
  },

  // ---------- createFileIO: FSA path and download fallback ----------

  {
    name: 'fileIO: supportsFSA true when pickers injected, false when absent',
    fn() {
      const withFsa = createFileIO({ fsa: { open: async () => [], save: async () => null }, download: () => {} });
      const noFsa = createFileIO({ fsa: null, download: () => {} });
      assert.equal(withFsa.supportsFSA, true);
      assert.equal(noFsa.supportsFSA, false);
    },
  },
  {
    name: 'fileIO: open() via FSA returns {text, name, handle}',
    async fn() {
      const handle = {
        name: 'kahe-ko.md',
        getFile: async () => ({ text: async () => 'S R g m', name: 'kahe-ko.md' }),
      };
      const io = createFileIO({ fsa: { open: async () => [handle], save: async () => null }, download: () => {} });
      const got = await io.open();
      assert.equal(got.text, 'S R g m');
      assert.equal(got.name, 'kahe-ko.md');
      assert.equal(got.handle, handle);
    },
  },
  {
    name: 'fileIO: open() user-cancel (AbortError) returns null, never throws',
    async fn() {
      const abort = Object.assign(new Error('user cancelled'), { name: 'AbortError' });
      const io = createFileIO({ fsa: { open: async () => { throw abort; }, save: async () => null }, download: () => {} });
      assert.equal(await io.open(), null);
    },
  },
  {
    name: 'fileIO: save() with an existing handle writes in place via FSA',
    async fn() {
      let written = null;
      const handle = {
        name: 'kahe-ko.md',
        createWritable: async () => ({
          write: async (t) => { written = t; },
          close: async () => {},
        }),
      };
      const io = createFileIO({ fsa: { open: async () => [], save: async () => null }, download: () => {} });
      const res = await io.save('S R g m', { handle, suggestedName: 'kahe-ko.md' });
      assert.equal(written, 'S R g m');
      assert.equal(res.method, 'fsa');
      assert.equal(res.handle, handle);
      assert.equal(res.name, 'kahe-ko.md');
    },
  },
  {
    name: 'fileIO: save() without handle under FSA prompts save picker, then writes',
    async fn() {
      let written = null;
      const newHandle = {
        name: 'untitled.md',
        createWritable: async () => ({
          write: async (t) => { written = t; },
          close: async () => {},
        }),
      };
      const io = createFileIO({ fsa: { open: async () => [], save: async () => newHandle }, download: () => {} });
      const res = await io.save('S R g m', { handle: null, suggestedName: 'untitled.md' });
      assert.equal(written, 'S R g m');
      assert.equal(res.method, 'fsa');
      assert.equal(res.handle, newHandle);
    },
  },
  {
    name: 'fileIO: save() cancel at the save picker returns null (nothing written)',
    async fn() {
      const abort = Object.assign(new Error('user cancelled'), { name: 'AbortError' });
      const io = createFileIO({ fsa: { open: async () => [], save: async () => { throw abort; } }, download: () => {} });
      assert.equal(await io.save('S R g m', { handle: null, suggestedName: 'x.md' }), null);
    },
  },
  {
    name: 'fileIO: no FSA (Safari) — save() falls back to download with suggested name',
    async fn() {
      let dl = null;
      const io = createFileIO({ fsa: null, download: (name, text) => { dl = { name, text }; } });
      const res = await io.save('S R g m', { handle: null, suggestedName: 'kahe-ko.md' });
      assert.equal(dl.name, 'kahe-ko.md');
      assert.equal(dl.text, 'S R g m');
      assert.equal(res.method, 'download');
      assert.equal(res.handle, null);
      assert.equal(res.name, 'kahe-ko.md');
    },
  },
  {
    name: 'fileIO: suggested name defaults to untitled.md when nothing better exists',
    async fn() {
      let dl = null;
      const io = createFileIO({ fsa: null, download: (name, text) => { dl = { name, text }; } });
      await io.save('S R g m', { handle: null });
      assert.equal(dl.name, 'untitled.md');
    },
  },
];
