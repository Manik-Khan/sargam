// src/engine/grid-edit.js — safe graph-paper edits over the Markdown source.
// A cell edit canonicalizes only its one music line, then reparses the complete
// document before it is accepted. Invalid or multi-matra drafts never replace
// the source text.

import { parseDocument } from './parse.js';
import { serializeGridCells, serializeGridLine, serializeMusicLine } from './serialize.js';
import { performedOffsetAt } from './performed-time.js';
import { getTal, markerAtMatra, wrapMatra } from './tala.js';
import { buildBolPlan } from './bol-lane.js';

function musicLineAt(doc, sourceLine) {
  for (const section of doc?.sections || []) {
    const line = (section.lines || []).find((candidate) =>
      Number(candidate.sourceLine) === Number(sourceLine)
    );
    if (line) {
      return {
        line,
        tal: section.tal && section.tal !== 'free' ? getTal(section.tal) : null,
      };
    }
  }
  return null;
}

function replaceSourceLine(text, sourceLine, replacement) {
  const lines = String(text ?? '').split('\n');
  const index = Number(sourceLine) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= lines.length) return null;
  lines[index] = replacement;
  return lines.join('\n');
}

/** Spaces inside a graph cell mean subdivisions, so simple input is wrapped. */
export function normalizeGridCellToken(value) {
  const token = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!token) return '';
  const simpleSlots = /^[SrRgGmMPdDnN.'~-]+(?: [SrRgGmMPdDnN.'~-]+)+$/;
  return simpleSlots.test(token) ? `[${token}]` : token;
}

function validateGridResult(nextText, sourceLine, expectedMatras) {
  const parsed = parseDocument(nextText);
  const problems = parsed.problems.filter((problem) => Number(problem.line) === Number(sourceLine));
  if (problems.length) {
    return { ok: false, message: problems[0].msg, problems };
  }
  const found = musicLineAt(parsed.doc, sourceLine);
  if (!found) return { ok: false, message: 'This source row is no longer a notation line.' };
  if (found.line.matras.length !== expectedMatras) {
    return {
      ok: false,
      message: 'One grid box must equal one matra. Put subdivisions inside [brackets].',
    };
  }
  return { ok: true, text: nextText, doc: parsed.doc, line: found.line };
}

export function replaceGridCellToken(text, sourceLine, matraIndex, value) {
  const parsed = parseDocument(String(text ?? ''));
  const found = musicLineAt(parsed.doc, sourceLine);
  if (!found) return { ok: false, message: 'Choose a rendered notation line first.' };
  const index = Number(matraIndex);
  if (!Number.isInteger(index) || index < 0 || index >= found.line.matras.length) {
    return { ok: false, message: 'That matra is no longer present in this line.' };
  }
  const token = normalizeGridCellToken(value);
  if (!token) return { ok: false, message: 'A matra cannot be blank. Use - for a hold or . for a rest.' };

  const cells = serializeGridCells(found.line, found.tal);
  cells[index] = { ...cells[index], text: token };
  const nextLine = serializeGridLine(found.line, found.tal, cells);
  const nextText = replaceSourceLine(text, sourceLine, nextLine);
  if (nextText === null) return { ok: false, message: 'The source line could not be updated.' };
  return validateGridResult(nextText, sourceLine, found.line.matras.length);
}

export function appendGridCellToken(text, sourceLine, value) {
  const parsed = parseDocument(String(text ?? ''));
  const found = musicLineAt(parsed.doc, sourceLine);
  if (!found) return { ok: false, message: 'Choose a rendered notation line first.' };
  const token = normalizeGridCellToken(value);
  if (!token) return { ok: false, message: 'Type the new matra before adding it.' };

  const cells = serializeGridCells(found.line, found.tal);
  cells.push({ matraIndex: cells.length, text: token, joinNext: ' ' });
  const nextLine = serializeGridLine(found.line, found.tal, cells);
  const nextText = replaceSourceLine(text, sourceLine, nextLine);
  if (nextText === null) return { ok: false, message: 'The source line could not be updated.' };
  return validateGridResult(nextText, sourceLine, found.line.matras.length + 1);
}

/** Add, move, or remove the first-ending boundary without exposing `|1`. */
export function setGridFirstEnding(text, sourceLine, matraIndex) {
  const parsed = parseDocument(String(text ?? ''));
  const found = musicLineAt(parsed.doc, sourceLine);
  if (!found) return { ok: false, message: 'Choose a rendered notation line first.' };
  if (!found.line.lineRepeat) {
    return { ok: false, message: 'A first ending can only be added to a repeated line.' };
  }

  const index = matraIndex == null ? null : Number(matraIndex);
  if (index !== null && (
    !Number.isInteger(index) ||
    index <= 0 ||
    index >= found.line.matras.length
  )) {
    return {
      ok: false,
      message: 'Choose the first changed matra after at least one shared matra.',
    };
  }

  const cells = serializeGridCells(found.line, found.tal);
  const changedLine = { ...found.line, firstEndingFrom: index };
  const nextLine = serializeGridLine(changedLine, found.tal, cells);
  const nextText = replaceSourceLine(text, sourceLine, nextLine);
  if (nextText === null) return { ok: false, message: 'The source line could not be updated.' };
  return validateGridResult(nextText, sourceLine, found.line.matras.length);
}

/** Toggle the independent ||: … :|| cells for one notation line. */
export function setGridLineRepeat(text, sourceLine, enabled) {
  const parsed = parseDocument(String(text ?? ''));
  const found = musicLineAt(parsed.doc, sourceLine);
  if (!found) return { ok: false, message: 'Choose a rendered notation line first.' };

  const lineRepeat = Boolean(enabled);
  const cells = serializeGridCells(found.line, found.tal);
  const changedLine = {
    ...found.line,
    lineRepeat,
    firstEndingFrom: lineRepeat ? found.line.firstEndingFrom : null,
  };
  const nextLine = serializeGridLine(changedLine, found.tal, cells);
  const nextText = replaceSourceLine(text, sourceLine, nextLine);
  if (nextText === null) return { ok: false, message: 'The source line could not be updated.' };
  return validateGridResult(nextText, sourceLine, found.line.matras.length);
}

/** Add, replace, or remove one explicit (phrase)xN range. */
export function setGridPhraseRepeat(text, sourceLine, fromMatra, toMatra, times) {
  const parsed = parseDocument(String(text ?? ''));
  const found = musicLineAt(parsed.doc, sourceLine);
  if (!found) return { ok: false, message: 'Choose a rendered notation line first.' };

  const from = Number(fromMatra);
  const to = Number(toMatra);
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < from ||
    to >= found.line.matras.length
  ) {
    return { ok: false, message: 'Choose a phrase range inside one notation line.' };
  }

  const repeats = [...(found.line.phraseRepeats || [])];
  const exactIndex = repeats.findIndex((repeat) =>
    repeat.fromMatra === from && repeat.toMatra === to
  );
  let nextRepeats;
  if (times == null) {
    if (exactIndex < 0) return { ok: false, message: 'That phrase repeat is no longer present.' };
    nextRepeats = repeats.filter((_, index) => index !== exactIndex);
  } else {
    const repeatTimes = Number(times);
    if (!Number.isInteger(repeatTimes) || repeatTimes < 2 || repeatTimes > 9) {
      return { ok: false, message: 'A phrase can repeat from 2 to 9 times.' };
    }
    const overlaps = repeats.some((repeat, index) =>
      index !== exactIndex && from <= repeat.toMatra && to >= repeat.fromMatra
    );
    if (overlaps) {
      return { ok: false, message: 'Phrase repeats cannot overlap. Remove the existing repeat first.' };
    }
    const nextRepeat = { fromMatra: from, toMatra: to, times: repeatTimes };
    nextRepeats = exactIndex < 0
      ? [...repeats, nextRepeat]
      : repeats.map((repeat, index) => index === exactIndex ? nextRepeat : repeat);
    nextRepeats.sort((a, b) => a.fromMatra - b.fromMatra || a.toMatra - b.toMatra);
  }

  const changedLine = { ...found.line, phraseRepeats: nextRepeats };
  const nextLine = serializeMusicLine(changedLine, found.tal);
  const nextText = replaceSourceLine(text, sourceLine, nextLine);
  if (nextText === null) return { ok: false, message: 'The source line could not be updated.' };
  return validateGridResult(nextText, sourceLine, found.line.matras.length);
}

export function gridLines(doc) {
  const rows = [];
  for (const section of doc?.sections || []) {
    const tal = section.tal && section.tal !== 'free' ? getTal(section.tal) : null;
    const sectionLines = section.lines || [];
    for (let lineIndex = 0; lineIndex < sectionLines.length; lineIndex++) {
      const line = sectionLines[lineIndex];
      const previous = sectionLines[lineIndex - 1];
      const bolPlan = buildBolPlan(line);
      const sourcePasses = line._bolPasses?.length
        ? line._bolPasses
        : (line.bols?.length ? [{ pass: 1, bols: line.bols }] : []);
      const bolPasses = sourcePasses.map((lane) => ({
        pass: Math.max(1, Number(lane.pass) || 1),
        marks: (lane.bols || []).flatMap((bol) => {
          if (bol.mark === 'chikari' && bol.gap) {
            const slotIndex = bolPlan.slotByRefPart.get(
              `${bol.ref.matraIndex}:${bol.ref.eventIndex}:${Math.max(0, Number(bol.partIndex) || 0)}`
            );
            if (!Number.isInteger(slotIndex)) return [];
            return [{ slotIndex, gap: true, mark: 'chikari', rate: 1 }];
          }
          const start = bolPlan.attackByRef.get(`${bol.ref.matraIndex}:${bol.ref.eventIndex}`);
          if (!start) return [];
          const end = bol.endRef
            ? bolPlan.attackByRef.get(`${bol.endRef.matraIndex}:${bol.endRef.eventIndex}`)
            : null;
          return [{
            ordinal: start.ordinal,
            toOrdinal: end?.ordinal ?? start.ordinal,
            mark: bol.mark,
            rate: Math.max(1, Number(bol.rate) || 1),
          }];
        }),
      }));
      const cells = serializeGridCells(line, tal).map((cell) => {
        const cycleMatra = tal
          ? wrapMatra(tal, line.startMatra + performedOffsetAt(line, cell.matraIndex))
          : null;
        return {
          ...cell,
          cycleMatra,
          marker: tal && cycleMatra != null ? markerAtMatra(tal, cycleMatra) : null,
          attacks: bolPlan.attacks
            .filter((attack) => attack.matraIndex === cell.matraIndex)
            .map((attack) => ({
              ordinal: attack.ordinal,
              eventIndex: attack.eventIndex,
              writtenSlots: attack.writtenSlots,
            })),
          bolSlots: bolPlan.slots
            .map((slot, slotIndex) => ({ ...slot, slotIndex }))
            .filter((slot) => slot.matraIndex === cell.matraIndex),
        };
      });
      rows.push({
        sectionLabel: section.label,
        sourceLine: line.sourceLine,
        startMatra: line.startMatra,
        tal,
        cells,
        bolPasses,
        phraseRepeats: (line.phraseRepeats || []).map((repeat) => ({ ...repeat })),
        lineRepeat: Boolean(line.lineRepeat),
        firstEndingFrom: Number.isInteger(line.firstEndingFrom) ? line.firstEndingFrom : null,
        alternateEndingRole: Number.isInteger(line.firstEndingFrom)
          ? 'first'
          : (previous?.lineRepeat && Number.isInteger(previous?.firstEndingFrom) ? 'second' : null),
        alternateEndingSourceLine: previous?.lineRepeat && Number.isInteger(previous?.firstEndingFrom)
          ? previous.sourceLine
          : null,
        hasFollowingNotation: Boolean(sectionLines[lineIndex + 1]),
      });
    }
  }
  return rows;
}
