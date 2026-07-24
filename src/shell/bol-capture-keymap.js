// src/shell/bol-capture-keymap.js — CodeMirror must see Bol Capture before
// its ordinary cursor keymap. A DOM listener registered after defaultKeymap
// cannot reliably claim ArrowUp/ArrowDown because navigation has already won.

import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';

const CAPTURE_KEYS = [
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'v',
  'V',
  '^',
  'c',
  'C',
  'Backspace',
  'Delete',
  'Escape',
  '-',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
];

export function createBolCaptureBindings(handleKey) {
  return CAPTURE_KEYS.map((key) => ({
    key,
    preventDefault: false,
    run() {
      return Boolean(handleKey?.(key));
    },
  }));
}

export function bolCaptureKeymap(handleKey) {
  return Prec.highest(keymap.of(createBolCaptureBindings(handleKey)));
}
