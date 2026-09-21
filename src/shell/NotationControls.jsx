import React, { useMemo, useState } from 'react';
import { describeNotationSelection, prepareOrnamentEdit } from './notation-authoring.js';

const ORNAMENTS = [['slide', 'Slide', '~(Gm)'], ['krintan', 'Krintan', '[[Gm]]'], ['kan', 'Kan / grace', '{G}m'], ['none', 'None', 'Gm']];
const BOLS = [['', 'No bol'], ['da', 'Da'], ['ra', 'Ra'], ['diri', 'Diri · same note'], ['diri-span', 'Diri · next note'], ['chikari', 'Chikari']];

export default function NotationControls({ text, doc, selection, onEdit, onBol, message }) {
  const [pass, setPass] = useState(1);
  const chosen = useMemo(() => describeNotationSelection(text, selection, doc), [text, selection, doc]);
  const candidates = useMemo(() => Object.fromEntries(ORNAMENTS.map(([kind]) => [kind,
    chosen.ok && chosen.start !== chosen.end ? prepareOrnamentEdit(text, selection, kind) : { ok: false, message: 'Select two or more notes in Text Write.' },
  ])), [text, selection, chosen]);
  const passes = [...new Set([1, ...(chosen.line?._bolPasses || []).map(lane => lane.pass)])];
  const activePass = passes.includes(pass) ? pass : 1;
  const lane = chosen.line?._bolPasses?.find(item => item.pass === activePass);
  const sourceLines = text.split(/\r?\n/);
  const attachedBols = [];
  if (chosen.ok) {
    for (const line of sourceLines.slice(chosen.sourceLine)) {
      if (!/^\s*(?:>|")/.test(line)) break;
      if (/^\s*>(?!>)/.test(line)) attachedBols.push(line);
    }
  }
  const shorthand = chosen.ok ? [sourceLines[chosen.sourceLine - 1], ...attachedBols].join('\n') : '';
  return (
    <section className="notation-controls cmdbar-wrap" aria-label="Selected note controls" tabIndex={0}>
      <div className="notation-selection">
        <strong>Selected notes</strong>
        <code>{chosen.selected || (chosen.attacks?.length ? 'Note at cursor' : 'Select notes in Text Write')}</code>
        {chosen.ok && chosen.start !== chosen.end && <span>Beat boundaries preserved</span>}
      </div>
      <div className="notation-ornaments" role="group" aria-label="Ornament for selected notes">
        {ORNAMENTS.map(([kind, label, syntax]) => (
          <button key={kind} type="button" className="cmd-btn" aria-pressed={Boolean(chosen.selected && chosen.kind === kind)}
            disabled={!candidates[kind].ok}
            title={candidates[kind].ok ? `${label}: ${syntax}` : candidates[kind].message}
            onMouseDown={event => event.preventDefault()}
            onClick={() => onEdit(candidates[kind])}>
            {label} <code>{syntax}</code>
          </button>
        ))}
      </div>
      {chosen.selected && !candidates.kan.ok && <div className="notation-help">Kan: {candidates.kan.message}</div>}
      {chosen.attacks?.length > 0 && <fieldset className="notation-bol-controls">
        <legend>Bols on selected notes</legend>
        {passes.length > 1 && <label>Pass<select aria-label="Bol pass" value={activePass} onChange={event => setPass(Number(event.target.value))}>
          {passes.map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>}
        {chosen.attacks.map(attack => {
          const covering = lane?.coveredBy[attack.ordinal];
          const mark = lane?.assignments[attack.ordinal] || '';
          const value = covering != null ? 'covered' : mark === 'diri' && lane?.coveredBy[attack.ordinal + 1] === attack.ordinal ? 'diri-span' : mark;
          const label = `${attack.octave > 0 ? "'".repeat(attack.octave) : '.'.repeat(-attack.octave)}${attack.note}`;
          return <label key={attack.ordinal}>{label} <span className="notation-note-number">note {attack.ordinal + 1}</span>
            <select aria-label={`Bol on ${label}, note ${attack.ordinal + 1}`} value={value}
              onChange={event => onBol({ sourceLine: chosen.sourceLine, ordinal: attack.ordinal, pass: activePass,
                kind: event.target.value === 'diri-span' ? 'diri' : event.target.value || null,
                diriMode: event.target.value === 'diri-span' ? 'span' : 'single' })}>
              {value === 'covered' && <option value="covered" disabled>Part of preceding di-ri</option>}
              {BOLS.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
          </label>;
        })}
      </fieldset>}
      {shorthand && <div className="notation-shorthand"><span>Written shorthand · editable in Text Write</span><pre>{shorthand}</pre></div>}
      <div className="notation-help" role="status">{message || 'Type shorthand directly, or select notes and use these controls. Undo works for both.'}</div>
    </section>
  );
}
