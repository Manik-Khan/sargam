// Vilambit Phase 3A — persistent A–B loops attached to notation selections.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { addAnchorMark, parseAnchorMetadata } from '../src/engine/anchors.js';
import {
  addAudioLink,
  attachClipToAudioLink,
  parseAudioLinkDocument,
  parseAudioLinkMetadata,
  recordingMatches,
  removeAudioLink,
  sourceAssetFromAudioLink,
  stripAudioLinkMetadata,
} from '../src/engine/audio-links.js';
import { renderDocument } from '../src/engine/render.js';
import { mountAudioLinkOverlays } from '../src/shell/audio-link-overlay.js';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');
const music = `---\ntal: jhaptal\n---\n\nGAT\n@8 ||: .D--.n -S gm D - ~(D m) [[g---RS R-]] S- :||`;
const player = {
  loaded: true,
  source: { name: 'Jhaptal class.wav', kind: 'audio' },
  duration: 600,
  loop: { a: 42.25, b: 48.75, on: true, ready: true },
};

function selection(source, fragment) {
  const start = source.indexOf(fragment);
  assert.ok(start >= 0, `missing fixture fragment ${fragment}`);
  return { start, end: start + fragment.length };
}

export const smokes = [
  {
    name: 'audio links: selected notation and current A–B loop persist together',
    fn() {
      const sel = selection(music, 'gm D - ~(D m)');
      const result = addAudioLink(music, {
        player,
        selectionStart: sel.start,
        selectionEnd: sel.end,
      });
      assert.equal(result.ok, true);
      assert.match(result.text, /sargam-audio-links:v1/);
      const stored = parseAudioLinkMetadata(result.text).links[0];
      assert.equal(stored.startTime, 42.25);
      assert.equal(stored.endTime, 48.75);
      assert.notEqual(stored.recording.key, stored.recording.name);
      assert.equal(stored.notationStart.note, 'g');
      assert.equal(stored.notationEnd.note, 'm');
    },
  },
  {
    name: 'audio links: new records name an explicit source and preserve practice settings',
    fn() {
      const sel = selection(music, 'gm D');
      const linked = addAudioLink(music, {
        player: { ...player, speed: 75, pitch: { totalSemitones: -1 } },
        selectionStart: sel.start, selectionEnd: sel.end,
      });
      assert.match(linked.link.sourceAssetId, /^source-/);
      assert.deepEqual(linked.link.sourceRange, { start: 42.25, end: 48.75 });
      assert.deepEqual(linked.link.practice, { speed: 75, pitchSemitones: -1 });
      assert.equal(sourceAssetFromAudioLink(linked.link).id, linked.link.sourceAssetId);
    },
  },
  {
    name: 'audio links: legacy v1 records upgrade in memory without losing old aliases',
    fn() {
      const legacy = `${music}\n\n<!-- sargam-audio-links:v1\n${JSON.stringify({ version: 1, links: [{
        id: 'audio1', recording: { key: 'abc', name: 'old.wav', kind: 'audio', duration: 60 },
        startTime: 2, endTime: 3, notationStart: {}, notationEnd: {},
      }] }, null, 2)}\n-->\n`;
      const stored = parseAudioLinkMetadata(legacy).links[0];
      assert.equal(stored.sourceAssetId, 'source-abc');
      assert.deepEqual(stored.sourceRange, { start: 2, end: 3 });
      assert.equal(stored.clipAssetId, null);
      assert.equal(stored.startTime, 2);
    },
  },
  {
    name: 'audio links: attaching or detaching a clip never removes source timing',
    fn() {
      const sel = selection(music, 'gm D');
      const linked = addAudioLink(music, { player, selectionStart: sel.start, selectionEnd: sel.end });
      const attached = attachClipToAudioLink(linked.text, linked.link.id, 'clip-0001');
      assert.equal(attached.ok, true);
      assert.equal(attached.link.clipAssetId, 'clip-0001');
      assert.deepEqual(attached.link.sourceRange, { start: 42.25, end: 48.75 });
      const detached = attachClipToAudioLink(attached.text, linked.link.id, null);
      const restored = parseAudioLinkMetadata(detached.text).links[0];
      assert.equal(restored.clipAssetId, null);
      assert.equal(restored.startTime, 42.25);
      assert.equal(restored.endTime, 48.75);
    },
  },
  {
    name: 'audio links: generated block coexists before anchor metadata without changing either model',
    fn() {
      const anchored = addAnchorMark(music, {
        kind: 'da',
        start: { anchorKind: 'attack', sourceLine: 6, ordinal: 0, time: '0', note: 'D' },
      });
      const sel = selection(anchored.text, 'gm D');
      const linked = addAudioLink(anchored.text, {
        player,
        selectionStart: sel.start,
        selectionEnd: sel.end,
      });
      assert.equal(linked.ok, true);
      assert.ok(linked.text.indexOf('sargam-audio-links:v1') < linked.text.indexOf('sargam-anchors:v1'));
      assert.equal(parseAnchorMetadata(linked.text).marks.length, 1);
      assert.equal(parseAudioLinkMetadata(linked.text).links.length, 1);
      assert.equal(stripAudioLinkMetadata(linked.text), anchored.text);
    },
  },
  {
    name: 'audio links: parser skips generated JSON and endpoints repair after nearby line movement',
    fn() {
      const sel = selection(music, 'gm D');
      const linked = addAudioLink(music, { player, selectionStart: sel.start, selectionEnd: sel.end });
      assert.equal(parseDocument(linked.text).problems.length, 0);
      const moved = linked.text.replace('\nGAT\n', '\nA NOTE\n\nGAT\n');
      const parsed = parseAudioLinkDocument(moved);
      assert.ok(['resolved', 'repaired'].includes(parsed.links[0].status));
    },
  },
  {
    name: 'audio links: recording identity uses name, kind, and duration—not filename alone',
    fn() {
      const sel = selection(music, 'gm D');
      const linked = addAudioLink(music, { player, selectionStart: sel.start, selectionEnd: sel.end });
      const reference = linked.link.recording;
      assert.equal(recordingMatches(reference, player), true);
      assert.equal(recordingMatches(reference, { ...player, duration: 601 }), false);
      assert.equal(recordingMatches(reference, { ...player, source: { ...player.source, kind: 'video' } }), false);
    },
  },
  {
    name: 'audio links: removal restores the exact pre-link document',
    fn() {
      const sel = selection(music, 'gm D');
      const linked = addAudioLink(music, { player, selectionStart: sel.start, selectionEnd: sel.end });
      const removed = removeAudioLink(linked.text, linked.link.id);
      assert.equal(removed.ok, true);
      assert.equal(removed.text, music);
    },
  },
  {
    name: 'audio links: preview indicator consumes exact rendered attack and slot geometry',
    fn() {
      const sel = selection(music, 'gm D');
      const linked = addAudioLink(music, { player, selectionStart: sel.start, selectionEnd: sel.end });
      const model = parseAudioLinkDocument(linked.text);
      const dom = new JSDOM('<!doctype html><body></body>');
      const previous = { document: globalThis.document, window: globalThis.window, CSS: globalThis.CSS };
      globalThis.window = dom.window;
      globalThis.document = dom.window.document;
      globalThis.CSS = dom.window.CSS || { escape: String };
      try {
        const score = renderDocument(parseDocument(linked.text).doc);
        dom.window.document.body.appendChild(score);
        let activated = null;
        mountAudioLinkOverlays(score, model.links, { onActivate: (link) => { activated = link.id; } });
        const slots = score.querySelectorAll('.sr-audio-linked');
        assert.ok(slots.length >= 2);
        assert.ok(score.querySelector('.sr-audio-link-badge'));
        slots[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert.equal(activated, model.links[0].id);
      } finally {
        globalThis.document = previous.document;
        globalThis.window = previous.window;
        globalThis.CSS = previous.CSS;
      }
    },
  },
  {
    name: 'audio links: shell exposes attach, linked playback, removal, and folded metadata seams',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      const bar = await read('../src/shell/PracticeBar.jsx');
      const editor = await read('../src/shell/EditorPane.jsx');
      const preview = await read('../src/shell/PreviewPane.jsx');
      assert.match(app, /addAudioLink/);
      assert.match(app, /set-loop/);
      assert.match(app, /recordingMatches/);
      assert.match(bar, /Attach Loop/);
      assert.match(bar, /Play Linked/);
      assert.match(bar, /Extract Clip/);
      assert.match(bar, /Remove Link/);
      assert.match(app, /createProjectIO/);
      assert.match(app, /attachClipToAudioLink/);
      assert.match(editor, /audioLinkMetadataRanges/);
      assert.match(preview, /mountAudioLinkOverlays/);
    },
  },
];
