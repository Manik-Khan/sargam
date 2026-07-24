// src/engine/bol-lane.js — one structural bol lane for parsing, capture,
// rendering, and serialization.
//
// The music line owns rhythm. A bol lane mirrors its written hold slots and
// phrase repeats, while bol words attach only to note attacks. Diri is one
// authored word spanning two successive attacks.

export const BOL_KINDS = new Set(['da', 'ra', 'diri', 'chikari']);

function writtenSlots(event) {
  return Math.max(1, Number(event?.writtenSlots) || 1);
}

export function buildBolPlan(line) {
  const attacks = [];
  const slots = [];
  const attackByRef = new Map();

  for (let matraIndex = 0; matraIndex < (line?.matras || []).length; matraIndex++) {
    const events = line.matras[matraIndex]?.events || [];
    for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
      const event = events[eventIndex];
      if (event?.grace) continue;
      const count = writtenSlots(event);
      let attack = null;
      if (event?.type === 'note') {
        attack = {
          ordinal: attacks.length,
          matraIndex,
          eventIndex,
          writtenSlots: count,
          slotIndex: slots.length,
        };
        attacks.push(attack);
        attackByRef.set(`${matraIndex}:${eventIndex}`, attack);
      }
      for (let partIndex = 0; partIndex < count; partIndex++) {
        slots.push({
          kind: attack && partIndex === 0
            ? 'attack'
            : event?.type === 'rest'
              ? 'rest'
              : 'hold',
          attackOrdinal: attack?.ordinal ?? null,
          matraIndex,
          eventIndex,
          partIndex,
        });
      }
    }
  }

  const repeats = [];
  for (const repeat of line?.phraseRepeats || []) {
    const inside = attacks.filter(
      (attack) => attack.matraIndex >= repeat.fromMatra && attack.matraIndex <= repeat.toMatra
    );
    if (!inside.length) continue;
    repeats.push({
      fromAttack: inside[0].ordinal,
      toAttack: inside.at(-1).ordinal,
      times: Number(repeat.times) || 2,
      fromMatra: repeat.fromMatra,
      toMatra: repeat.toMatra,
    });
  }

  return { attacks, slots, attackByRef, repeats };
}

function nextAttackSlot(plan, from) {
  for (let i = Math.max(0, from); i < plan.slots.length; i++) {
    if (plan.slots[i].kind === 'attack') return i;
  }
  return -1;
}

function repeatKey(repeat) {
  return `${repeat.fromAttack}:${repeat.toAttack}:x${repeat.times}`;
}

function compareRepeats(plan, actual, problems) {
  const expected = plan.repeats.map(repeatKey);
  const received = actual.map(repeatKey);
  if (expected.length === received.length && expected.every((key, i) => key === received[i])) return;
  if (!expected.length && !received.length) return;
  problems.push(
    expected.length
      ? 'bol repeat structure must mirror the notation repeat — use the same (…)xN range'
      : 'bol lane contains a repeat that is not present in the notation line'
  );
}

/**
 * Parse a bol expression against a parsed music line.
 *
 * Whitespace is cosmetic. Explicit hyphens must land on written hold slots.
 * Older flat lanes remain readable because omitted hold markers are skipped
 * automatically; structural capture always writes the complete form.
 */
export function parseBolLane(text, line, { diriAttacks = 2 } = {}) {
  const source = String(text ?? '').trim();
  const plan = buildBolPlan(line);
  const assignments = Array(plan.attacks.length).fill(null);
  const coveredBy = Array(plan.attacks.length).fill(null);
  const ranges = Array(plan.attacks.length).fill(null);
  const repeats = [];
  const problems = [];
  const repeatStack = [];
  let visualCursor = 0;
  let lastAttack = -1;
  let i = 0;

  const placeAttack = (kind, from, to) => {
    const slotIndex = nextAttackSlot(plan, visualCursor);
    if (slotIndex < 0) {
      problems.push('more bol marks than note attacks');
      return;
    }
    const ordinal = plan.slots[slotIndex].attackOrdinal;
    assignments[ordinal] = kind === '.' ? null : kind;
    ranges[ordinal] = { from, to };
    lastAttack = ordinal;
    visualCursor = slotIndex + 1;

    if (kind !== 'diri' || Number(diriAttacks) === 1) return;
    const secondSlot = nextAttackSlot(plan, visualCursor);
    if (secondSlot < 0) {
      problems.push('diri needs two successive note attacks');
      assignments[ordinal] = null;
      return;
    }
    const secondOrdinal = plan.slots[secondSlot].attackOrdinal;
    coveredBy[secondOrdinal] = ordinal;
    ranges[secondOrdinal] = { from, to };
    lastAttack = secondOrdinal;
    visualCursor = secondSlot + 1;
  };

  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char) || char === '|') {
      i++;
      continue;
    }
    if (char === '(') {
      const slotIndex = nextAttackSlot(plan, visualCursor);
      repeatStack.push({
        fromAttack: slotIndex >= 0 ? plan.slots[slotIndex].attackOrdinal : plan.attacks.length,
        col: i + 1,
      });
      i++;
      continue;
    }
    if (char === ')') {
      const suffix = source.slice(i).match(/^\)x(\d+)/);
      if (!suffix) {
        problems.push('bol repeat closing ) must be followed by xN');
        i++;
        continue;
      }
      const open = repeatStack.pop();
      if (!open) {
        problems.push('bol repeat has )xN without an opening (');
      } else {
        repeats.push({
          fromAttack: open.fromAttack,
          toAttack: lastAttack,
          times: Number(suffix[1]),
        });
      }
      i += suffix[0].length;
      continue;
    }
    if (char === '-') {
      if (plan.slots[visualCursor]?.kind === 'hold') {
        visualCursor++;
      } else {
        problems.push('bol “-” does not line up with a written hold in the notation');
      }
      i++;
      continue;
    }
    if (char === '.') {
      placeAttack('.', i, i + 1);
      i++;
      continue;
    }

    const word = source.slice(i).match(/^(chikari|diri|da|ra)(?![A-Za-z])/);
    if (word) {
      placeAttack(word[1], i, i + word[1].length);
      i += word[1].length;
      continue;
    }

    const unknown = source.slice(i).match(/^[^\s()|.-]+/)?.[0] || char;
    problems.push(`unrecognized bol mark '${unknown}' — use da, ra, diri, chikari, or . for a gap`);
    i += unknown.length;
  }

  while (repeatStack.length) {
    repeatStack.pop();
    problems.push('bol repeat has an opening ( without a closing )xN');
  }
  compareRepeats(plan, repeats, problems);

  return { plan, assignments, coveredBy, ranges, repeats, problems };
}

export function assignmentsFromBols(line, bols = line?.bols || []) {
  const plan = buildBolPlan(line);
  const assignments = Array(plan.attacks.length).fill(null);
  const coveredBy = Array(plan.attacks.length).fill(null);
  for (const bol of bols) {
    const attack = plan.attackByRef.get(`${bol.ref.matraIndex}:${bol.ref.eventIndex}`);
    if (!attack || !BOL_KINDS.has(bol.mark)) continue;
    assignments[attack.ordinal] = bol.mark;
    if (bol.mark === 'diri' && bol.rate !== 2 && attack.ordinal + 1 < assignments.length) {
      coveredBy[attack.ordinal + 1] = attack.ordinal;
    }
  }
  return { plan, assignments, coveredBy };
}

function formatMatraSegments(line, matraIndex, plan, assignments, coveredBy) {
  const segments = [];
  const events = line.matras[matraIndex]?.events || [];
  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    if (event?.type !== 'note' || event.grace) continue;
    const attack = plan.attackByRef.get(`${matraIndex}:${eventIndex}`);
    if (!attack) continue;
    const covering = coveredBy[attack.ordinal];
    if (covering !== null && covering !== undefined) {
      const hold = '-'.repeat(Math.max(0, attack.writtenSlots - 1));
      if (hold && segments.length) segments.at(-1).text += hold;
      continue;
    }
    const mark = assignments[attack.ordinal] || '.';
    const ordinals = [attack.ordinal];
    if (
      mark === 'diri' &&
      coveredBy[attack.ordinal + 1] === attack.ordinal
    ) {
      ordinals.push(attack.ordinal + 1);
    }
    segments.push({
      text: mark + '-'.repeat(Math.max(0, attack.writtenSlots - 1)),
      wordLength: mark.length,
      ordinals,
    });
  }
  return segments;
}

/**
 * Canonical structural lane. Returns character ranges relative to `text`.
 */
export function formatBolLane(line, assignments, coveredBy = []) {
  const plan = buildBolPlan(line);
  const values = Array.from({ length: plan.attacks.length }, (_, i) => assignments?.[i] || null);
  const covers = Array.from({ length: plan.attacks.length }, (_, i) => coveredBy?.[i] ?? null);
  const ranges = Array(plan.attacks.length).fill(null);
  const repeatFrom = new Map(plan.repeats.map((repeat) => [repeat.fromMatra, repeat]));
  const repeatTo = new Map(plan.repeats.map((repeat) => [repeat.toMatra, repeat]));
  let text = '';
  let wroteMatra = false;

  for (let matraIndex = 0; matraIndex < (line?.matras || []).length; matraIndex++) {
    const segments = formatMatraSegments(line, matraIndex, plan, values, covers);
    if (!segments.length) continue;
    if (wroteMatra) text += ' ';
    wroteMatra = true;
    if (repeatFrom.has(matraIndex)) text += '(';

    let previous = null;
    for (const segment of segments) {
      if (previous && !previous.text.endsWith('-')) text += ' ';
      const wordStart = text.length;
      text += segment.text;
      const wordRange = { from: wordStart, to: wordStart + segment.wordLength };
      for (const ordinal of segment.ordinals) ranges[ordinal] = wordRange;
      previous = segment;
    }

    const closing = repeatTo.get(matraIndex);
    if (closing) text += `)x${closing.times}`;
  }

  return { text, ranges, plan, assignments: values, coveredBy: covers };
}
