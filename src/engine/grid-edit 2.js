// src/engine/grid-edit.js — safe graph-paper edits over the Markdown source.
// A cell edit canonicalizes only its one music line, then reparses the complete
// document before it is accepted. Invalid or multi-matra drafts never replace
// the source text.

import { parseDocument } from './parse.js';
import { serializeGridCells, serializeGridLine } from './serialize.js';
import { performedOffsetAt } from './performed-time.js';
import { getTal, markerAtMatra, wrapMatra } from './tala.js';

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

export function gridLines(doc) {
  const rows = [];
  for (const section of doc?.sections || []) {
    const tal = section.tal && section.tal !== 'free' ? getTal(section.tal) : null;
    for (const line of section.lines || []) {
      const cells = serializeGridCells(line, tal).map((cell) => {
        const cycleMatra = tal
          ? wrapMatra(tal, line.startMatra + performedOffsetAt(line, cell.matraIndex))
          : null;
        return {
          ...cell,
          cycleMatra,
          marker: tal && cycleMatra != null ? markerAtMatra(tal, cycleMatra) : null,
        };
      });
      rows.push({
        sectionLabel: section.label,
        sourceLine: line.sourceLine,
        startMatra: line.startMatra,
        tal,
        cells,
      });
    }
  }
  return rows;
}
