// Vilambit Phase 3A — persistent A–B loops attached to notation selections.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { parseDocument } from '../src/engine/parse.js';
import { addAnchorMark, parseAnchorMetadata } from '../src/engine/anchors.js';
import {
  addAudioLink,
  parseAudioLinkDocument,
  parseAudioLinkMetadata,
  recordingMatches,
  removeAudioLink,
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
      assert.match(bar, /Remove Link/);
      assert.match(editor, /audioLinkMetadataRanges/);
      assert.match(preview, /mountAudioLinkOverlays/);
    },
  },
];
