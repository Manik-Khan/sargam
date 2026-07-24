// src/engine/performed-time.js — the shared written→performed matra map.
//
// A source line stores each repeated phrase once. Tala position, continuation,
// folding, and playback must nevertheless count every performed pass.

export function phraseRepeatLength(repeat) {
  if (!repeat) return 0;
  return Math.max(0, Number(repeat.toMatra) - Number(repeat.fromMatra) + 1);
}

/** Extra performed matras completed before written matra `index`. */
export function repeatExtraBefore(line, index) {
  const target = Math.max(0, Number(index) || 0);
  let extra = 0;
  for (const repeat of line?.phraseRepeats || []) {
    if (Number(repeat.toMatra) >= target) continue;
    extra += phraseRepeatLength(repeat) * Math.max(0, (Number(repeat.times) || 1) - 1);
  }
  return extra;
}

/** Performed offset of a written matra from the beginning of its source line. */
export function performedOffsetAt(line, writtenMatraIndex) {
  const written = Math.max(0, Number(writtenMatraIndex) || 0);
  return written + repeatExtraBefore(line, written);
}

/** Written order expanded through phrase repeats, before any whole-line pass. */
export function performedWrittenOrder(line) {
  const order = [];
  for (let i = 0; i < (line?.matras?.length || 0); ) {
    const repeat = (line.phraseRepeats || []).find((item) => item.fromMatra === i);
    if (!repeat) {
      order.push(i);
      i++;
      continue;
    }
    for (let pass = 0; pass < Math.max(1, Number(repeat.times) || 1); pass++) {
      for (let k = repeat.fromMatra; k <= repeat.toMatra; k++) order.push(k);
    }
    i = repeat.toMatra + 1;
  }
  return order;
}

/** Total performed duration in matras, including phrase and line repeats. */
export function performedMatraCount(line) {
  const order = performedWrittenOrder(line);
  if (!line?.lineRepeat) return order.length;
  const firstEnding = Number.isInteger(line.firstEndingFrom)
    ? order.findIndex((matraIndex) => matraIndex === line.firstEndingFrom)
    : -1;
  return order.length + (firstEnding >= 0 ? firstEnding : order.length);
}
