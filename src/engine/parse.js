// src/engine/parse.js — Sargam engine: text → best-effort model + diagnostics.
// Plain JS, no React, no DOM. NEVER throws, never rejects a document (spec §2):
// unparseable fragments become dimmed passthrough runs with a Problem.
//
// Grammar: spec §3. The rules most likely to be fumbled (build plan):
//   - ~ and [[ ]] NEVER affect rhythm; only spaces, /, brackets, dashes do.
//   - . before a letter = mandra prefix; standalone = rest; rest inside a
//     beat needs [ ].
//   - Unspaced run = one-matra cluster, evenly divided; - inside a cluster
//     = one slot merged into the preceding event.
//   - N~ 'S = meend across two matras; N~'S unspaced = one-matra cluster
//     with a slide. Space decides rhythm; ~ only draws the arc.
//   - Directives are legal mid-document and apply forward; tal: free =
//     unmetered (no validation, no markers).

import { frac, fracReduce, fracAdd } from './model.js';
import { getTal, wrapMatra, vibhagOfMatra } from './tala.js';

const NOTE_CHARS = new Set(['S', 'r', 'R', 'g', 'G', 'm', 'M', 'P', 'd', 'D', 'n', 'N']);
const CLUSTER_RE = /^[SrRgGmMPdDnN.'~-]+$/;
const DIRECTIVE_RE = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/;
const BOL_MARKS = { da: 'da', ra: 'ra', diri: 'diri', chikari: 'chikari' };

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * @param {string} text
 * @returns {{doc: Document, problems: Problem[]}}
 */
export function parseDocument(text) {
  const problems = [];
  const doc = { directives: {}, sections: [], frontmatter: false };
  const src = typeof text === 'string' ? text : '';
  const lines = src.split('\n');

  let currentTal = null; // tal name, 'free', or null (none declared yet)
  let currentSection = null;
  let lastMusicLine = null;
  let missingTalReported = false;

  const applyDirective = (key, val, lineNo) => {
    if (key === 'tal') {
      currentTal = val;
      if (val !== 'free' && !getTal(val)) {
        problems.push({ line: lineNo, col: null, msg: `unknown tal '${val}'` });
      }
    }
    // First value wins for document directives (header semantics);
    // mid-document tal changes live on sections, not here.
    if (!(key in doc.directives)) doc.directives[key] = val;
  };

  // Frontmatter (spec §3.1 amended 2026-07-16): only a `---` on line 1
  // opens a fence; interior lines are directives; a `---` anywhere else in
  // the document is ordinary text (and still parses as sustains).
  let startLine = 0;
  if (lines[0] === '---') {
    let close = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        close = i;
        break;
      }
    }
    if (close === -1) {
      problems.push({
        line: 1,
        col: null,
        msg: "'---' frontmatter fence is never closed — add a closing '---' line or remove this one",
      });
    } else {
      doc.frontmatter = true;
      for (let i = 1; i < close; i++) {
        const t = lines[i].trim();
        if (t === '') continue;
        const dm = t.match(DIRECTIVE_RE);
        if (dm) {
          applyDirective(dm[1], dm[2].trim(), i + 1);
        } else {
          problems.push({
            line: i + 1,
            col: null,
            msg: `line inside frontmatter is not a 'key: value' directive — skipped`,
          });
        }
      }
      startLine = close + 1;
    }
  }

  for (let i = startLine; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === '') {
      currentSection = null;
      lastMusicLine = null;
      continue;
    }

    // Directive?
    const dm = trimmed.match(DIRECTIVE_RE);
    if (dm) {
      applyDirective(dm[1], dm[2].trim(), lineNo);
      continue;
    }

    // Lyric line?
    if (trimmed.startsWith('"')) {
      if (!lastMusicLine) {
        problems.push({ line: lineNo, col: null, msg: 'lyric line has no music line above it' });
      } else {
        attachLyrics(lastMusicLine, trimmed.slice(1), lineNo, problems);
      }
      continue;
    }

    // Bol line?
    if (trimmed.startsWith('>')) {
      if (!lastMusicLine) {
        problems.push({ line: lineNo, col: null, msg: 'bol line has no music line above it' });
      } else {
        attachBols(lastMusicLine, trimmed.slice(1), lineNo, problems);
      }
      continue;
    }

    // Music line or section label — a line with no valid music token is a label.
    if (!looksLikeMusic(trimmed)) {
      currentSection = { label: trimmed, tal: currentTal ?? 'free', lines: [] };
      doc.sections.push(currentSection);
      lastMusicLine = null;
      continue;
    }

    // Music line.
    if (!currentSection) {
      currentSection = { label: null, tal: currentTal ?? 'free', lines: [] };
      doc.sections.push(currentSection);
    }
    if (currentTal === null && !missingTalReported) {
      problems.push({
        line: lineNo,
        col: null,
        msg: 'tal: directive required before the first metered music line',
      });
      missingTalReported = true;
    }
    const tal = currentTal && currentTal !== 'free' ? getTal(currentTal) : null;
    const music = parseMusicLine(trimmed, lineNo, tal, problems, currentTal === 'free');
    currentSection.lines.push(music);
    lastMusicLine = music;
  }

  return { doc, problems };
}

// ---------------------------------------------------------------------------
// Music vs label heuristic: music iff at least one token is valid music.
// ---------------------------------------------------------------------------

function looksLikeMusic(trimmed) {
  const flat = trimmed.replace(/\[\[|\]\]|[\[\]()|]/g, ' ');
  for (const tok of flat.split(/[\s/]+/)) {
    if (!tok) continue;
    if (/^@\d+$/.test(tok)) return true;
    if (tok === '||:' || tok === ':||') continue;
    const bare = tok.replace(/^x\d+/, ''); // )xN residue after bracket strip
    if (bare === '') return true;
    if (bare === '_' || /^-+$/.test(bare) || bare === '.') return true;
    if (CLUSTER_RE.test(bare) && [...bare].some((c) => NOTE_CHARS.has(c))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Music line
// ---------------------------------------------------------------------------

function parseMusicLine(text, lineNo, tal, problems, isFree = false) {
  const line = {
    kind: 'music',
    startMatra: 1,
    lineRepeat: false,
    matras: [],
    spans: [],
    phraseRepeats: [],
    lyrics: [],
    bols: [],
    passthrough: [],
    sourceLine: lineNo,
  };
  // Internal (non-model) bar bookkeeping, consumed by lyric attachment.
  const bars = []; // matra counts at each | position
  Object.defineProperty(line, '_bars', { value: bars, enumerable: false });

  let body = text;

  // @N start offset (before ||: when both are present).
  const at = body.match(/^@(\d+)\s*/);
  if (at) {
    line.startMatra = parseInt(at[1], 10) || 1;
    body = body.slice(at[0].length);
  }

  // ||: ... :||
  if (body.startsWith('||:')) {
    if (/:\|\|\s*$/.test(body)) {
      line.lineRepeat = true;
      body = body.slice(3).replace(/:\|\|\s*$/, '');
    } else {
      problems.push({ line: lineNo, col: null, msg: '||: without closing :||' });
      body = body.slice(3);
    }
  }

  // Scanner state.
  let pendingMeendFrom = null; // EventRef awaiting the next note event
  let phraseFrom = null; // matra index where ( opened
  const clusterCtx = {
    line,
    lineNo,
    tal,
    problems,
    notePlaced(ref) {
      if (pendingMeendFrom) {
        line.spans.push({ type: 'meend', from: pendingMeendFrom, to: ref });
        pendingMeendFrom = null;
      }
    },
    setPendingMeend(ref) {
      pendingMeendFrom = ref;
    },
    lastNoteRef() {
      return lastNoteRef(line);
    },
  };

  let i = 0;
  const n = body.length;
  while (i < n) {
    const c = body[i];

    if (c === ' ' || c === '\t' || c === '/') {
      i++;
      continue;
    }

    if (c === '|') {
      bars.push(line.matras.length);
      i++;
      continue;
    }

    if (c === '[' && body[i + 1] === '[') {
      // Krintan span: contents may hold /, spaces, and | (crosses barlines).
      const close = body.indexOf(']]', i + 2);
      if (close === -1) {
        problems.push({ line: lineNo, col: i + 1, msg: '[[ without closing ]]' });
        i += 2;
        continue;
      }
      const inner = body.slice(i + 2, close);
      const beforeMatra = line.matras.length;
      parseTokenRun(inner, i + 2, clusterCtx, bars);
      const afterMatra = line.matras.length;
      if (afterMatra > beforeMatra) {
        const lastM = line.matras[afterMatra - 1];
        line.spans.push({
          type: 'krintan',
          from: { matraIndex: beforeMatra, eventIndex: 0 },
          to: { matraIndex: afterMatra - 1, eventIndex: lastM.events.length - 1 },
        });
      } else {
        problems.push({ line: lineNo, col: i + 1, msg: 'empty krintan [[ ]]' });
      }
      i = close + 2;
      continue;
    }

    if (c === '[') {
      const close = body.indexOf(']', i + 1);
      if (close === -1) {
        problems.push({ line: lineNo, col: i + 1, msg: '[ without closing ]' });
        i++;
        continue;
      }
      const inner = body.slice(i + 1, close);
      buildSlottedMatra(inner, i + 1, clusterCtx);
      i = close + 1;
      continue;
    }

    if (c === '(') {
      if (phraseFrom !== null) {
        problems.push({
          line: lineNo,
          col: i + 1,
          msg: 'nested ( )xN repeats are not supported',
        });
      } else {
        phraseFrom = line.matras.length;
      }
      i++;
      continue;
    }

    if (c === ')') {
      const xm = body.slice(i + 1).match(/^x(\d+)/);
      if (phraseFrom === null) {
        problems.push({ line: lineNo, col: i + 1, msg: ') without opening (' });
        i += xm ? 1 + xm[0].length : 1;
        continue;
      }
      if (!xm) {
        problems.push({ line: lineNo, col: i + 1, msg: ') must be followed by xN' });
        phraseFrom = null;
        i++;
        continue;
      }
      const to = line.matras.length - 1;
      if (to < phraseFrom) {
        problems.push({ line: lineNo, col: i + 1, msg: 'empty ( )xN phrase' });
      } else {
        line.phraseRepeats.push({
          times: parseInt(xm[1], 10),
          fromMatra: phraseFrom,
          toMatra: to,
        });
      }
      phraseFrom = null;
      i += 1 + xm[0].length;
      continue;
    }

    // Plain token: run of non-structural chars.
    let j = i;
    while (j < n && !' \t/|[]()'.includes(body[j])) j++;
    const tok = body.slice(i, j);
    parseToken(tok, i, clusterCtx);
    i = j;
  }

  if (phraseFrom !== null) {
    problems.push({ line: lineNo, col: null, msg: '( without closing )xN' });
  }
  if (pendingMeendFrom !== null) {
    problems.push({ line: lineNo, col: null, msg: '~ slide has no destination note' });
  }

  // Vibhag validation — only when bars were actually typed (spec: | is
  // validated; barless lines are legal scratchpad writing).
  if (tal && bars.length > 0) {
    validateBars(line, bars, tal, lineNo, problems);
  } else if (isFree && bars.length > 0) {
    // Failures narrate: a | in an unmetered section does nothing, so say so.
    problems.push({
      line: lineNo,
      col: null,
      msg: "'|' has no effect here — this section is unmetered (tal: free applies from above). Add a tal: directive above this line to meter it.",
    });
  }

  return line;
}

/** Parse a run of ordinary tokens (used for krintan interiors). */
function parseTokenRun(text, colBase, ctx, bars) {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '/') {
      i++;
      continue;
    }
    if (c === '|') {
      bars.push(ctx.line.matras.length);
      i++;
      continue;
    }
    let j = i;
    while (j < n && !' \t/|'.includes(text[j])) j++;
    parseToken(text.slice(i, j), colBase + i, ctx);
    i = j;
  }
}

// ---------------------------------------------------------------------------
// Tokens → matras
// ---------------------------------------------------------------------------

function parseToken(tok, col, ctx) {
  const { line, lineNo, tal, problems } = ctx;

  if (tok === '') return;

  // Standalone rest.
  if (tok === '.') {
    line.matras.push({ events: [{ type: 'rest', dur: frac(1, 1) }] });
    return;
  }

  // Whole-matra sustains, counting by hyphen.
  if (/^-+$/.test(tok)) {
    for (let k = 0; k < tok.length; k++) {
      line.matras.push({ events: [{ type: 'sustain', dur: frac(1, 1) }] });
    }
    return;
  }

  // Hold to end of vibhag.
  if (tok === '_') {
    let count = 1;
    if (tal) {
      const pos = wrapMatra(tal, line.startMatra + line.matras.length);
      const v = vibhagOfMatra(tal, pos);
      let vibhagStart = 1;
      for (let k = 0; k < v; k++) vibhagStart += tal.vibhags[k];
      const vibhagEnd = vibhagStart + tal.vibhags[v] - 1;
      count = Math.max(1, vibhagEnd - pos + 1);
    }
    for (let k = 0; k < count; k++) {
      const ev = { type: 'sustain', dur: frac(1, 1) };
      if (k === 0) ev.holdToVibhag = true;
      line.matras.push({ events: [ev] });
    }
    return;
  }

  // Cluster (possibly a single note).
  if (!CLUSTER_RE.test(tok)) {
    line.passthrough.push({ col: col + 1, text: tok });
    problems.push({ line: lineNo, col: col + 1, msg: `unrecognized token '${tok}'` });
    return;
  }
  const events = buildClusterEvents(tok, col, ctx, 1);
  if (events) line.matras.push({ events });
}

/**
 * Build one slotted matra from bracket contents: space-separated slots,
 * each slot a cluster string; the matra divides evenly by total slot count.
 */
function buildSlottedMatra(inner, col, ctx) {
  const { line, lineNo, problems } = ctx;
  const slotStrs = inner.split(/[\s/]+/).filter(Boolean);
  if (slotStrs.length === 0) {
    problems.push({ line: lineNo, col: col + 1, msg: 'empty [ ] beat' });
    return;
  }
  // Each slot contributes weight 1 of the matra; a slot may subdivide further.
  const perSlot = [];
  for (const s of slotStrs) {
    if (s === '.') {
      perSlot.push([{ type: 'rest', w: 1 }]);
    } else if (/^-+$/.test(s)) {
      perSlot.push(s.split('').map(() => ({ type: 'dash', w: 1 })));
    } else if (CLUSTER_RE.test(s)) {
      const atoms = clusterAtoms(s, col, ctx);
      if (!atoms) return; // problem already recorded
      perSlot.push(atoms);
    } else {
      line.passthrough.push({ col: col + 1, text: s });
      problems.push({ line: lineNo, col: col + 1, msg: `unrecognized slot '${s}'` });
      return;
    }
  }
  // Normalize slot weights to a common denominator: each slot = 1/slotCount,
  // atoms within a slot split that further.
  const slotCount = perSlot.length;
  const atoms = [];
  for (const slotAtoms of perSlot) {
    const inSlot = slotAtoms.reduce((a, x) => a + x.w, 0);
    for (const a of slotAtoms) atoms.push({ ...a, num: a.w, den: slotCount * inSlot });
  }
  const events = atomsToEvents(atoms, ctx);
  if (events) ctx.line.matras.push({ events });
}

/** Build the events of an unbracketed cluster token. */
function buildClusterEvents(tok, col, ctx) {
  const atoms = clusterAtoms(tok, col, ctx);
  if (!atoms) return null;
  const total = atoms.reduce((a, x) => a + x.w, 0);
  const weighted = atoms.map((a) => ({ ...a, num: a.w, den: total }));
  weighted._tilde = atoms._tilde;
  return atomsToEvents(weighted, ctx);
}

/**
 * Scan a cluster string into atoms: {type: 'note'|'dash', ch, octave, w, tilde…}.
 * Records tilde semantics on ctx via markers; returns null on bad syntax.
 */
function clusterAtoms(tok, col, ctx) {
  const { lineNo, problems, line } = ctx;
  const atoms = [];
  let octave = 0;
  let leadingTilde = false;
  let sawTilde = false;
  let trailingTilde = false;

  for (let i = 0; i < tok.length; i++) {
    const c = tok[i];
    if (c === '~') {
      if (atoms.filter((a) => a.type === 'note').length === 0) leadingTilde = true;
      else if (i === tok.length - 1) trailingTilde = true;
      else sawTilde = true;
      continue;
    }
    if (c === "'") {
      octave += 1;
      continue;
    }
    if (c === '.') {
      octave -= 1;
      continue;
    }
    if (c === '-') {
      if (octave !== 0) {
        problems.push({ line: lineNo, col: col + i + 1, msg: `octave mark binds to no note in '${tok}'` });
        return null;
      }
      const last = atoms[atoms.length - 1];
      if (last) last.w += 1; // extend the previous atom
      else atoms.push({ type: 'dash', w: 1 }); // leading sustain slot(s)
      continue;
    }
    if (NOTE_CHARS.has(c)) {
      atoms.push({ type: 'note', ch: c, octave, w: 1 });
      octave = 0;
      continue;
    }
    problems.push({ line: lineNo, col: col + i + 1, msg: `unrecognized character '${c}' in '${tok}'` });
    line.passthrough.push({ col: col + 1, text: tok });
    return null;
  }
  if (octave !== 0) {
    problems.push({ line: lineNo, col: col + 1, msg: `octave mark binds to no note in '${tok}'` });
    return null;
  }

  atoms._tilde = { leadingTilde, sawTilde, trailingTilde };
  return atoms;
}

/** Convert weighted atoms to model events for one matra, wiring meend spans. */
function atomsToEvents(atoms, ctx) {
  const { line } = ctx;
  const matraIndex = line.matras.length;
  const events = [];
  for (const a of atoms) {
    const dur = fracReduce(frac(a.num, a.den));
    if (a.type === 'note') {
      const ref = { matraIndex, eventIndex: events.length };
      events.push({ type: 'note', dur, ch: a.ch, octave: a.octave });
      ctx.notePlaced(ref); // resolves any pending cross-token meend
    } else if (a.type === 'rest') {
      events.push({ type: 'rest', dur });
    } else if (events.length > 0) {
      // A dash extends the preceding event (note or rest) within the matra.
      const last = events[events.length - 1];
      last.dur = fracAdd(last.dur, dur);
    } else {
      events.push({ type: 'sustain', dur });
    }
  }

  const t = atoms._tilde;
  if (t) {
    const noteIdxs = events
      .map((e, idx) => (e.type === 'note' ? idx : -1))
      .filter((idx) => idx !== -1);
    if (t.trailingTilde && noteIdxs.length > 0) {
      ctx.setPendingMeend({ matraIndex, eventIndex: noteIdxs[noteIdxs.length - 1] });
    }
    if ((t.sawTilde || t.leadingTilde) && noteIdxs.length >= 2) {
      // Slide within/prefixing a cluster covers the cluster.
      line.spans.push({
        type: 'meend',
        from: { matraIndex, eventIndex: noteIdxs[0] },
        to: { matraIndex, eventIndex: noteIdxs[noteIdxs.length - 1] },
      });
    } else if (t.leadingTilde && noteIdxs.length === 1) {
      // Leading tilde on a single note connects from the previous note event.
      const prev = ctx.lastNoteRef(matraIndex, noteIdxs[0]);
      if (prev) {
        line.spans.push({
          type: 'meend',
          from: prev,
          to: { matraIndex, eventIndex: noteIdxs[0] },
        });
      } else {
        ctx.problems.push({
          line: ctx.lineNo,
          col: null,
          msg: '~ slide has no source note before it',
        });
      }
    }
  }
  return events;
}

/** Last note event ref strictly before the current matra's current event. */
function lastNoteRef(line) {
  for (let m = line.matras.length - 1; m >= 0; m--) {
    const evs = line.matras[m].events;
    for (let e = evs.length - 1; e >= 0; e--) {
      if (evs[e].type === 'note') return { matraIndex: m, eventIndex: e };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bars → vibhag validation ("line 4, vibhag 2 has 5 matras")
// ---------------------------------------------------------------------------

function validateBars(line, bars, tal, lineNo, problems) {
  // Bar positions (in matra counts) → segment lengths, dropping empty
  // leading/trailing segments from tolerated leading/trailing bars.
  const cuts = [0, ...bars, line.matras.length];
  const segments = [];
  for (let i = 1; i < cuts.length; i++) {
    const len = cuts[i] - cuts[i - 1];
    if (len > 0 || (i > 1 && i < cuts.length - 1)) segments.push(len);
  }
  let pos = wrapMatra(tal, line.startMatra);
  for (let i = 0; i < segments.length; i++) {
    const got = segments[i];
    const v = vibhagOfMatra(tal, pos);
    let vibhagStart = 1;
    for (let k = 0; k < v; k++) vibhagStart += tal.vibhags[k];
    const expected = vibhagStart + tal.vibhags[v] - pos;
    const isLast = i === segments.length - 1;
    if (got !== expected && !(isLast && got < expected)) {
      problems.push({
        line: lineNo,
        col: null,
        msg: `vibhag ${v + 1} has ${got} matras, expected ${expected}`,
      });
      // Resync: assume the typed bar is where the writer meant the vibhag
      // to end, so later segments are judged on their own terms.
      pos = wrapMatra(tal, vibhagStart + tal.vibhags[v]);
    } else {
      pos = wrapMatra(tal, pos + got);
    }
  }
}

// ---------------------------------------------------------------------------
// Lyric attachment (spec §3.7)
// ---------------------------------------------------------------------------

function attachLyrics(musicLine, text, lineNo, problems) {
  const bars = musicLine._bars || [];
  const struck = (from, to) => {
    const out = [];
    for (let m = from; m < to; m++) {
      const ev = musicLine.matras[m]?.events[0];
      if (ev && ev.type === 'note') out.push(m);
    }
    return out;
  };

  let musicSegs;
  let lyricSegs;
  if (text.includes('|')) {
    lyricSegs = text.split('|').map((s) => s.trim());
    const cuts = [0, ...bars, musicLine.matras.length];
    musicSegs = [];
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i] > cuts[i - 1]) musicSegs.push([cuts[i - 1], cuts[i]]);
    }
    if (lyricSegs.length !== musicSegs.length) {
      problems.push({
        line: lineNo,
        col: null,
        msg: `lyric line has ${lyricSegs.length} bar segments, music has ${musicSegs.length} — attaching across the whole line`,
      });
      lyricSegs = [text.replace(/\|/g, ' ').trim()];
      musicSegs = [[0, musicLine.matras.length]];
    }
  } else {
    lyricSegs = [text.trim()];
    musicSegs = [[0, musicLine.matras.length]];
  }

  for (let s = 0; s < lyricSegs.length; s++) {
    const tokens = lyricSegs[s].split(/\s+/).filter(Boolean);
    const targets = struck(musicSegs[s][0], musicSegs[s][1]);
    let t = 0;
    for (const tok of tokens) {
      if (t >= targets.length) {
        problems.push({
          line: lineNo,
          col: null,
          msg: `more syllables than struck notes in segment ${s + 1}`,
        });
        break;
      }
      if (tok === '.') {
        t++; // explicit skip
        continue;
      }
      musicLine.lyrics.push({ matraIndex: targets[t], text: tok });
      t++;
    }
  }
}

// ---------------------------------------------------------------------------
// Bol attachment (spec §3.8)
// ---------------------------------------------------------------------------

function attachBols(musicLine, text, lineNo, problems) {
  const noteRefs = [];
  musicLine.matras.forEach((m, mi) => {
    m.events.forEach((e, ei) => {
      if (e.type === 'note') noteRefs.push({ matraIndex: mi, eventIndex: ei });
    });
  });
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  let t = 0;
  for (const tok of tokens) {
    if (t >= noteRefs.length) {
      problems.push({ line: lineNo, col: null, msg: 'more bol marks than note events' });
      break;
    }
    if (tok === '.') {
      t++; // explicit gap: this note event carries no mark (spec §3.8)
      continue;
    }
    const mark = BOL_MARKS[tok];
    if (!mark) {
      problems.push({
        line: lineNo,
        col: null,
        msg: `unrecognized bol mark '${tok}' — use da, ra, diri, chikari, or . for a gap`,
      });
      continue;
    }
    musicLine.bols.push({ ref: noteRefs[t], mark });
    t++;
  }
}
