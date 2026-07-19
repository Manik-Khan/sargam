import assert from 'node:assert/strict';
import { centeredLineScrollTop, sourceLineRange } from '../src/shell/editor-nav.js';

export const smokes = [
  {
    name: 'editor navigation: source lines resolve to exact textarea ranges',
    fn() {
      const text = 'title: Test\n\nGat\nS R g\nA\n@4 m D n';
      assert.deepEqual(sourceLineRange(text, 4), { start: 17, end: 22, line: 4 });
      assert.equal(text.slice(17, 22), 'S R g');
      assert.deepEqual(sourceLineRange(text, 6), { start: 25, end: text.length, line: 6 });
    },
  },
  {
    name: 'editor navigation: invalid line numbers clamp safely',
    fn() {
      assert.deepEqual(sourceLineRange('a\nb', -9), { start: 0, end: 1, line: 1 });
      assert.deepEqual(sourceLineRange('a\nb', 99), { start: 2, end: 3, line: 2 });
      assert.deepEqual(sourceLineRange('', 1), { start: 0, end: 0, line: 1 });
    },
  },
  {
    name: 'editor navigation: selected line is centered when space allows',
    fn() {
      assert.equal(
        centeredLineScrollTop({ line: 20, lineHeight: 20, paddingTop: 16, clientHeight: 200 }),
        306,
      );
      assert.equal(
        centeredLineScrollTop({ line: 1, lineHeight: 20, paddingTop: 16, clientHeight: 200 }),
        0,
      );
    },
  },
];
