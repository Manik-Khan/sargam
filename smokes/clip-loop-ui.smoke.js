// Phase 3B Wave 3 — shell wiring for waveform editing and decoded playback.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

export const smokes = [
  {
    name: 'clip loop UI: linked clips expose a waveform editor from notation and the vault',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      const bar = await read('../src/shell/PracticeBar.jsx');
      const vault = await read('../src/shell/ClipVault.jsx');
      assert.match(app, /import ClipLoopEditor from ['"]\.\/ClipLoopEditor\.jsx['"]/);
      assert.match(app, /onEditClip=\{doOpenClipEditor\}/);
      assert.match(bar, />\s*Edit Clip Loop\s*</);
      assert.match(vault, />Edit Loop</);
    },
  },
  {
    name: 'clip loop UI: extracted playback uses decoded Web Audio instead of media-element loop',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      const audio = await read('../src/shell/clip-audio.js');
      assert.match(app, /playClipLoopFile\(file, clip/);
      assert.doesNotMatch(app, /audio\.loop\s*=\s*true/);
      assert.match(audio, /createBufferSource\(\)/);
      assert.match(audio, /linearRampToValueAtTime\(0, finish\)/);
    },
  },
  {
    name: 'clip loop UI: editor draws a waveform and saves non-destructive boundaries',
    async fn() {
      const editor = await read('../src/shell/ClipLoopEditor.jsx');
      assert.match(editor, /<canvas/);
      assert.match(editor, /−100 ms/);
      assert.match(editor, /\+10 ms/);
      assert.match(editor, /Save Loop Points/);
      assert.match(editor, /Open Source in Vilambit/);
      assert.match(editor, /snapLoopRegionToZeroCrossings/);
      assert.match(editor, /audio file is unchanged/i);
    },
  },
  {
    name: 'clip loop UI: future extraction includes context while Markdown source timing stays untouched',
    async fn() {
      const app = await read('../src/shell/App.jsx');
      assert.match(app, /extractionRangeForLink\(link/);
      assert.match(app, /defaultLoopStart/);
      assert.match(app, /paddingBefore/);
      assert.match(app, /Markdown link keeps its original narrower sourceRange/);
    },
  },
];
