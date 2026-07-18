// smokes/parse.smoke.js — parser + serializer contract (spec §3, plan Wave 2).
// Written FIRST, watched failing, then parse.js/serialize.js implemented to green.

import assert from 'node:assert/strict';
import { parseDocument } from '../src/engine/parse.js';
import { serializeDocument } from '../src/engine/serialize.js';
import { frac } from '../src/engine/model.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a fragment under tintal; return the first music line. */
function line(src) {
  const { doc, problems } = parseDocument(`tal: tintal\n\n${src}\n`);
  return { line: doc.sections[0].lines[0], doc, problems };
}

/** Strip sourceLine/col (positional metadata) for round-trip comparison. */
function stripPositions(doc) {
  return {
    directives: doc.directives,
    sections: doc.sections.map((s) => ({
      label: s.label,
      tal: s.tal,
      lines: s.lines.map(({ sourceLine, passthrough, ...rest }) => ({
        ...rest,
        passthrough: passthrough.map(({ col, text }) => ({ text })),
      })),
    })),
  };
}

function assertRoundTrip(text) {
  const p1 = parseDocument(text);
  const canonical = serializeDocument(p1.doc);
  const p2 = parseDocument(canonical);
  assert.deepEqual(
    stripPositions(p2.doc),
    stripPositions(p1.doc),
    `round-trip diverged for:\n${text}\n--- canonical ---\n${canonical}`
  );
}

const APPENDIX_A = `title: Kahe Ko (khyal) — R. 1732
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

// ---------------------------------------------------------------------------
// Smokes
// ---------------------------------------------------------------------------

export const smokes = [
  // ---- Appendix A corpus ----
  {
    name: 'corpus: parses with zero problems',
    fn: () => {
      const { problems } = parseDocument(APPENDIX_A);
      assert.deepEqual(problems, [], JSON.stringify(problems, null, 2));
    },
  },
  {
    name: 'corpus: 5 sections with the right labels',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      assert.deepEqual(
        doc.sections.map((s) => s.label),
        ['Sthayi', 'Vistars', 'Tihai', 'Krintan (cross-beat)', 'Alap']
      );
    },
  },
  {
    name: 'corpus: header directives captured',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      assert.equal(doc.directives.raga, 'kirwani');
      assert.equal(doc.directives.tal, 'tintal');
      assert.equal(doc.directives.sa, 'C#');
      assert.equal(doc.directives.tempo, '72');
    },
  },
  {
    name: 'corpus: sthayi line — startMatra 7, lineRepeat, 16 matras',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const l = doc.sections[0].lines[0];
      assert.equal(l.startMatra, 7);
      assert.equal(l.lineRepeat, true);
      assert.equal(l.matras.length, 16);
    },
  },
  {
    name: 'corpus: sthayi meend span N → taar S across the matra boundary',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const l = doc.sections[0].lines[0];
      const meends = l.spans.filter((s) => s.type === 'meend');
      assert.equal(meends.length, 1);
      assert.deepEqual(meends[0].from, { matraIndex: 8, eventIndex: 0 });
      assert.deepEqual(meends[0].to, { matraIndex: 9, eventIndex: 0 });
    },
  },
  {
    name: "corpus: alap section is tal 'free' with one 2-matra line",
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const alap = doc.sections[4];
      assert.equal(alap.tal, 'free');
      assert.equal(alap.lines.length, 1);
      assert.equal(alap.lines[0].matras.length, 2);
    },
  },
  {
    name: 'corpus: alap leading ~ covers the cluster (7 notes, span first→last)',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const l = doc.sections[4].lines[0];
      assert.equal(l.matras[0].events.length, 7);
      const meends = l.spans.filter((s) => s.type === 'meend');
      assert.equal(meends.length, 1);
      assert.deepEqual(meends[0].from, { matraIndex: 0, eventIndex: 0 });
      assert.deepEqual(meends[0].to, { matraIndex: 0, eventIndex: 6 });
    },
  },
  {
    name: 'corpus: metered sections carry tal tintal',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      for (let i = 0; i < 4; i++) assert.equal(doc.sections[i].tal, 'tintal');
    },
  },

  // ---- clusters ----
  {
    name: 'cluster: SRgmP → 5 note events, each 1/5',
    fn: () => {
      const l = line('SRgmP').line;
      assert.equal(l.matras.length, 1);
      const evs = l.matras[0].events;
      assert.equal(evs.length, 5);
      for (const [i, ch] of ['S', 'R', 'g', 'm', 'P'].entries()) {
        assert.equal(evs[i].type, 'note');
        assert.equal(evs[i].ch, ch);
        assert.deepEqual(evs[i].dur, frac(1, 5));
      }
    },
  },
  {
    name: 'cluster: SRgmP- → 6 slots, final P dur 1/3',
    fn: () => {
      const evs = line('SRgmP-').line.matras[0].events;
      assert.equal(evs.length, 5);
      for (let i = 0; i < 4; i++) assert.deepEqual(evs[i].dur, frac(1, 6));
      assert.equal(evs[4].ch, 'P');
      assert.deepEqual(evs[4].dur, frac(1, 3));
    },
  },
  {
    name: 'cluster: -P → sustain slot then P, halves',
    fn: () => {
      const evs = line('S -P').line.matras[1].events;
      assert.equal(evs.length, 2);
      assert.equal(evs[0].type, 'sustain');
      assert.deepEqual(evs[0].dur, frac(1, 2));
      assert.equal(evs[1].type, 'note');
      assert.equal(evs[1].ch, 'P');
      assert.deepEqual(evs[1].dur, frac(1, 2));
    },
  },

  // ---- octaves and rests ----
  {
    name: "octave: .d → note ch 'd', octave -1",
    fn: () => {
      const ev = line('.d').line.matras[0].events[0];
      assert.equal(ev.type, 'note');
      assert.equal(ev.ch, 'd');
      assert.equal(ev.octave, -1);
    },
  },
  {
    name: 'rest: standalone . → one rest matra',
    fn: () => {
      const l = line('S . P').line;
      assert.equal(l.matras.length, 3);
      assert.equal(l.matras[1].events.length, 1);
      assert.equal(l.matras[1].events[0].type, 'rest');
      assert.deepEqual(l.matras[1].events[0].dur, frac(1, 1));
    },
  },
  {
    name: "octave: 'S.S → taar S then mandra S in one cluster",
    fn: () => {
      const evs = line("'S.S").line.matras[0].events;
      assert.equal(evs.length, 2);
      assert.equal(evs[0].ch, 'S');
      assert.equal(evs[0].octave, 1);
      assert.equal(evs[1].ch, 'S');
      assert.equal(evs[1].octave, -1);
    },
  },
  {
    name: 'octave: ..d → octave -2',
    fn: () => assert.equal(line('..d').line.matras[0].events[0].octave, -2),
  },

  // ---- brackets ----
  {
    name: 'bracket: [. . S R] → two rests then two notes, each 1/4',
    fn: () => {
      const evs = line('[. . S R]').line.matras[0].events;
      assert.equal(evs.length, 4);
      assert.equal(evs[0].type, 'rest');
      assert.equal(evs[1].type, 'rest');
      assert.equal(evs[2].ch, 'S');
      assert.equal(evs[3].ch, 'R');
      for (const e of evs) assert.deepEqual(e.dur, frac(1, 4));
    },
  },
  {
    name: 'bracket: [SR g] → S,R at 1/4 each, g at 1/2',
    fn: () => {
      const evs = line('[SR g]').line.matras[0].events;
      assert.equal(evs.length, 3);
      assert.deepEqual(evs[0].dur, frac(1, 4));
      assert.deepEqual(evs[1].dur, frac(1, 4));
      assert.equal(evs[2].ch, 'g');
      assert.deepEqual(evs[2].dur, frac(1, 2));
    },
  },
  {
    name: 'bracket: [P -] equivalent to cluster P-',
    fn: () => {
      const a = line('[P -]').line.matras[0].events;
      const b = line('P-').line.matras[0].events;
      assert.deepEqual(a, b);
      assert.equal(a.length, 1);
      assert.deepEqual(a[0].dur, frac(1, 1));
    },
  },

  // ---- sustains ----
  {
    name: 'sustain: S - - → note plus two whole-matra sustains',
    fn: () => {
      const l = line('S - -').line;
      assert.equal(l.matras.length, 3);
      assert.equal(l.matras[0].events[0].type, 'note');
      for (const i of [1, 2]) {
        assert.equal(l.matras[i].events.length, 1);
        assert.equal(l.matras[i].events[0].type, 'sustain');
        assert.deepEqual(l.matras[i].events[0].dur, frac(1, 1));
      }
    },
  },
  {
    name: 'sustain: -- as one token → two matras, counting by hyphen',
    fn: () => {
      const l = line('S --').line;
      assert.equal(l.matras.length, 3);
      assert.equal(l.matras[1].events[0].type, 'sustain');
      assert.equal(l.matras[2].events[0].type, 'sustain');
    },
  },
  {
    name: 'hold: S _ | _ | under tintal from sam → sustains to each vibhag end',
    fn: () => {
      const { line: l, problems } = line('S _ | _ |');
      assert.deepEqual(problems, []);
      assert.equal(l.matras.length, 8);
      assert.equal(l.matras[0].events[0].type, 'note');
      for (let i = 1; i < 8; i++) {
        assert.equal(l.matras[i].events[0].type, 'sustain', `matra ${i}`);
      }
      assert.equal(l.matras[1].events[0].holdToVibhag, true);
      assert.equal(l.matras[4].events[0].holdToVibhag, true);
      assert.notEqual(l.matras[2].events[0].holdToVibhag, true);
    },
  },

  // ---- meend ----
  {
    name: "meend: N~ 'S across matras → span from N to 'S",
    fn: () => {
      const l = line("N~ 'S").line;
      assert.equal(l.matras.length, 2);
      const meends = l.spans.filter((s) => s.type === 'meend');
      assert.equal(meends.length, 1);
      assert.deepEqual(meends[0].from, { matraIndex: 0, eventIndex: 0 });
      assert.deepEqual(meends[0].to, { matraIndex: 1, eventIndex: 0 });
    },
  },
  {
    name: "kan (was meend pre-2026-07-16): N~'S unspaced is a kan — grace N into 'S",
    fn: () => {
      // SUPERSEDED BEHAVIOR NOTE: this smoke previously asserted N~'S was a
      // within-matra meend of two half-notes. M's ornament grammar
      // (2026-07-16) redefines the internal tilde as the kan — that ruling
      // is exactly what 'S~n was always meant to be. The old spelling for
      // the within-matra meend is the leading tilde: ~N'S.
      const l = line("N~'S").line;
      assert.equal(l.matras.length, 1);
      assert.equal(l.matras[0].events.length, 2);
      assert.equal(l.matras[0].events[0].grace, true);
      assert.deepEqual(l.matras[0].events[1].dur, { num: 1, den: 1 });
      const kans = l.spans.filter((s) => s.type === 'kan');
      assert.equal(kans.length, 1);
    },
  },
  {
    name: "meend: N ~'S (leading tilde, single note) also spans across",
    fn: () => {
      const l = line("N ~'S").line;
      const meends = l.spans.filter((s) => s.type === 'meend');
      assert.equal(meends.length, 1);
      assert.deepEqual(meends[0].from, { matraIndex: 0, eventIndex: 0 });
      assert.deepEqual(meends[0].to, { matraIndex: 1, eventIndex: 0 });
    },
  },

  // ---- krintan ----
  {
    name: 'krintan: [[dP/mg/RS]] → 3 matras, span first event → last, crossing bounds',
    fn: () => {
      const l = line('[[dP/mg/RS]]').line;
      assert.equal(l.matras.length, 3);
      const kr = l.spans.filter((s) => s.type === 'krintan');
      assert.equal(kr.length, 1);
      assert.deepEqual(kr[0].from, { matraIndex: 0, eventIndex: 0 });
      assert.deepEqual(kr[0].to, { matraIndex: 2, eventIndex: 1 });
    },
  },

  // ---- repeats ----
  {
    name: 'phrase repeat: (SR gm P)x3 → {times 3, fromMatra 0, toMatra 2}',
    fn: () => {
      const l = line('(SR gm P)x3').line;
      assert.equal(l.matras.length, 3);
      assert.deepEqual(l.phraseRepeats, [{ times: 3, fromMatra: 0, toMatra: 2 }]);
    },
  },
  {
    name: 'line repeat: ||: :|| sets lineRepeat, strips glyphs from matras',
    fn: () => {
      const l = line('||: S R g m :||').line;
      assert.equal(l.lineRepeat, true);
      assert.equal(l.matras.length, 4);
    },
  },

  // ---- lyrics (Appendix A sthayi) ----
  {
    name: "lyrics: 'hi' resolves to the P matra of vibhag 3, blanks after",
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const l = doc.sections[0].lines[0];
      const at = (i) => l.lyrics.find((x) => x.matraIndex === i);
      assert.equal(at(6)?.text, 'hi');
      assert.equal(at(7), undefined);
      assert.equal(at(8), undefined);
      assert.equal(at(9), undefined);
    },
  },
  {
    name: "lyrics: 'ma- ne' resolve to .d and P (struck-note rule, per vibhag)",
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      const l = doc.sections[0].lines[0];
      const at = (i) => l.lyrics.find((x) => x.matraIndex === i);
      assert.equal(at(10)?.text, 'ma-');
      assert.equal(at(11), undefined); // sustain matra: skipped
      assert.equal(at(12)?.text, 'ne');
      assert.equal(at(13), undefined);
      assert.equal(at(14)?.text, 're');
    },
  },
  {
    name: 'lyrics: explicit . skip places a syllable on a later struck note',
    fn: () => {
      const { doc } = parseDocument('tal: tintal\n\nS R g m\n" . la\n');
      const l = doc.sections[0].lines[0];
      assert.deepEqual(l.lyrics, [{ matraIndex: 1, text: 'la' }]);
    },
  },

  // ---- bols ----
  {
    name: 'bols: words da ra diri attach per note event, including inside clusters',
    fn: () => {
      const { doc, problems } = parseDocument('tal: tintal\n\nSR g m P d\n> da ra da diri da ra\n');
      assert.deepEqual(problems, []);
      const l = doc.sections[0].lines[0];
      assert.deepEqual(l.bols, [
        { ref: { matraIndex: 0, eventIndex: 0 }, mark: 'da' },
        { ref: { matraIndex: 0, eventIndex: 1 }, mark: 'ra' },
        { ref: { matraIndex: 1, eventIndex: 0 }, mark: 'da' },
        { ref: { matraIndex: 2, eventIndex: 0 }, mark: 'diri' },
        { ref: { matraIndex: 3, eventIndex: 0 }, mark: 'da' },
        { ref: { matraIndex: 4, eventIndex: 0 }, mark: 'ra' },
      ]);
    },
  },
  {
    name: 'bols: sustains and rests are skipped; chikari is a mark',
    fn: () => {
      const { doc } = parseDocument('tal: tintal\n\nS - . R\n> da chikari\n');
      const l = doc.sections[0].lines[0];
      assert.deepEqual(l.bols, [
        { ref: { matraIndex: 0, eventIndex: 0 }, mark: 'da' },
        { ref: { matraIndex: 3, eventIndex: 0 }, mark: 'chikari' },
      ]);
    },
  },
  {
    name: 'bols: . is an explicit gap — the note under it carries no mark',
    fn: () => {
      const { doc, problems } = parseDocument('tal: tintal\n\nS R g m\n> da . diri\n');
      assert.deepEqual(problems, []);
      const l = doc.sections[0].lines[0];
      assert.deepEqual(l.bols, [
        { ref: { matraIndex: 0, eventIndex: 0 }, mark: 'da' },
        { ref: { matraIndex: 2, eventIndex: 0 }, mark: 'diri' },
      ]);
    },
  },
  {
    name: 'bols: old shorthand l is now a diagnostic, not a silent mark',
    fn: () => {
      const { problems } = parseDocument('tal: tintal\n\nS R\n> l -\n');
      assert.ok(problems.some((p) => /bol/.test(p.msg)));
    },
  },

  // ---- diagnostics: never throws ----
  {
    name: 'phrase bars: @N and typed | coexist without vibhag diagnostics',
    fn: () => {
      const source = `tal: rupak

Gat
@4 ||: S .n .D .n | S - - | m - | g - | g - m | D - | - - |1 m g R :||
`;
      const { doc, problems } = parseDocument(source);
      assert.deepEqual(problems, [], JSON.stringify(problems, null, 2));
      const parsed = doc.sections[0].lines[0];
      assert.equal(parsed.startMatra, 4);
      assert.equal(parsed.firstEndingFrom, 18);
      assert.deepEqual(parsed._bars, [4, 7, 9, 11, 14, 16, 18]);
    },
  },
  {
    name: 'diagnostics: nested ( )xN → problem',
    fn: () => {
      const { problems } = line('(S (R g)x2 m)x3');
      assert.ok(problems.some((p) => /nest/i.test(p.msg)));
    },
  },
  {
    name: 'diagnostics: unknown token → passthrough + problem, valid neighbors survive',
    fn: () => {
      const { line: l, problems } = line('S R xyz P');
      assert.equal(l.matras.length, 3);
      assert.equal(l.passthrough.length, 1);
      assert.equal(l.passthrough[0].text, 'xyz');
      assert.equal(problems.length, 1);
    },
  },
  {
    name: 'diagnostics: empty document → empty doc, no throw',
    fn: () => {
      const { doc, problems } = parseDocument('');
      assert.deepEqual(doc.sections, []);
      assert.deepEqual(problems, []);
    },
  },
  {
    name: "phrase bars: '|' is also legal in tal: free",
    fn: () => {
      const { doc, problems } = parseDocument('tal: free\n\nS R | g m\n');
      const parsed = doc.sections[0].lines[0];
      assert.equal(parsed.matras.length, 4);
      assert.deepEqual(parsed._bars, [2]);
      assert.deepEqual(problems, []);
    },
  },
  {
    name: 'diagnostics: metered music with no tal directive → problem, still parses',
    fn: () => {
      const { doc, problems } = parseDocument('S R g m\n');
      assert.equal(doc.sections[0].lines[0].matras.length, 4);
      assert.ok(problems.some((p) => /tal/.test(p.msg)));
    },
  },

  // ---- round-trips ----
  {
    name: 'round-trip: full Appendix A corpus',
    fn: () => assertRoundTrip(APPENDIX_A),
  },
  {
    name: 'round-trip: fragment cases',
    fn: () => {
      const frags = [
        'SRgmP D',
        'SRgmP- D',
        'S -P',
        "'S.S ..d .",
        '[. . S R] [SR g]',
        'S - - --',
        'S _ | _ |',
        "N~ 'S",
        "N~'S",
        '[[dP/mg/RS]] -',
        '(SR gm P)x3',
        'SR g m P d\n> da ra . diri chikari',
        '@7 ||: .d P | mg R m m | P d N~ \'S | .d - P m | R - :||',
      ];
      for (const f of frags) assertRoundTrip(`tal: tintal\n\n${f}\n`);
    },
  },
  {
    name: 'round-trip: serialize is idempotent on canonical text',
    fn: () => {
      const c1 = serializeDocument(parseDocument(APPENDIX_A).doc);
      const c2 = serializeDocument(parseDocument(c1).doc);
      assert.equal(c2, c1);
    },
  },

  // ---- frontmatter (spec §3.1 amended 2026-07-16) ----
  {
    name: 'frontmatter: fenced header parses — directives captured, flag set, zero problems',
    fn: () => {
      const fenced = `---\ntitle: Kahe Ko\nraga: kirwani\ntal: tintal\n---\n\nSthayi\n@7 .d P | mg R m m | P d N~ 'S | .d - P m | R -\n`;
      const { doc, problems } = parseDocument(fenced);
      assert.deepEqual(problems, [], JSON.stringify(problems, null, 2));
      assert.equal(doc.frontmatter, true);
      assert.equal(doc.directives.raga, 'kirwani');
      assert.equal(doc.directives.tal, 'tintal');
      assert.equal(doc.sections.length, 1);
      assert.equal(doc.sections[0].label, 'Sthayi');
      assert.equal(doc.sections[0].tal, 'tintal');
      assert.equal(doc.sections[0].lines[0].matras.length, 16);
    },
  },
  {
    name: 'frontmatter: unfenced documents parse with frontmatter false',
    fn: () => {
      const { doc } = parseDocument(APPENDIX_A);
      assert.equal(doc.frontmatter, false);
    },
  },
  {
    name: 'frontmatter: only a --- on line 1 opens a fence; body --- is still sustains',
    fn: () => {
      const src = `tal: tintal\n\nSthayi\nS R g m\n---\n`;
      const { doc, problems } = parseDocument(src);
      assert.equal(doc.frontmatter, false);
      assert.deepEqual(problems, []);
      // the --- line parses as three whole-matra sustains, as before
      const lines = doc.sections[0].lines;
      assert.equal(lines.length, 2);
      assert.equal(lines[1].matras.length, 3);
      assert.equal(lines[1].matras[0].events[0].type, 'sustain');
    },
  },
  {
    name: 'frontmatter: unclosed fence narrates a problem, never throws',
    fn: () => {
      const { doc, problems } = parseDocument(`---\ntitle: Oops\n`);
      assert.equal(doc.frontmatter, false);
      assert.ok(problems.some((p) => p.line === 1 && /never closed/.test(p.msg)));
    },
  },
  {
    name: 'frontmatter: non-directive line inside fences narrates and is skipped',
    fn: () => {
      const src = `---\ntitle: Kahe Ko\nnot a directive line\ntal: tintal\n---\n\nS R g m\n`;
      const { doc, problems } = parseDocument(src);
      assert.equal(doc.frontmatter, true);
      assert.ok(problems.some((p) => p.line === 3 && /frontmatter/.test(p.msg)));
      assert.equal(doc.directives.tal, 'tintal');
      assert.equal(doc.sections[0].lines[0].matras.length, 4);
    },
  },
  {
    name: 'frontmatter: serialize preserves the fenced form; unfenced stays unfenced',
    fn: () => {
      const fenced = `---\ntitle: Kahe Ko\ntal: tintal\n---\n\nS R g m\n`;
      const outFenced = serializeDocument(parseDocument(fenced).doc);
      assert.ok(outFenced.startsWith('---\ntitle: Kahe Ko\ntal: tintal\n---\n'), outFenced);
      const outPlain = serializeDocument(parseDocument(APPENDIX_A).doc);
      assert.ok(outPlain.startsWith('title:'), outPlain.slice(0, 40));
    },
  },
  // --- ~ never affects rhythm (spec principle 4). M, 2026-07-16: `~[m - g]`
  // was emitting a phantom EMPTY matra and silently dropping the meend,
  // shifting every matra after it and cascading into vibhag errors.
  // --- the scanner must ALWAYS advance (M, 2026-07-16: the app froze hard
  // and needed a page reload whenever a bracket was typed). `]` sits in the
  // token reader's terminator set but no branch consumed it, so the token
  // came back empty and `i` was reassigned to itself — an infinite loop on
  // one character. Typing `[[DP]]` passes through `[[DP]`, which leaves
  // exactly that stray `]`, so the freeze hit mid-word on every keystroke.
  {
    name: 'hang: a stray ] narrates instead of looping forever',
    fn: () => {
      const { problems } = parseDocument('tal: tintal\n\nDP]]\n');
      assert.ok(problems.length > 0, 'must narrate');
      assert.ok(problems.some((p) => /unexpected/.test(p.msg)), JSON.stringify(problems));
    },
  },
  {
    name: 'hang: a stray ) narrates instead of looping forever',
    fn: () => {
      const { problems } = parseDocument('tal: tintal\n\nS R)\n');
      assert.ok(problems.length > 0, 'must narrate');
    },
  },
  {
    name: 'hang: every prefix of a krintan line parses (typing it, keystroke by keystroke)',
    fn: () => {
      const full = '@7 ||: S mg | g [[dP/mg/RS]] - | (SR gm P)x3 :||';
      for (let k = 1; k <= full.length; k++) {
        const partial = full.slice(0, k);
        const { doc, problems } = parseDocument(`tal: tintal\n\n${partial}\n`);
        assert.ok(doc, `prefix ${k} returned no doc: ${JSON.stringify(partial)}`);
        assert.ok(Array.isArray(problems), `prefix ${k}: ${JSON.stringify(partial)}`);
      }
    },
  },
  {
    name: "hang: every prefix of M's Bageshri gat line parses",
    fn: () => {
      const full = "| S - - | m - | g [[DP]] | g - m | D - | - - | m~ g | 'Sn 'Sn";
      for (let k = 1; k <= full.length; k++) {
        const { doc } = parseDocument(`tal: rupak\n\n${full.slice(0, k)}\n`);
        assert.ok(doc, `prefix ${k}`);
      }
    },
  },
  {
    name: 'hang: the scanner watchdog never fires on the Appendix A corpus',
    fn: () => {
      const { problems } = parseDocument(APPENDIX_A);
      assert.ok(!problems.some((p) => /failed to advance/.test(p.msg)), JSON.stringify(problems));
      assert.deepEqual(problems, []);
    },
  },
  {
    name: 'tilde: ~[m - g] adds no phantom matra and keeps the uneven split',
    fn: () => {
      const { doc, problems } = parseDocument('tal: rupak\n\n~[m - g]\n');
      const line = doc.sections[0].lines[0];
      assert.equal(line.matras.length, 1, 'exactly one matra — ~ never affects rhythm');
      assert.deepEqual(line.matras[0].events.map((e) => e.ch), ['m', 'g']);
      assert.deepEqual(line.matras[0].events[0].dur, { num: 2, den: 3 }, 'm holds 2/3');
      assert.deepEqual(line.matras[0].events[1].dur, { num: 1, den: 3 }, 'g lands on the last third');
      assert.deepEqual(problems, [], JSON.stringify(problems));
    },
  },
  {
    name: 'tilde: ~[m - g] draws the meend across the bracket (as ~mg does)',
    fn: () => {
      const { doc } = parseDocument('tal: rupak\n\n~[m - g]\n');
      const spans = doc.sections[0].lines[0].spans;
      assert.equal(spans.length, 1, JSON.stringify(spans));
      assert.equal(spans[0].type, 'meend');
      assert.deepEqual(spans[0].from, { matraIndex: 0, eventIndex: 0 });
      assert.deepEqual(spans[0].to, { matraIndex: 0, eventIndex: 1 });
    },
  },
  {
    name: 'tilde: a tilde inside bracket slots covers the bracket, not dropped',
    fn: () => {
      for (const src of ['[~m g]', '[m~ g]', '[m ~g]']) {
        const { doc } = parseDocument(`tal: rupak\n\n${src}\n`);
        const line = doc.sections[0].lines[0];
        assert.equal(line.matras.length, 1, `${src}: one matra`);
        assert.equal(line.spans.length, 1, `${src}: meend span — got ${JSON.stringify(line.spans)}`);
        assert.equal(line.spans[0].type, 'meend');
      }
    },
  },
  {
    name: 'tilde: ~ before a krintan bracket keeps the matra count honest',
    fn: () => {
      const { doc } = parseDocument('tal: rupak\n\n~[[dP/mg]]\n');
      const line = doc.sections[0].lines[0];
      assert.equal(line.matras.length, 2, 'two matras, no phantom');
      assert.ok(line.spans.some((s) => s.type === 'krintan'));
    },
  },
  {
    name: 'tilde: a lone ~ with nothing to slide narrates and makes no matra',
    fn: () => {
      const { doc, problems } = parseDocument('tal: rupak\n\nS ~ R\n');
      const line = doc.sections[0].lines[0];
      assert.equal(line.matras.length, 2, 'S and R only — no empty matra');
      assert.ok(problems.length > 0, 'failure must narrate');
    },
  },
  {
    name: 'tilde: Appendix A still parses clean after the tilde work',
    fn: () => {
      const { problems } = parseDocument(APPENDIX_A);
      assert.deepEqual(problems, [], JSON.stringify(problems));
    },
  },
  // --- kan / grace notes (spec §3 ornaments; M's grammar, 2026-07-16).
  // {graces}X — braces hold the grace run, the note after owns the beat.
  // Internal cluster tildes are shorthand: 'S~n and d~P~m are kans too;
  // the note after the LAST internal tilde is the destination. Leading
  // tilde (~mg: meend arc over an even cluster) and trailing tilde
  // (N~ <space>: cross-matra meend) keep their existing meanings.
  {
    name: "kan: {'S}n — one grace, destination owns the whole beat",
    fn: () => {
      const { doc, problems } = parseDocument("tal: tintal\n\n{'S}n R g m\n");
      assert.deepEqual(problems, [], JSON.stringify(problems));
      const line = doc.sections[0].lines[0];
      assert.equal(line.matras.length, 4, 'four matras — graces cost no time');
      const evs = line.matras[0].events;
      assert.equal(evs.length, 2);
      assert.equal(evs[0].grace, true);
      assert.equal(evs[0].ch, 'S');
      assert.equal(evs[0].octave, 1, "the ' octave prefix works inside braces");
      assert.deepEqual(evs[0].dur, { num: 0, den: 1 }, 'grace carries no metric time');
      assert.equal(evs[1].ch, 'n');
      assert.equal(evs[1].grace, undefined);
      assert.deepEqual(evs[1].dur, { num: 1, den: 1 }, 'destination owns the beat');
      const kan = line.spans.find((s) => s.type === 'kan');
      assert.ok(kan, 'kan span for the curve');
      assert.deepEqual(kan.from, { matraIndex: 0, eventIndex: 0 });
      assert.deepEqual(kan.to, { matraIndex: 0, eventIndex: 1 });
    },
  },
  {
    name: 'kan: long run {P\'SN\'R\'SN\'S}N parses — seven graces into N',
    fn: () => {
      const { doc, problems } = parseDocument("tal: free\n\n{P'SN'R'SN'S}N\n");
      assert.deepEqual(problems, []);
      const evs = doc.sections[0].lines[0].matras[0].events;
      assert.equal(evs.filter((e) => e.grace).length, 7);
      assert.deepEqual(evs.filter((e) => e.grace).map((e) => e.ch).join(''), 'PSNRSNS');
      assert.deepEqual(evs.filter((e) => e.grace).map((e) => e.octave), [0, 1, 0, 1, 1, 0, 1]);
      assert.equal(evs[evs.length - 1].ch, 'N');
      assert.deepEqual(evs[evs.length - 1].dur, { num: 1, den: 1 });
    },
  },
  {
    name: 'kan: spaces inside braces are allowed and ignored',
    fn: () => {
      const a = parseDocument('tal: tintal\n\n{dP}m R g m\n');
      const b = parseDocument('tal: tintal\n\n{d P}m R g m\n');
      assert.deepEqual(b.problems, []);
      assert.deepEqual(
        b.doc.sections[0].lines[0].matras[0].events,
        a.doc.sections[0].lines[0].matras[0].events
      );
    },
  },
  {
    name: 'kan: internal tilde is shorthand — d~P~m equals {dP}m',
    fn: () => {
      const brace = parseDocument('tal: tintal\n\n{dP}m R g m\n').doc.sections[0].lines[0];
      const tilde = parseDocument('tal: tintal\n\nd~P~m R g m\n').doc.sections[0].lines[0];
      assert.deepEqual(tilde.matras[0].events, brace.matras[0].events);
      assert.deepEqual(
        tilde.spans.find((s) => s.type === 'kan'),
        brace.spans.find((s) => s.type === 'kan')
      );
    },
  },
  {
    name: "kan: 'S~n is a kan — grace taar-S into a full-beat n (M's case)",
    fn: () => {
      const { doc, problems } = parseDocument("tal: tintal\n\n'S~n R g m\n");
      assert.deepEqual(problems, []);
      const evs = doc.sections[0].lines[0].matras[0].events;
      assert.equal(evs[0].grace, true);
      assert.equal(evs[0].ch, 'S');
      assert.equal(evs[0].octave, 1);
      assert.equal(evs[1].ch, 'n');
      assert.deepEqual(evs[1].dur, { num: 1, den: 1 });
    },
  },
  {
    name: 'kan: destination cluster subdivides the rest of the beat ({d}Pm)',
    fn: () => {
      const evs = parseDocument('tal: tintal\n\n{d}Pm R g m\n').doc.sections[0].lines[0].matras[0]
        .events;
      assert.equal(evs[0].grace, true);
      assert.deepEqual(evs[1].dur, { num: 1, den: 2 });
      assert.deepEqual(evs[2].dur, { num: 1, den: 2 });
    },
  },
  {
    name: 'kan: leading and trailing tildes keep their meend meanings',
    fn: () => {
      // leading: even split + arc over the cluster, NOT a kan
      const lead = parseDocument('tal: tintal\n\n~mg R g m\n').doc.sections[0].lines[0];
      assert.deepEqual(lead.matras[0].events.map((e) => e.dur), [
        { num: 1, den: 2 },
        { num: 1, den: 2 },
      ]);
      assert.ok(lead.spans.some((s) => s.type === 'meend'));
      assert.ok(!lead.spans.some((s) => s.type === 'kan'));
      // trailing + space: two full matras, meend across
      const cross = parseDocument('tal: tintal\n\nm~ g R g\n').doc.sections[0].lines[0];
      assert.equal(cross.matras.length, 4);
      assert.ok(
        cross.spans.some(
          (s) => s.type === 'meend' && s.from.matraIndex === 0 && s.to.matraIndex === 1
        )
      );
    },
  },
  {
    name: 'kan: {run} followed by a note attaches forward (superseded: was a problem)',
    fn: () => {
      // SUPERSEDED 2026-07-16 (M's cross-beat ruling): a spaced {run} now
      // attaches to the NEXT note rather than erroring. The genuine orphan
      // — a run at line end — still narrates (see the xbeat smokes).
      const { doc, problems } = parseDocument('tal: tintal\n\nS {dP} R g\n');
      assert.deepEqual(problems, []);
      const line = doc.sections[0].lines[0];
      assert.equal(line.matras.length, 3, 'S, R, g — braces still cost no matra');
      assert.equal(line.matras[1].events.filter((e) => e.grace && e.preBeat).length, 2);
    },
  },
  {
    name: 'kan: { without closing } narrates instead of hanging',
    fn: () => {
      const { problems } = parseDocument('tal: tintal\n\nS {dP\n');
      assert.ok(problems.some((p) => /\{/.test(p.msg)), JSON.stringify(problems));
    },
  },
  {
    name: 'kan: every keystroke prefix of a braced line parses (no freeze)',
    fn: () => {
      const full = "| S - - | {P'SN'R'SN'S}N - | m~ g |";
      for (let k = 1; k <= full.length; k++) {
        const { doc } = parseDocument(`tal: rupak\n\n${full.slice(0, k)}\n`);
        assert.ok(doc, `prefix ${k}`);
      }
    },
  },
  {
    name: 'kan: brace form round-trips through serialize',
    fn: () => {
      assertRoundTrip("tal: tintal\n\n{'S}n R g m\n");
      assertRoundTrip("tal: free\n\n{P'SN'R'SN'S}N\n");
      assertRoundTrip('tal: tintal\n\n{d}Pm R g m\n');
    },
  },
  {
    name: 'kan: tilde shorthand serializes to the canonical brace form',
    fn: () => {
      const out = serializeDocument(parseDocument("tal: tintal\n\n'S~n R g m\n").doc);
      assert.match(out, /\{'S\}n/, out);
    },
  },
  {
    name: 'meend: within-matra meend serializes as LEADING tilde (kan-safe)',
    fn: () => {
      // The old canonical form P~S would now reparse as a kan — the leading
      // form is the only spelling that survives the new grammar unchanged.
      const out = serializeDocument(parseDocument('tal: free\n\n~PS.N\n').doc);
      assert.match(out, /~PS\.N/, out);
      assert.doesNotMatch(out, /P~S/, out);
      assertRoundTrip('tal: free\n\n~PS.N\n');
    },
  },
  {
    name: 'kan: Appendix A corpus is untouched by the ornament grammar',
    fn: () => {
      const { problems } = parseDocument(APPENDIX_A);
      assert.deepEqual(problems, []);
      assertRoundTrip(APPENDIX_A);
    },
  },
  {
    name: 'directives: laya/composition emit in canonical order, after tempo',
    fn: () => {
      const src = `---\nlaya: madhya\ncomposition: instrumental\nraga: kirwani\ntal: tintal\ntempo: 72\n---\n\nS R g m\n`;
      const out = serializeDocument(parseDocument(src).doc);
      assert.equal(
        out.split('\n').slice(0, 7).join('\n'),
        '---\nraga: kirwani\ntal: tintal\ntempo: 72\ncomposition: instrumental\nlaya: madhya\n---'
      );
      assertRoundTrip(src);
    },
  },
  {
    name: 'frontmatter: fenced document round-trips (parse→serialize→parse deep-equal)',
    fn: () => {
      const fenced = `---\ntitle: Kahe Ko\nraga: kirwani\ntal: tintal\nsa: C#\ntempo: 72\n---\n\nSthayi\n@7 ||: .d P | mg R m m | P d N~ 'S | .d - P m | R - :||\n" ka- he | ko ma- na na- | hi | ma- ne | re\n\nTihai\n(SR gm P)x3\n`;
      assertRoundTrip(fenced);
      const p = parseDocument(fenced);
      assert.equal(parseDocument(serializeDocument(p.doc)).doc.frontmatter, true);
    },
  },
// --- cross-beat ornament (M, 2026-07-16 second ruling): `{run} X` with a
  // space attaches the graces FORWARD to the next note — they sound before
  // its beat (stealing from the previous note's tail), unlike `{run}X`
  // which steals from the destination's front. Same beat is not required.
  {
    name: 'kan xbeat: {dP} m — graces attach forward, matra count honest',
    fn: () => {
      const { doc, problems } = parseDocument('tal: tintal\n\nS {dP} m R g\n');
      assert.deepEqual(problems, [], JSON.stringify(problems));
      const line = doc.sections[0].lines[0];
      assert.equal(line.matras.length, 4, 'S, m, R, g — braces cost no matra');
      const m = line.matras[1].events;
      assert.equal(m.filter((e) => e.grace).length, 2);
      assert.ok(m.filter((e) => e.grace).every((e) => e.preBeat === true));
      assert.equal(m[2].ch, 'm');
      assert.deepEqual(m[2].dur, { num: 1, den: 1 }, 'destination still owns its beat');
      assert.ok(line.spans.some((x) => x.type === 'kan'));
    },
  },
  {
    name: 'kan xbeat: graces attach across a barline',
    fn: () => {
      const { doc, problems } = parseDocument('tal: tintal\n\nS R g {dP} | m P d n\n');
      assert.deepEqual(problems.filter((p) => !/vibhag/.test(p.msg)), []);
      const line = doc.sections[0].lines[0];
      const m = line.matras[3].events;
      assert.equal(m.filter((e) => e.grace && e.preBeat).length, 2);
      assert.equal(m[2].ch, 'm');
    },
  },
  {
    name: 'kan xbeat: pending graces at line end narrate',
    fn: () => {
      const { doc, problems } = parseDocument('tal: tintal\n\nS R g {dP}\n');
      assert.equal(doc.sections[0].lines[0].matras.length, 3);
      assert.ok(problems.some((p) => /no destination/.test(p.msg)), JSON.stringify(problems));
    },
  },
  {
    name: 'kan xbeat: spaced and attached forms round-trip distinctly',
    fn: () => {
      assertRoundTrip('tal: tintal\n\nS {dP} m R g\n');
      const spaced = serializeDocument(parseDocument('tal: tintal\n\nS {dP} m R g\n').doc);
      assert.match(spaced, /\{dP\} m/, spaced);
      const attached = serializeDocument(parseDocument('tal: tintal\n\nS {dP}m R g\n').doc);
      assert.match(attached, /\{dP\}m/, attached);
      assert.doesNotMatch(attached, /\{dP\} m/, attached);
    },
  },
// --- avartan continuation across written lines (M, 2026-07-16: "if you
  // make a new line, it doesn't continue the rhythm... you have to write
  // @6"). The tradition's convention — visible on M's own Jaijaiwanti page,
  // where line 2 of an entry picks up mid-cycle. A music line now continues
  // its section's cycle position; @N stays as the explicit override; a new
  // section resets to sam.
  {
    name: 'continuation: the second line picks up where the first left off',
    fn: () => {
      const { doc } = parseDocument('tal: tintal\n\nS R g m\nP d n N\n');
      const [a, b] = doc.sections[0].lines;
      assert.equal(a.startMatra, 1);
      assert.equal(b.startMatra, 5, 'line 2 continues at matra 5');
    },
  },
  {
    name: "continuation: M's Bageshri split — 'S lands on beat 6 with no @6 written",
    fn: () => {
      const src =
        'tal: rupak\n\n1.\n' +
        "| m - - | m~ g | - - | m D - | D - | - - | n - - | - - |\n" +
        "'S~n 'S~n | D - - | m\n";
      const { doc, problems } = parseDocument(src);
      assert.deepEqual(problems, [], JSON.stringify(problems));
      const [a, b] = doc.sections[0].lines;
      assert.equal(a.matras.length, 19);
      // 19 written matras from sam of a 7-matra cycle → next is matra 6
      assert.equal(b.startMatra, 6, "the 'S is the 6th beat, automatically");
    },
  },
  {
    name: 'continuation: an explicit @N still overrides',
    fn: () => {
      const { doc } = parseDocument('tal: tintal\n\nS R g m\n@9 P d n N\n');
      assert.equal(doc.sections[0].lines[1].startMatra, 9);
    },
  },
  {
    name: 'continuation: a full cycle wraps back to sam',
    fn: () => {
      const { doc } = parseDocument(
        'tal: tintal\n\nS R g m P d n N S R g m P d n N\nS R\n'
      );
      assert.equal(doc.sections[0].lines[1].startMatra, 1, 'sixteen matras of tintal → sam');
    },
  },
  {
    name: 'continuation: a new section resets to sam',
    fn: () => {
      const { doc } = parseDocument('tal: tintal\n\nSthayi\nS R g m P d\n\nAntara\nS R g m\n');
      assert.equal(doc.sections[0].lines[0].startMatra, 1);
      assert.equal(doc.sections[1].lines[0].startMatra, 1, 'Antara starts fresh at sam');
    },
  },
  {
    name: 'continuation: blank lines do not break the chain (labels do)',
    fn: () => {
      // A blank line opens a new UNLABELED section (pre-existing model
      // behavior) — but the cycle continues across it: blank lines are
      // visual spacing; only a labeled section is a musical reset.
      const { doc } = parseDocument('tal: tintal\n\nS R g m\n\nP d n N\n');
      assert.equal(doc.sections.length, 2);
      assert.equal(doc.sections[1].lines[0].startMatra, 5);
    },
  },
  {
    name: 'continuation: vibhag validation follows the continued position',
    fn: () => {
      // second line starts mid-vibhag of tintal; its first bar closes the
      // ongoing vibhag with 2 matras and that must NOT be reported short
      const { problems } = parseDocument('tal: tintal\n\nS R g m P d\nn N | S R g m\n');
      assert.deepEqual(problems, [], JSON.stringify(problems));
    },
  },
  {
    name: 'continuation: auto-continued lines round-trip WITHOUT gaining an @N',
    fn: () => {
      const src = 'tal: tintal\n\nS R g m\nP d n N\n';
      const out = serializeDocument(parseDocument(src).doc);
      assert.doesNotMatch(out, /@5/, out);
      assertRoundTrip(src);
      // and an explicit @ survives
      const out2 = serializeDocument(parseDocument('tal: tintal\n\n@9 P d n N\n').doc);
      assert.match(out2, /@9 /, out2);
    },
  },
];

