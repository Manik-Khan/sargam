// SARGAM_SOFT_BARS_NAVIGATION_V4_2026_07_18
// SARGAM_NOTATION_STRUCTURE_WAVE_2026_07_18
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
import { scanRepeatedSlideAt } from './repeated-slide.js';
import { extractTerminalReturnCue, isReturnCueToken } from './return-cue.js';

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
  let nextStart = null; // avartan continuation within the current section
  let missingTalReported = false;
  let inAnchorMetadata = false;

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
    // SARGAM_ANCHOR_METADATA_SKIP — generated structure is portable in
    // Markdown but is not music, a label, a directive, or a bol line.
    if (inAnchorMetadata) {
      if (trimmed === '-->') inAnchorMetadata = false;
      continue;
    }
    if (trimmed.startsWith('<!-- sargam-anchors:v1')) {
      inAnchorMetadata = !trimmed.endsWith('-->');
      continue;
    }

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
    // SARGAM_METER_LANE_SKIP — generated local-meter metadata belongs to
    // the preceding music line. meter.js parses it separately; it must not
    // be mistaken for a bol line merely because both begin with >.
    if (trimmed.startsWith('>>')) continue;

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
      nextStart = null; // a new section resets the cycle to sam
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
    const music = parseMusicLine(trimmed, lineNo, tal, problems, currentTal === 'free', nextStart);
    currentSection.lines.push(music);
    lastMusicLine = music;
    // Continuation is based on the WRITTEN matras (a ||: :|| repeat's
    // second pass doesn't shift where the next written line sits on the
    // page — the notation continues from the ink, not the performance).
    if (tal && music.matras.length > 0) {
      nextStart = wrapMatra(tal, music.startMatra + music.matras.length);
    }
  }

  resolveReturnCues(doc, problems);
  return { doc, problems };
}

/** Bind each terminal cue to the nearest PRECEDING matching section. */
function resolveReturnCues(doc, problems) {
  const previous = new Map();
  const normalize = (value) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.:]+$/, '');

  (doc.sections || []).forEach((section, sectionIndex) => {
    for (const line of section.lines || []) {
      const cue = line.returnCue;
      if (!cue) continue;
      const targetSectionIndex = previous.get(normalize(cue.target));
      if (targetSectionIndex === undefined) {
        problems.push({
          line: line.sourceLine,
          col: null,
          msg: `return cue '${cue.target}' has no preceding ${cue.target} section`,
        });
      } else {
        cue.targetSectionIndex = targetSectionIndex;
      }
    }
    const label = normalize(section.label);
    if (label) previous.set(label, sectionIndex);
  });
}

// ---------------------------------------------------------------------------
// Music vs label heuristic: music iff at least one token is valid music.
// ---------------------------------------------------------------------------

function looksLikeMusic(trimmed) {
  const flat = trimmed.replace(/\[\[|\]\]|[\[\](){}|]/g, ' ');
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

function parseMusicLine(text, lineNo, tal, problems, isFree = false, defaultStart = null) {
  const line = {
    kind: 'music',
    startMatra: 1,
    lineRepeat: false,
    firstEndingFrom: null, // 0-based matra where |1 begins
    returnCue: null, // terminal gat / gat@N / gat!: aligned, explicit, or full Gat return
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

  // @N start offset (before ||: when both are present) — the explicit
  // override. Without it, a metered line CONTINUES its section's cycle
  // (defaultStart), because the avartan does not restart at a written
  // line break — the tradition's own convention, and M's ruling
  // 2026-07-16 ("doesn't count the 'S as the 6th beat" without @6).
  const at = body.match(/^@(\d+)\s*/);
  if (at) {
    line.startMatra = parseInt(at[1], 10) || 1;
    line.explicitStart = true;
    body = body.slice(at[0].length);
  } else if (defaultStart !== null) {
    line.startMatra = defaultStart;
  }

  // Terminal Gat return cues are zero-time structure, not note tokens:
  //   gat     align to the cycle position where this line lands
  //   gat@N   enter the Gat explicitly at cycle matra N
  //   gat!    replay the complete Gat from its written beginning
  // Only the final token is structural; an interior form receives a precise
  // clickable diagnostic in parseToken.
  // SARGAM_REPEATED_APPROACH_SLIDE_2026_07_20
  const returnResult = extractTerminalReturnCue(body, tal, lineNo, problems);
  if (returnResult) {
    line.returnCue = returnResult.cue;
    body = body.slice(0, returnResult.cueStart).trimEnd();
  }
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
  let bracketTilde = false; // a `~` consumed just before a [ or [[
  let pendingGraces = null; // {atoms, col} — `{run} ` awaiting its note (cross-beat kan)
  let phraseFrom = null; // matra index where ( opened
  let rangedSlideFrom = null; // matra index where ~( opened
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
    takePendingGraces() {
      const p = pendingGraces;
      pendingGraces = null;
      return p ? p.atoms : null;
    },
    peekPendingGraces() {
      return pendingGraces;
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
  // Watchdog. Every branch below must advance `i`; one that didn't froze
  // the browser hard (M, 2026-07-16) because parse runs on every keystroke.
  // This converts any future non-advancing branch into a narrated problem
  // instead of a hang: the engine's contract is that it never throws, and
  // a frozen page is worse than either. The bound is generous — the scanner
  // consumes at least one character per iteration when healthy.
  let guard = n * 4 + 64;
  while (i < n) {
    if (--guard < 0) {
      problems.push({
        line: lineNo,
        col: null,
        msg: 'internal: the parser stopped making progress on this line and gave up — please report it',
      });
      break;
    }
    const c = body[i];

    if (c === ' ' || c === '\t' || c === '/') {
      i++;
      continue;
    }

    // |1 begins first-pass-only material inside a repeated line. It also
    // records a soft phrase boundary for source/lyric alignment; tala divisions
    // are derived independently from tal + @N + counted matras.
    if (c === '|' && body[i + 1] === '1' && !/\d/.test(body[i + 2] || '')) {
      bars.push(line.matras.length);
      if (line.firstEndingFrom !== null) {
        problems.push({ line: lineNo, col: i + 1, msg: 'only one |1 first ending is supported on a line' });
      } else {
        line.firstEndingFrom = line.matras.length;
      }
      i += 2;
      continue;
    }
    if (c === '|') {
      bars.push(line.matras.length);
      i++;
      continue;
    }

    // A ranged slide keeps its written rhythm while drawing one arc from the
    // first note after ~( to the last note before ). Parentheses without ~
    // remain phrase-repeat syntax and still require xN.
    if (c === '~' && body[i + 1] === '(') {
      if (rangedSlideFrom !== null || phraseFrom !== null) {
        problems.push({ line: lineNo, col: i + 1, msg: 'nested slide/repeat parentheses are not supported' });
      } else {
        rangedSlideFrom = line.matras.length;
      }
      i += 2;
      continue;
    }

    // `~` immediately before a bracket prefixes that matra, exactly as it
    // prefixes a cluster (`~SR`, spec §3): the arc covers the bracket. It is
    // consumed here so it can never become a token of its own — a lone `~`
    // used to build an EMPTY matra, which shifted every matra after it and
    // broke spec principle 4 ("~ never affects rhythm"). M, 2026-07-16.
    if (c === '~' && body[i + 1] === '[') {
      bracketTilde = true;
      i++;
      continue;
    }

    if (c === '[' && body[i + 1] === '[') {
      // Krintan span: contents may hold /, spaces, and | (crosses barlines).
      const close = body.indexOf(']]', i + 2);
      if (close === -1) {
        problems.push({ line: lineNo, col: i + 1, msg: '[[ without closing ]]' });
        i += 2;
        bracketTilde = false;
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
        if (bracketTilde) addMeendOverMatras(line, beforeMatra, afterMatra - 1);
      } else {
        problems.push({ line: lineNo, col: i + 1, msg: 'empty krintan [[ ]]' });
      }
      bracketTilde = false;
      i = close + 2;
      continue;
    }

    if (c === '[') {
      const close = body.indexOf(']', i + 1);
      if (close === -1) {
        problems.push({ line: lineNo, col: i + 1, msg: '[ without closing ]' });
        i++;
        bracketTilde = false;
        continue;
      }
      const inner = body.slice(i + 1, close);
      const beforeMatra = line.matras.length;
      buildSlottedMatra(inner, i + 1, clusterCtx);
      if (bracketTilde && line.matras.length > beforeMatra) {
        addMeendOverMatras(line, beforeMatra, line.matras.length - 1);
      }
      bracketTilde = false;
      i = close + 1;
      continue;
    }

    // `{graces}X` — the ornament (M's grammar, 2026-07-16). The braces hold
    // the grace run; the cluster immediately after the closing brace is the
    // destination and owns the beat. Spaces and / inside the braces are
    // allowed and ignored — it is one ornament either way.
    // A sequence such as {n~}D--{n~}D is one written matra.
    // Each destination keeps the D--D slot ratio; its own n→D approach
    // adds no grid duration and no separate strike.
    const repeatedSlide = scanRepeatedSlideAt(body, i);
    if (repeatedSlide) {
      const matraIndex = line.matras.length;
      line.matras.push({ events: repeatedSlide.events });
      repeatedSlide.events.forEach((event, eventIndex) => {
        if (event.type === 'note') clusterCtx.notePlaced({ matraIndex, eventIndex });
      });
      i = repeatedSlide.next;
      continue;
    }
    if (c === '{') {
      const close = body.indexOf('}', i + 1);
      if (close === -1) {
        problems.push({ line: lineNo, col: i + 1, msg: '{ without closing }' });
        i++;
        continue;
      }
      const inner = body.slice(i + 1, close).replace(/[\s/]+/g, '');
      // Destination: the plain-token run right after the closing brace.
      let j = close + 1;
      while (j < n && !' \t/|[](){}'.includes(body[j])) j++;
      const destTok = body.slice(close + 1, j);
      if (inner === '') {
        problems.push({ line: lineNo, col: i + 1, msg: 'empty ornament { }' });
        i = close + 1;
        continue;
      }
      if (destTok === '' || !CLUSTER_RE.test(destTok)) {
        // Spaced form `{run} X` — the graces attach FORWARD to the next
        // note token, sounding before its beat (cross-beat kan, M's second
        // ruling 2026-07-16). Pend them; line end with no taker narrates.
        const ga = clusterAtoms(inner, i + 1, clusterCtx);
        if (ga) {
          if (ga.some((a) => a.type !== 'note')) {
            problems.push({ line: lineNo, col: i + 1, msg: 'a - has no meaning in a grace run — graces carry no time to extend' });
          } else {
            for (const a of ga) a.preBeat = true;
            pendingGraces = pendingGraces ? { atoms: [...pendingGraces.atoms, ...ga], col: pendingGraces.col } : { atoms: ga, col: i + 1 };
          }
        }
        i = close + 1;
        continue;
      }
      const graceAtoms = clusterAtoms(inner, i + 1, clusterCtx);
      const destAtoms = clusterAtoms(destTok, close + 2, clusterCtx);
      if (graceAtoms && destAtoms) {
        const pend = pendingGraces ? pendingGraces.atoms : [];
        pendingGraces = null;
        const combined = [...pend, ...graceAtoms, ...destAtoms];
        combined._tilde = destAtoms._tilde; // trailing tilde still crosses matras
        const events = weightAndBuild(combined, pend.length + graceAtoms.length, i + 1, clusterCtx);
        if (events && events.length > 0) line.matras.push({ events });
      }
      i = j;
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
      if (rangedSlideFrom !== null) {
        const to = line.matras.length - 1;
        if (to < rangedSlideFrom) {
          problems.push({ line: lineNo, col: i + 1, msg: 'empty ~( ) slide' });
        } else {
          const before = line.spans.length;
          addMeendOverMatras(line, rangedSlideFrom, to, true);
          if (line.spans.length === before) {
            problems.push({ line: lineNo, col: i + 1, msg: '~( ) needs a note at both ends of the slide' });
          }
        }
        rangedSlideFrom = null;
        i++;
        continue;
      }
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
    while (j < n && !' \t/|[](){}'.includes(body[j])) j++;
    if (j === i) {
      // A structural character reached the token reader without any branch
      // above consuming it — a stray ']' or ')'. Narrate it and step over.
      //
      // Before 2026-07-16 this produced an empty token and then `i = j`
      // reassigned `i` to itself: an infinite loop on a single character,
      // which froze the browser on every keystroke. Typing `[[DP]]` passes
      // through `[[DP]`, which leaves exactly this stray, so the app died
      // mid-word and could only be recovered by reloading the page. (M)
      problems.push({
        line: lineNo,
        col: i + 1,
        msg: `unexpected '${body[i]}' — no matching opener`,
      });
      i++;
      continue;
    }
    const tok = body.slice(i, j);
    parseToken(tok, i, clusterCtx);
    i = j;
  }

  if (rangedSlideFrom !== null) {
    problems.push({ line: lineNo, col: null, msg: '~( without closing )' });
  }
  if (phraseFrom !== null) {
    problems.push({ line: lineNo, col: null, msg: '( without closing )xN' });
  }
  if (pendingMeendFrom !== null) {
    problems.push({ line: lineNo, col: null, msg: '~ slide has no destination note' });
  }
  if (pendingGraces !== null) {
    problems.push({
      line: lineNo,
      col: pendingGraces.col,
      msg: 'ornament has no destination note — the graces never found a note to land on',
    });
  }

  if (line.firstEndingFrom !== null) {
    if (!line.lineRepeat) {
      problems.push({ line: lineNo, col: null, msg: '|1 first ending requires ||: ... :||' });
    }
    if (line.firstEndingFrom <= 0) {
      problems.push({ line: lineNo, col: null, msg: '|1 needs common repeated material before the first ending' });
    }
    if (line.firstEndingFrom >= line.matras.length) {
      problems.push({ line: lineNo, col: null, msg: '|1 first ending is empty' });
    }
  }

  // SARGAM_SOFT_BARS_NAVIGATION_V4_2026_07_18: Written | characters are soft phrase dividers. They remain in
  // line._bars for source grouping and lyric/bol alignment, but they do not
  // assert tala-vibhag boundaries. True tala positions come from the selected
  // tal, the line's @N start, and the counted matras.
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

  // Gat return forms are structural only as the final token. Keeping this
  // diagnostic in the token parser makes an accidental interior cue exact.
  if (isReturnCueToken(tok)) {
    line.passthrough.push({ col: col + 1, text: tok });
    problems.push({
      line: lineNo,
      col: col + 1,
      msg: `return cue '${tok}' must be the final token on the line`,
    });
    return;
  }

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
  // A token that yields no events (a lone `~`) must never push a matra:
  // `~` is an annotation and cannot affect rhythm (spec principle 4).
  // Silently, this used to insert an empty matra and shift the rest of the
  // line — the cause of phantom vibhag errors. M, 2026-07-16.
  if (events && events.length > 0) {
    line.matras.push({ events });
  } else if (events) {
    problems.push({
      line: lineNo,
      col: col + 1,
      msg: `'${tok}' has no note to slide — a ~ must touch the notes it connects, as in ~mg or m~g`,
    });
  }
}

/**
 * Draw a meend from the first note of matra `fromM` to the last note of
 * matra `toM`. Used when a `~` prefixes a bracket — the arc covers the
 * bracket, mirroring `~SR` covering a cluster (spec §3). No-op when there
 * aren't two notes to connect, so it can never invent a span.
 */
function addMeendOverMatras(line, fromM, toM, ranged = false) {
  const firstEvs = line.matras[fromM]?.events || [];
  const lastEvs = line.matras[toM]?.events || [];
  const first = firstEvs.findIndex((e) => e.type === 'note');
  let last = -1;
  for (let i = lastEvs.length - 1; i >= 0; i--) {
    if (lastEvs[i].type === 'note') {
      last = i;
      break;
    }
  }
  if (first === -1 || last === -1) return;
  if (fromM === toM && first === last) return; // one note connects to nothing
  const span = {
    type: 'meend',
    from: { matraIndex: fromM, eventIndex: first },
    to: { matraIndex: toM, eventIndex: last },
  };
  if (ranged) span.ranged = true;
  line.spans.push(span);
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
  // Tildes written inside the bracket were silently dropped before
  // 2026-07-16 (M). They're gathered across the slots and applied to the
  // finished matra, so `[~m g]`, `[m~ g]` and `[m ~g]` all read as
  // "this bracket is a slide" — the same as `~[m g]`.
  const tilde = { leadingTilde: false, sawTilde: false, trailingTilde: false };
  for (let si = 0; si < slotStrs.length; si++) {
    const s = slotStrs[si];
    if (s === '.') {
      perSlot.push([{ type: 'rest', w: 1 }]);
    } else if (/^-+$/.test(s)) {
      perSlot.push(s.split('').map(() => ({ type: 'dash', w: 1 })));
    } else if (CLUSTER_RE.test(s)) {
      const atoms = clusterAtoms(s, col, ctx);
      if (!atoms) return; // problem already recorded
      const t = atoms._tilde;
      if (t) {
        if (t.leadingTilde || t.sawTilde) tilde.sawTilde = true;
        // A trailing tilde only reaches past the bracket from the LAST
        // slot; on any earlier slot it connects to the next slot inside.
        if (t.trailingTilde) {
          if (si === slotStrs.length - 1) tilde.trailingTilde = true;
          else tilde.sawTilde = true;
        }
      }
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
  atoms._tilde = tilde;
  const events = atomsToEvents(atoms, ctx);
  if (events) ctx.line.matras.push({ events });
}

/** Build the events of an unbracketed cluster token. */
function buildClusterEvents(tok, col, ctx) {
  const atoms = clusterAtoms(tok, col, ctx);
  if (!atoms) return null;
  const pend = ctx.takePendingGraces ? ctx.takePendingGraces() : null;
  if (pend && pend.length > 0) {
    const combined = [...pend, ...atoms];
    combined._tilde = atoms._tilde;
    const kb = atoms._tilde?.kanBoundary ?? -1;
    // pending graces sit before everything; the token's own kan boundary
    // (if any) shifts by their count.
    return weightAndBuild(combined, pend.length + (kb > 0 ? kb : 0), col, ctx);
  }
  return weightAndBuild(atoms, atoms._tilde?.kanBoundary ?? -1, col, ctx);
}

/**
 * Shared atom pipeline for cluster and brace forms. Atoms before
 * `kanBoundary` are the grace run (no metric time, spec: the destination
 * owns the beat); atoms from the boundary split the beat as usual.
 */
function weightAndBuild(atoms, kanBoundary, col, ctx) {
  const { lineNo, problems } = ctx;
  if (kanBoundary <= 0) {
    const total = atoms.reduce((a, x) => a + x.w, 0);
    const weighted = atoms.map((a) => ({ ...a, num: a.w, den: total }));
    weighted._tilde = atoms._tilde;
    return atomsToEvents(weighted, ctx);
  }
  const graces = atoms.slice(0, kanBoundary);
  const timed = atoms.slice(kanBoundary);
  if (graces.some((a) => a.type !== 'note')) {
    problems.push({
      line: lineNo,
      col: col + 1,
      msg: 'a - has no meaning in a grace run — graces carry no time to extend',
    });
    return null;
  }
  if (!timed.some((a) => a.type === 'note')) {
    problems.push({ line: lineNo, col: col + 1, msg: 'ornament has no destination note' });
    return null;
  }
  const total = timed.reduce((a, x) => a + x.w, 0);
  const weighted = [
    ...graces.map((a) => ({ ...a, grace: true, num: 0, den: 1 })),
    ...timed.map((a) => ({ ...a, num: a.w, den: total })),
  ];
  weighted._tilde = atoms._tilde;
  weighted._kanGraces = graces.length;
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
  let sawTilde = false; // retained for leading-covering meend semantics
  let trailingTilde = false;
  let kanBoundary = -1; // atoms index after the LAST internal tilde (kan)

  for (let i = 0; i < tok.length; i++) {
    const c = tok[i];
    if (c === '~') {
      if (atoms.filter((a) => a.type === 'note').length === 0) leadingTilde = true;
      else if (i === tok.length - 1) trailingTilde = true;
      else kanBoundary = atoms.length; // kan: notes so far are grace (M's grammar)
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

  atoms._tilde = { leadingTilde, sawTilde, trailingTilde, kanBoundary };
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
      const ev = { type: 'note', dur, ch: a.ch, octave: a.octave };
      // Explicit internal dashes are print-bearing rhythmic slots. Duration
      // alone cannot preserve `g---` because 4/4 reduces to one whole beat.
      if (!a.grace && a.w > 1) ev.writtenSlots = a.w;
      if (a.grace) ev.grace = true;
      if (a.preBeat) ev.preBeat = true;
      events.push(ev);
      // Graces never resolve a pending cross-matra meend — a slide written
      // before an ornament lands on the ornament's destination, not its
      // decoration.
      if (!a.grace) ctx.notePlaced(ref);
    } else if (a.type === 'rest') {
      const ev = { type: 'rest', dur };
      if (a.w > 1) ev.writtenSlots = a.w;
      events.push(ev);
    } else if (events.length > 0) {
      // A dash extends the preceding event (note or rest) within the matra.
      // Preserve the written slot as well as merging its playback duration.
      const last = events[events.length - 1];
      last.dur = fracAdd(last.dur, dur);
      last.writtenSlots = (last.writtenSlots ?? 1) + (a.w ?? 1);
    } else {
      const ev = { type: 'sustain', dur };
      if (a.w > 1) ev.writtenSlots = a.w;
      events.push(ev);
    }
  }

  // Kan span: the connecting curve from the first grace to the destination
  // (the first timed note after the grace run).
  if (atoms._kanGraces > 0) {
    const destIdx = events.findIndex((e) => e.type === 'note' && !e.grace);
    if (destIdx !== -1) {
      line.spans.push({
        type: 'kan',
        from: { matraIndex, eventIndex: 0 },
        to: { matraIndex, eventIndex: destIdx },
      });
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
