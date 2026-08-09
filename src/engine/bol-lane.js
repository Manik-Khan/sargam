// src/engine/bol-lane.js — one structural bol lane for parsing, capture,
// rendering, and serialization.
//
// The music line owns rhythm. A bol lane mirrors its written hold slots and
// phrase repeats, while bol words attach to note attacks. `diri` belongs to
// one note attack and re-articulates that note twice; `di-ri` binds two
// successive attacks as the two spoken halves of one Diri. `^` is the one
// intentional slot-level mark: a chikari pluck in a written hold/rest gap.

export const BOL_KINDS = new Set(['da', 'ra', 'diri', 'chikari']);

function writtenSlots(event) {
  return Math.max(1, Number(event?.writtenSlots) || 1);
}

export function buildBolPlan(line) {
  const attacks = [];
  const slots = [];
  const attackByRef = new Map();
  const slotByRefPart = new Map();

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
        const slot = {
          kind: attack && partIndex === 0
            ? 'attack'
            : event?.type === 'rest'
              ? 'rest'
              : 'hold',
          attackOrdinal: attack?.ordinal ?? null,
          matraIndex,
          eventIndex,
          partIndex,
        };
        slotByRefPart.set(`${matraIndex}:${eventIndex}:${partIndex}`, slots.length);
        slots.push(slot);
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

  return { attacks, slots, attackByRef, slotByRefPart, repeats };
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
export function parseBolLane(text, line, { diriAttacks = 1 } = {}) {
  const source = String(text ?? '').trim();
  const plan = buildBolPlan(line);
  const assignments = Array(plan.attacks.length).fill(null);
  const coveredBy = Array(plan.attacks.length).fill(null);
  const ranges = Array(plan.attacks.length).fill(null);
  const gapChikaris = Array(plan.slots.length).fill(false);
  const slotRanges = Array(plan.slots.length).fill(null);
  const repeats = [];
  const problems = [];
  const repeatStack = [];
  let visualCursor = 0;
  let lastAttack = -1;
  let i = 0;

  const placeAttack = (kind, from, to, attackSpan = null) => {
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

    const span = attackSpan == null ? Number(diriAttacks) : Number(attackSpan);
    if (kind !== 'diri' || span === 1) return;
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
    const spanningDiri = source.slice(i).match(/^di-ri(?![A-Za-z])/);
    if (spanningDiri) {
      placeAttack('diri', i, i + spanningDiri[0].length, 2);
      i += spanningDiri[0].length;
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
    if (char === '^') {
      const slot = plan.slots[visualCursor];
      if (slot && slot.kind !== 'attack') {
        gapChikaris[visualCursor] = true;
        slotRanges[visualCursor] = { from: i, to: i + 1 };
        visualCursor++;
      } else {
        problems.push('bol “^” needs a written hold or rest gap before the next note');
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
    problems.push(`unrecognized bol mark '${unknown}' — use da, ra, diri, di-ri, chikari, or . for a gap`);
    i += unknown.length;
  }

  while (repeatStack.length) {
    repeatStack.pop();
    problems.push('bol repeat has an opening ( without a closing )xN');
  }
  compareRepeats(plan, repeats, problems);

  return {
    plan,
    assignments,
    coveredBy,
    ranges,
    gapChikaris,
    slotRanges,
    repeats,
    problems,
    consumedAttacks: Math.max(0, lastAttack + 1),
  };
}

/** Read pre-August-8 lanes without shifting every bol after a legacy
 * two-attack Diri. A complete old structural lane is normalized in memory to
 * one fast Diri plus one explicit gap; the next Grid/Text edit serializes the
 * unambiguous modern lane automatically. */
export function parseBolLaneCompatible(text, line) {
  const modern = parseBolLane(text, line, { diriAttacks: 1 });
  if (!/(?:^|\s|\()diri(?:$|\s|\))/.test(String(text ?? ''))) return modern;

  const legacy = parseBolLane(text, line, { diriAttacks: 2 });
  const total = modern.plan.attacks.length;
  const modernComplete = modern.consumedAttacks >= total;
  const legacyComplete = legacy.consumedAttacks >= total;
  const useLegacy = legacy.problems.length === 0 && (
    modern.problems.length > 0 || (!modernComplete && legacyComplete)
  );
  if (!useLegacy) return modern;

  const ranges = [...legacy.ranges];
  for (let ordinal = 0; ordinal < legacy.coveredBy.length; ordinal++) {
    if (legacy.coveredBy[ordinal] !== null && legacy.coveredBy[ordinal] !== undefined) {
      ranges[ordinal] = null;
    }
  }
  return {
    ...legacy,
    coveredBy: Array(total).fill(null),
    ranges,
    legacyDiri: true,
  };
}

export function assignmentsFromBols(line, bols = line?.bols || []) {
  const plan = buildBolPlan(line);
  const assignments = Array(plan.attacks.length).fill(null);
  const coveredBy = Array(plan.attacks.length).fill(null);
  const gapChikaris = Array(plan.slots.length).fill(false);
  for (const bol of bols) {
    if (bol.mark === 'chikari' && bol.gap) {
      const slotIndex = plan.slotByRefPart.get(
        `${bol.ref.matraIndex}:${bol.ref.eventIndex}:${Math.max(0, Number(bol.partIndex) || 0)}`
      );
      if (Number.isInteger(slotIndex) && plan.slots[slotIndex]?.kind !== 'attack') {
        gapChikaris[slotIndex] = true;
      }
      continue;
    }
    const attack = plan.attackByRef.get(`${bol.ref.matraIndex}:${bol.ref.eventIndex}`);
    if (!attack || !BOL_KINDS.has(bol.mark)) continue;
    assignments[attack.ordinal] = bol.mark;
    if (bol.mark === 'diri' && bol.endRef) {
      const end = plan.attackByRef.get(`${bol.endRef.matraIndex}:${bol.endRef.eventIndex}`);
      if (end && end.ordinal === attack.ordinal + 1) coveredBy[end.ordinal] = attack.ordinal;
    }
  }
  return { plan, assignments, coveredBy, gapChikaris };
}

function formatMatraSegments(line, matraIndex, plan, assignments, coveredBy, gapChikaris) {
  const segments = [];
  const events = line.matras[matraIndex]?.events || [];
  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    if (event.grace) continue;
    const count = writtenSlots(event);
    if (event?.type !== 'note') {
      for (let partIndex = 0; partIndex < count; partIndex++) {
        const slotIndex = plan.slotByRefPart.get(`${matraIndex}:${eventIndex}:${partIndex}`);
        segments.push({
          text: gapChikaris[slotIndex] ? '^' : '-',
          wordLength: 1,
          ordinals: [],
          slotIndices: [slotIndex],
        });
      }
      continue;
    }
    const attack = plan.attackByRef.get(`${matraIndex}:${eventIndex}`);
    if (!attack) continue;
    let trailing = '';
    const trailingSlots = [];
    for (let partIndex = 1; partIndex < count; partIndex++) {
      const slotIndex = plan.slotByRefPart.get(`${matraIndex}:${eventIndex}:${partIndex}`);
      trailing += gapChikaris[slotIndex] ? '^' : '-';
      trailingSlots.push(slotIndex);
    }
    const covering = coveredBy[attack.ordinal];
    if (covering !== null && covering !== undefined) {
      if (trailing && segments.length) {
        segments.at(-1).text += trailing;
        segments.at(-1).slotIndices.push(...trailingSlots);
      }
      continue;
    }
    const mark = assignments[attack.ordinal] || '.';
    const spanningDiri = mark === 'diri' && coveredBy[attack.ordinal + 1] === attack.ordinal;
    const ordinals = [attack.ordinal];
    if (spanningDiri) {
      ordinals.push(attack.ordinal + 1);
    }
    segments.push({
      text: (spanningDiri ? 'di-ri' : mark) + trailing,
      wordLength: spanningDiri ? 5 : mark.length,
      ordinals,
      slotIndices: trailingSlots,
    });
  }
  return segments;
}

/**
 * Canonical structural lane. Returns character ranges relative to `text`.
 */
export function formatBolLane(line, assignments, coveredBy = [], gapChikaris = []) {
  const plan = buildBolPlan(line);
  const values = Array.from({ length: plan.attacks.length }, (_, i) => assignments?.[i] || null);
  const covers = Array.from({ length: plan.attacks.length }, (_, i) => coveredBy?.[i] ?? null);
  const gaps = Array.from({ length: plan.slots.length }, (_, i) => Boolean(gapChikaris?.[i]));
  const ranges = Array(plan.attacks.length).fill(null);
  const slotRanges = Array(plan.slots.length).fill(null);
  const repeatFrom = new Map(plan.repeats.map((repeat) => [repeat.fromMatra, repeat]));
  const repeatTo = new Map(plan.repeats.map((repeat) => [repeat.toMatra, repeat]));
  let text = '';
  let wroteMatra = false;

  for (let matraIndex = 0; matraIndex < (line?.matras || []).length; matraIndex++) {
    const segments = formatMatraSegments(line, matraIndex, plan, values, covers, gaps);
    if (!segments.length) continue;
    if (wroteMatra) text += ' ';
    wroteMatra = true;
    if (repeatFrom.has(matraIndex)) text += '(';

    let previous = null;
    for (const segment of segments) {
      if (previous && !/[-^]$/.test(previous.text) && !/^[-^]/.test(segment.text)) text += ' ';
      const wordStart = text.length;
      text += segment.text;
      const wordRange = { from: wordStart, to: wordStart + segment.wordLength };
      for (const ordinal of segment.ordinals) ranges[ordinal] = wordRange;
      for (const slotIndex of segment.slotIndices || []) slotRanges[slotIndex] = wordRange;
      previous = segment;
    }

    const closing = repeatTo.get(matraIndex);
    if (closing) text += `)x${closing.times}`;
  }

  return {
    text,
    ranges,
    slotRanges,
    plan,
    assignments: values,
    coveredBy: covers,
    gapChikaris: gaps,
  };
}
