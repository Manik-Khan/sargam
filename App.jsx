// src/shell/App.jsx — Wave 3 shell: text → parseDocument → renderDocument,
// live on every keystroke (spec §4: updates per keystroke, never goes blank).
// The problems strip below is the single voice for parse feedback.
// Parse is NOT debounced — measured intent per plan: debounce only if typing
// feels laggy on M's machine.

import React, { useMemo, useState } from 'react';
import { parseDocument } from '../engine/parse.js';
import EditorPane from './EditorPane.jsx';
import PreviewPane from './PreviewPane.jsx';
import './sargam.css';

const STARTER = `title: Kahe Ko (khyal) — R. 1732
raga: kirwani
tal: tintal
sa: C#
tempo: 72

Sthayi
@7 ||: .d P | mg R m m | P d N~ 'S | .d - P m | R - :||
" ka- he | ko ma- na na- | hi | ma- ne | re

Vistars
@7 S R | g - - - | - R g m | P -
@7 R m | g - - - | m R g m | P - d - | P -

Tihai
(SR gm P)x3

Krintan (cross-beat)
[[dP/mg/RS]] -

tal: free

Alap
~PS.NRS.N.D N
`;

export default function App() {
  const [text, setText] = useState(STARTER);
  const { doc, problems } = useMemo(() => parseDocument(text), [text]);

  return (
    <div className="app-root">
      <div className="app-header">Sargam</div>
      <div className="app-panes">
        <EditorPane text={text} onChange={setText} />
        <PreviewPane doc={doc} />
      </div>
      <div className={'app-problems' + (problems.length ? ' has-problems' : '')}>
        {problems.length === 0 ? (
          <div className="app-problems-ok">No problems.</div>
        ) : (
          problems.map((p, i) => (
            <div className="app-problem" key={i}>
              line {p.line}
              {p.col != null ? `, col ${p.col}` : ''}: {p.msg}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
