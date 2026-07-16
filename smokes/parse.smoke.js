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
    name: "meend: N~'S unspaced → one matra, 2 events, span within it",
    fn: () => {
      const l = line("N~'S").line;
      assert.equal(l.matras.length, 1);
      assert.equal(l.matras[0].events.length, 2);
      const meends = l.spans.filter((s) => s.type === 'meend');
      assert.equal(meends.length, 1);
      assert.deepEqual(meends[0].from, { matraIndex: 0, eventIndex: 0 });
      assert.deepEqual(meends[0].to, { matraIndex: 0, eventIndex: 1 });
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
    name: 'diagnostics: 5-matra vibhag → one problem naming the vibhag, no throw',
    fn: () => {
      const { problems } = line('S R g m P | S R g m |');
      assert.equal(problems.length, 1);
      assert.match(problems[0].msg, /vibhag 1/);
      assert.match(problems[0].msg, /5/);
      assert.match(problems[0].msg, /4/);
      assert.equal(problems[0].line, 3);
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
    name: "diagnostics: '|' in an unmetered section narrates instead of vanishing",
    fn: () => {
      const { doc, problems } = parseDocument('tal: free\n\nS R | g m\n');
      assert.equal(doc.sections[0].lines[0].matras.length, 4);
      assert.equal(problems.length, 1);
      assert.match(problems[0].msg, /unmetered/);
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
];

