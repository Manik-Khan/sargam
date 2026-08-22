import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  addQueueItem,
  advanceQueue,
  clearQueue,
  createQueueSession,
  moveQueueItem,
  playQueueItem,
  previousQueueItem,
  removeQueueItem,
  setQueueRepeatMode,
} from '../src/engine/session-queue.js';
import {
  buildLibraryCatalog,
  libraryQueueItem,
  normalizeLibraryRecord,
} from '../src/engine/library.js';

const item = (id, title = id) => ({
  libraryId: id,
  title,
  kind: 'audio',
  duration: 120,
  sourceUrl: `/archive/${id}.wav`,
  available: true,
});

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

export const smokes = [
  {
    name: 'session queue: adding upcoming items never interrupts the current recording',
    fn() {
      const initial = createQueueSession({ current: item('source-a', 'A') });
      const next = addQueueItem(initial, item('source-b', 'B'));
      assert.equal(next.current.libraryId, 'source-a');
      assert.deepEqual(next.upcoming.map((entry) => entry.libraryId), ['source-b']);
      assert.deepEqual(next.history, []);
      assert.notEqual(next, initial);
    },
  },
  {
    name: 'session queue: reorder, remove, and clear operate only on upcoming items',
    fn() {
      let session = createQueueSession({ current: item('source-a') });
      session = addQueueItem(session, item('source-b'));
      session = addQueueItem(session, item('source-c'));
      session = addQueueItem(session, item('source-d'));
      const d = session.upcoming[2].queueId;
      session = moveQueueItem(session, d, 0);
      assert.deepEqual(session.upcoming.map((entry) => entry.libraryId), ['source-d', 'source-b', 'source-c']);
      session = removeQueueItem(session, session.upcoming[1].queueId);
      assert.deepEqual(session.upcoming.map((entry) => entry.libraryId), ['source-d', 'source-c']);
      session = clearQueue(session);
      assert.deepEqual(session.upcoming, []);
      assert.equal(session.current.libraryId, 'source-a');
    },
  },
  {
    name: 'session queue: next and previous preserve ordered history',
    fn() {
      let session = createQueueSession({ current: item('source-a') });
      session = addQueueItem(session, item('source-b'));
      session = addQueueItem(session, item('source-c'));
      const advanced = advanceQueue(session, { reason: 'manual' });
      assert.equal(advanced.effect.type, 'load');
      assert.equal(advanced.session.current.libraryId, 'source-b');
      assert.deepEqual(advanced.session.history.map((entry) => entry.libraryId), ['source-a']);
      const previous = previousQueueItem(advanced.session);
      assert.equal(previous.effect.type, 'load');
      assert.equal(previous.session.current.libraryId, 'source-a');
      assert.deepEqual(previous.session.upcoming.map((entry) => entry.libraryId), ['source-b', 'source-c']);
    },
  },
  {
    name: 'session queue: repeat track applies only to natural completion',
    fn() {
      let session = createQueueSession({ current: item('source-a') });
      session = addQueueItem(session, item('source-b'));
      session = setQueueRepeatMode(session, 'track');
      const ended = advanceQueue(session, { reason: 'ended' });
      assert.equal(ended.effect.type, 'restart');
      assert.equal(ended.session.current.libraryId, 'source-a');
      const manual = advanceQueue(session, { reason: 'manual' });
      assert.equal(manual.effect.type, 'load');
      assert.equal(manual.session.current.libraryId, 'source-b');
    },
  },
  {
    name: 'session queue: repeat queue rebuilds the accepted order at its end',
    fn() {
      let session = createQueueSession({ current: item('source-a') });
      session = addQueueItem(session, item('source-b'));
      session = setQueueRepeatMode(session, 'queue');
      session = advanceQueue(session, { reason: 'ended' }).session;
      const wrapped = advanceQueue(session, { reason: 'ended' });
      assert.equal(wrapped.effect.type, 'load');
      assert.equal(wrapped.session.current.libraryId, 'source-a');
      assert.deepEqual(wrapped.session.upcoming.map((entry) => entry.libraryId), ['source-b']);
      assert.deepEqual(wrapped.session.history, []);
    },
  },
  {
    name: 'session queue: A–B loop blocks automatic advance but explicit Next exits it',
    fn() {
      let session = createQueueSession({ current: item('source-a') });
      session = addQueueItem(session, item('source-b'));
      const blocked = advanceQueue(session, { reason: 'ended', loopActive: true });
      assert.equal(blocked.effect.type, 'blocked');
      assert.equal(blocked.effect.reason, 'loop');
      assert.equal(blocked.session.current.libraryId, 'source-a');
      const manual = advanceQueue(session, { reason: 'manual', loopActive: true });
      assert.equal(manual.effect.type, 'load');
      assert.equal(manual.session.current.libraryId, 'source-b');
    },
  },
  {
    name: 'session queue: play now selects a library item and retains the prior current in history',
    fn() {
      const session = createQueueSession({ current: item('source-a') });
      const result = playQueueItem(session, item('source-c'));
      assert.equal(result.effect.type, 'load');
      assert.equal(result.session.current.libraryId, 'source-c');
      assert.deepEqual(result.session.history.map((entry) => entry.libraryId), ['source-a']);
    },
  },
  {
    name: 'library: stable IDs and same-origin URLs form reopenable catalog items',
    fn() {
      const result = normalizeLibraryRecord({
        id: 'fm:record-2274',
        name: 'Class source',
        kind: 'audio',
        duration: 3600,
        url: '/classaudio/record-2274.wav',
        eqProfilesUrl: '/eq/record-2274.json',
      }, { baseUrl: 'https://archive.example/sargam/' });
      assert.equal(result.ok, true);
      assert.equal(result.item.libraryId, 'fm:record-2274');
      assert.equal(result.item.sourceUrl, 'https://archive.example/classaudio/record-2274.wav');
      assert.equal(result.item.eqProfilesUrl, 'https://archive.example/eq/record-2274.json');
      assert.equal(result.item.reopenable, true);
      assert.equal(result.item.available, true);
    },
  },
  {
    name: 'library: filename alone never establishes identity and foreign URLs stay unavailable',
    fn() {
      assert.equal(normalizeLibraryRecord({ name: 'same-name.wav', duration: 10 }, {
        baseUrl: 'https://archive.example/sargam/',
      }).ok, false);
      const foreign = normalizeLibraryRecord({
        id: 'source-foreign', name: 'Foreign source', duration: 10,
        url: 'https://other.example/audio.wav',
      }, { baseUrl: 'https://archive.example/sargam/' });
      assert.equal(foreign.ok, true);
      assert.equal(foreign.item.available, false);
      assert.equal(foreign.item.reopenable, false);
      assert.match(foreign.item.problem, /same archive host/);
    },
  },
  {
    name: 'library: the loaded local source is visible but remains an explicit reconnection case',
    fn() {
      const catalog = buildLibraryCatalog([
        { id: 'source-local', name: 'Local class.wav', duration: 120 },
        { id: 'source-archive', name: 'Archive class.wav', duration: 180, url: '/classaudio/archive.wav' },
      ], {
        baseUrl: 'https://archive.example/sargam/',
        current: { id: 'source-local', name: 'Local class.wav', duration: 120, kind: 'audio' },
      });
      assert.equal(catalog.length, 2);
      assert.equal(catalog[0].current, true);
      assert.equal(catalog[0].available, true);
      assert.equal(catalog[0].reopenable, false);
      assert.match(catalog[0].problem, /reconnect/i);
      const queued = libraryQueueItem(catalog[1]);
      assert.equal(queued.libraryId, 'source-archive');
      assert.equal(queued.sourceUrl, 'https://archive.example/classaudio/archive.wav');
    },
  },
  {
    name: 'library UI: catalog, linked phrases, and session Queue remain distinct surfaces',
    async fn() {
      const toolbar = await read('../src/shell/Toolbar.jsx');
      assert.match(toolbar, /LibraryDrawer/);
      assert.match(toolbar, /Linked phrases/);
      assert.match(toolbar, /QueueDrawer/);
      assert.match(toolbar, /linkedPhraseItems/);
      assert.match(toolbar, /queueSession/);
      assert.doesNotMatch(toolbar, /Practice queue/);
    },
  },
  {
    name: 'queue UI: shell wires catalog loading and every accepted session operation',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      const drawer = await read('../src/shell/QueueDrawer.jsx');
      assert.match(app, /buildLibraryCatalog/);
      assert.match(app, /load-library-source/);
      assert.match(app, /addQueueItem/);
      assert.match(app, /moveQueueItem/);
      assert.match(app, /removeQueueItem/);
      assert.match(app, /clearQueue/);
      assert.match(app, /previousQueueItem/);
      assert.match(app, /advanceQueue/);
      assert.match(app, /setQueueRepeatMode/);
      assert.match(drawer, /value=\{session\?\.repeatMode \|\| 'off'\}/);
      assert.match(drawer, /A–B loop is holding automatic advance/);
    },
  },
  {
    name: 'library UI: unavailable media narrates reconnection instead of filename substitution',
    async fn() {
      const drawer = await read('../src/shell/LibraryDrawer.jsx');
      const library = await read('../src/engine/library.js');
      assert.match(drawer, /reconnect before queueing/);
      assert.match(drawer, /disabled=\{!canReopen \|\| isQueued\}/);
      assert.match(library, /filename alone is not identity/);
      assert.match(library, /same archive host/);
    },
  },
];
