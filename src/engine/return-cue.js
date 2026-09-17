// src/engine/return-cue.js — terminal Gat cue grammar.
// `gat@8..@1` replays only the target Gat range beginning at matra 8 and
// stopping before the next matra 1, then resumes the next written line.

const TOKEN_RE = /^([A-Za-z][A-Za-z0-9_-]*)(?:@(\d+(?:\.5)?)(?:\.\.@(\d+(?:\.5)?))?|!)?$/;

export function parseReturnCueToken(token, tal = null) {
  const text = String(token || '').trim();
  const match = text.match(TOKEN_RE);
  if (!match || match[1].toLowerCase() !== 'gat') return null;
  if (text.endsWith('!')) return { ok: true, cue: { target: 'gat', mode: 'full' } };
  const start = match[2] === undefined ? null : Number(match[2]);
  const stop = match[3] === undefined ? null : Number(match[3]);
  const validMatra = (value) => Number.isFinite(value) && Number.isInteger(value * 2) && value >= 1 && (!tal || value < tal.matras + 1);
  if (start !== null && !validMatra(start)) {
    return { ok: false, message: tal ? `gat@${match[2]} is outside ${tal.name}'s 1–${tal.matras} matra cycle` : `gat@${match[2]} needs a positive matra number` };
  }
  if (stop !== null && !validMatra(stop)) {
    return { ok: false, message: tal ? `gat range stop @${match[3]} is outside ${tal.name}'s 1–${tal.matras} matra cycle` : `gat range stop @${match[3]} needs a positive matra number` };
  }
  if (start !== null && stop !== null) {
    if (start === stop) return { ok: false, message: `gat@${start}..@${stop} has no playable range` };
    return { ok: true, cue: { target: 'gat', mode: 'range', matra: start, stopMatra: stop } };
  }
  if (start !== null) return { ok: true, cue: { target: 'gat', mode: 'matra', matra: start } };
  return { ok: true, cue: { target: 'gat', mode: 'align' } };
}

export function extractTerminalReturnCue(body, tal, lineNo, problems) {
  const match = String(body).match(/(?:^|[\s|])(gat(?:@\d+(?:\.5)?(?:\.\.@\d+(?:\.5)?)?|!)?)\s*$/i);
  if (!match) return null;
  const token = match[1];
  const cueOffset = match[0].toLowerCase().indexOf('gat');
  const cueStart = (match.index ?? 0) + cueOffset;
  const parsed = parseReturnCueToken(token, tal);
  if (!parsed?.ok) {
    problems.push({ line: lineNo, col: cueStart + 1, msg: parsed?.message || `invalid return cue '${token}'` });
    return { cueStart, cue: null };
  }
  return { cueStart, cue: parsed.cue };
}

export function isReturnCueToken(token) {
  return /^gat(?:@\d+(?:\.5)?(?:\.\.@\d+(?:\.5)?)?|!)?$/i.test(String(token || ''));
}

export function serializeReturnCue(cue) {
  if (!cue?.target) return '';
  if (cue.mode === 'full') return `${cue.target}!`;
  if (cue.mode === 'range' && Number.isFinite(cue.matra) && Number.isFinite(cue.stopMatra)) {
    return `${cue.target}@${cue.matra}..@${cue.stopMatra}`;
  }
  if (cue.mode === 'matra' && Number.isFinite(cue.matra)) return `${cue.target}@${cue.matra}`;
  return cue.target;
}
