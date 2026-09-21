// Shared source/metric scan for ornaments inside a contiguous note cluster.
// A brace run decorates its next note, wherever that note sits in the beat.
const NOTE = /[SrRgGmMPdDnN]/;
const PLAIN = /[SrRgGmMPdDnN.'-]/;

export function scanOrnamentClusterAt(text, start = 0) {
  const atoms = [];
  let i = start;
  const leadingTilde = text[i] === '~';
  if (leadingTilde) i++;
  let octave = 0;
  let ornament = false;
  let pending = false;
  let approach = null;
  while (i < text.length) {
    const c = text[i];
    if (c === '{') {
      const close = text.indexOf('}', i + 1);
      if (close < 0 || pending) return null;
      const inner = text.slice(i + 1, close).replace(/[\s/]+/g, '');
      const slide = inner.match(/^([.']*)([SrRgGmMPdDnN])~$/);
      if (slide) {
        const marks = slide[1];
        approach = { ch: slide[2], octave: [...marks].reduce((n, ch) => n + (ch === "'" ? 1 : -1), 0) };
      } else {
        if (!/^[.'SrRgGmMPdDnN]+$/.test(inner) || !NOTE.test(inner)) return null;
        let graceOctave = 0;
        for (let k = i + 1; k < close; k++) {
          const ch = text[k];
          if (ch === '.') graceOctave--;
          else if (ch === "'") graceOctave++;
          else if (NOTE.test(ch)) {
            atoms.push({ type: 'note', ch, octave: graceOctave, w: 1, grace: true, kan: true, index: k });
            graceOctave = 0;
          }
        }
      }
      ornament = true;
      pending = true;
      i = close + 1;
      continue;
    }
    if (!PLAIN.test(c)) break;
    if (c === '.') octave--;
    else if (c === "'") octave++;
    else if (c === '-') {
      if (pending) return null;
      if (atoms.length) atoms.at(-1).w++;
      else atoms.push({ type: 'dash', w: 1, index: i });
    } else {
      atoms.push({ type: 'note', ch: c, octave, w: 1, index: i, ...(approach ? { approachSlide: approach } : {}) });
      octave = 0;
      pending = false;
      approach = null;
    }
    i++;
  }
  if (!ornament || pending || octave) return null;
  const trailingTilde = text[i] === '~';
  if (trailingTilde) i++;
  if (PLAIN.test(text[i] || '') || text[i] === '{') return null;
  atoms._tilde = { leadingTilde, trailingTilde };
  return { atoms, next: i };
}

// An attached hold belongs to the last cluster inside a slide, even when the
// closing ornament mark precedes it. Keep an index map for source navigation.
// Bare parentheses are left alone: they still belong to (phrase)xN repeats.
export function normalizeSlideHolds(source) {
  const chars = source.split('');
  const indices = chars.map((_, index) => index);
  const stack = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '(') stack.push(chars[i - 1] === '~');
    if (chars[i] !== ')') continue;
    const slide = stack.pop();
    if (!slide || !/[SrRgGmMPdDnN-]/.test(chars[i - 1] || '')) continue;
    let end = i + 1;
    while (chars[end] === '-') end++;
    if (end === i + 1) continue;
    const closeIndex = indices[i];
    const holdIndices = indices.slice(i + 1, end);
    chars.splice(i, end - i, ...Array(end - i - 1).fill('-'), ')');
    indices.splice(i, end - i, ...holdIndices, closeIndex);
    i = end - 1;
  }
  return { text: chars.join(''), indices };
}
