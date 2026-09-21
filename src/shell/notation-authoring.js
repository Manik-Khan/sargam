// Named writing controls are reversible edits to ordinary Markdown. The parser
// validates each candidate; controls never maintain a second notation model.
import { parseDocument } from '../engine/parse.js';
import { applySlide, applyKan, applyKrintan } from '../engine/commands.js';
import { buildBolPlan, formatBolLane } from '../engine/bol-lane.js';
import { writeBolLane } from '../engine/bol-capture.js';
import { sourceAttacks } from './notation-navigation.js';

const musicLine = (doc, number) => doc.sections.flatMap(section => section.lines || []).find(line => line.sourceLine === number);
const duration = line => line.matras.map(cell => cell.duration ? cell.duration.num / cell.duration.den : 1);
const allNotes = line => line.matras.flatMap((cell, matraIndex) => cell.events.flatMap((event, eventIndex) =>
  event.type === 'note' ? [{ ...event, matraIndex, eventIndex }] : []));
const failure = message => ({ ok: false, message });

export function ornamentContents(source) {
  if (/^~\([^()]*\)$/.test(source)) return { kind: 'slide', plain: source.slice(2, -1) };
  if (/^\[\[[^\[\]]*\]\]$/.test(source)) return { kind: 'krintan', plain: source.slice(2, -2) };
  const kan = source.match(/^\{([^{}]+)\}([^\s{}]+)$/);
  if (kan) return { kind: 'kan', plain: kan[1] + kan[2] };
  // Keep legacy leading-tilde input readable while writing explicit scope.
  if (/^~[.']*[SrRgGmMPdDnN][SrRgGmMPdDnN.'-]*$/.test(source)) return { kind: 'slide', plain: source.slice(1) };
  return { kind: 'none', plain: source };
}

export function describeNotationSelection(text, selection, doc = parseDocument(text).doc) {
  let start = Math.max(0, Math.min(text.length, Number(selection?.start) || 0));
  let end = Math.max(start, Math.min(text.length, Number(selection?.end) || start));
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  const sourceLine = text.slice(0, start).split('\n').length;
  const line = musicLine(doc, sourceLine);
  if (!line || text.slice(start, end).includes('\n')) return { ...failure('Select notes on one music line in Text Write.'), attacks: [] };
  const available = sourceAttacks(text, line);
  const caretAttack = available.find(attack => start >= attack.from && start < attack.to)
    || available.find(attack => start === attack.to);
  const attacks = start === end ? (caretAttack ? [caretAttack] : [])
    : available.filter(attack => attack.from >= start && attack.to <= end);
  const selected = text.slice(start, end);
  return { ok: true, start, end, sourceLine, line, selected, attacks, ...ornamentContents(selected) };
}

function remapBolLanes(text, before, after) {
  const oldNotes = allNotes(before);
  const nextNotes = allNotes(after);
  const oldPlan = buildBolPlan(before);
  const nextPlan = buildBolPlan(after);
  const mapping = oldPlan.attacks.map(attack => {
    const index = oldNotes.findIndex(note => note.matraIndex === attack.matraIndex && note.eventIndex === attack.eventIndex);
    const next = nextNotes[index];
    return nextPlan.attackByRef.get(`${next.matraIndex}:${next.eventIndex}`)?.ordinal ?? null;
  });
  let result = text;
  let removed = 0;
  const changed = oldPlan.attacks.length !== nextPlan.attacks.length || mapping.some((value, i) => value !== i);
  if (!changed) return { ok: true, text, removed };
  for (const lane of before._bolPasses || []) {
    // Match gap slots by their owning written event, not the global slot
    // number: removing a grace's timed attack shifts every subsequent slot.
    const slotKey = (slot, model, notes) => {
      const event = model.matras[slot.matraIndex].events[slot.eventIndex];
      if (event.type === 'note') {
        return `note:${notes.findIndex(note => note.matraIndex === slot.matraIndex && note.eventIndex === slot.eventIndex)}:${slot.partIndex}`;
      }
      const ordinal = model.matras[slot.matraIndex].events.slice(0, slot.eventIndex).filter(item => item.type !== 'note').length;
      return `${slot.matraIndex}:${event.type}:${ordinal}:${slot.partIndex}`;
    };
    const gapChikaris = Array(nextPlan.slots.length).fill(false);
    const newSlots = new Map(nextPlan.slots.map((slot, index) => [slotKey(slot, after, nextNotes), index]));
    for (let i = 0; i < lane.gapChikaris.length; i++) {
      if (!lane.gapChikaris[i]) continue;
      const next = newSlots.get(slotKey(oldPlan.slots[i], before, oldNotes));
      if (next === undefined || nextPlan.slots[next].kind === 'attack') {
        return failure('This change removes a gap that has chikari. Edit the ornament and its > lane together in Text Write.');
      }
      gapChikaris[next] = true;
    }
    const assignments = Array(nextPlan.attacks.length).fill(null);
    const coveredBy = Array(nextPlan.attacks.length).fill(null);
    lane.assignments.forEach((mark, i) => {
      if (!mark) return;
      const target = mapping[i];
      const spans = lane.coveredBy[i + 1] === i;
      if (target === null || (spans && mapping[i + 1] !== target + 1)) { removed++; return; }
      assignments[target] = mark;
      if (spans) coveredBy[target + 1] = target;
    });
    const body = formatBolLane(after, assignments, coveredBy, gapChikaris).text;
    const written = writeBolLane(result, before.sourceLine, body, { pass: lane.pass });
    if (!written.ok) return written;
    result = written.text;
  }
  return { ok: true, text: result, removed };
}

export function prepareOrnamentEdit(text, selection, kind) {
  const parsed = parseDocument(text);
  const chosen = describeNotationSelection(text, selection, parsed.doc);
  if (!chosen.ok) return chosen;
  const { start, end, plain, line, sourceLine } = chosen;
  if (start === end) return failure('Select the notes first, or type the shorthand directly.');
  if (!['slide', 'krintan', 'kan', 'none'].includes(kind)) return failure('Choose an ornament from the controls.');
  const noteCount = [...plain].filter(char => /[SrRgGmMPdDnN]/.test(char)).length;
  if (kind !== 'none' && noteCount < 2) return failure('Select at least two notes for this ornament.');
  if (!/^[SrRgGmMPdDnN.'\s|/\[\]-]+$/.test(plain)) return failure('Select a complete ornament to replace it, or edit its shorthand directly.');
  if (kind === 'kan' && !/^[SrRgGmMPdDnN.']+$/.test(plain)) return failure('For Kan, select connected notes within one beat. The final note owns the beat.');
  if (/[.']/.test(text[start - 1] || '') && /^[SrRgGmMPdDnN]/.test(plain)) return failure('Include the octave mark before the first selected note.');
  const replacement = kind === 'none' ? plain : ({ slide: applySlide, krintan: applyKrintan, kan: applyKan })[kind](plain);
  let nextText = text.slice(0, start) + replacement + text.slice(end);
  const candidate = parseDocument(nextText);
  const nextLine = musicLine(candidate.doc, sourceLine);
  const musicProblems = candidate.problems.filter(problem => problem.line === sourceLine);
  if (!nextLine || musicProblems.length) return failure(musicProblems[0]?.msg || 'This selection does not form a complete musical passage.');
  const oldNotes = allNotes(line);
  const newNotes = allNotes(nextLine);
  if (JSON.stringify(oldNotes.map(note => [note.ch, note.octave])) !== JSON.stringify(newNotes.map(note => [note.ch, note.octave]))) {
    return failure('This selection would change the notes. Include the complete note or ornament.');
  }
  if (JSON.stringify(duration(line)) !== JSON.stringify(duration(nextLine))) {
    return failure('This selection would change beat boundaries. Select complete beats, or write the intended rhythm directly.');
  }
  const remapped = remapBolLanes(nextText, line, nextLine);
  if (!remapped.ok) return remapped;
  nextText = remapped.text;
  const beforeProblems = new Set(parsed.problems.map(problem => `${problem.line}:${problem.msg}`));
  const newProblem = parseDocument(nextText).problems.find(problem => !beforeProblems.has(`${problem.line}:${problem.msg}`));
  if (newProblem) return failure(newProblem.msg);
  return { ok: true, text: nextText, selectionStart: start, selectionEnd: start + replacement.length,
    message: `${kind === 'none' ? 'Ornament removed' : {slide:'Slide',krintan:'Krintan',kan:'Kan'}[kind] + ' applied'}. Beat boundaries preserved.${remapped.removed ? ' Bols on notes that became graces were removed; destination bols kept.' : ''}` };
}

/** A minimal document change keeps CodeMirror undo and source selection intact. */
export function sourceEditChange(previous, next) {
  let from = 0;
  while (from < previous.length && from < next.length && previous[from] === next[from]) from++;
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (oldEnd > from && newEnd > from && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
  return { from, to: oldEnd, insert: next.slice(from, newEnd) };
}
