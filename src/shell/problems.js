// src/shell/problems.js — presentation helpers for parser diagnostics.
// Parsing remains authoritative in engine/parse.js; this module only groups
// repeated notices and rewrites a few common messages for human readability.

export function problemSummary(count) {
  return count === 1 ? '1 notation issue' : `${count} notation issues`;
}

export function friendlyProblemMessage(message) {
  const text = String(message || 'Unknown notation issue');

  let match = /^vibhag (\d+) has (\d+) matras, expected (\d+)$/.exec(text);
  if (match) {
    return `Division ${match[1]} has ${match[2]} beats; this tal expects ${match[3]}.`;
  }

  match = /^unrecognized token '([^']+)'$/.exec(text);
  if (match) {
    return `Sargam did not recognize “${match[1]}” as notation on this line.`;
  }

  match = /^return cue '([^']+)' must be the final token on the line$/.exec(text);
  if (match) {
    return `“${match[1]}” is a return instruction and must sit at the end of the line.`;
  }

  match = /^return cue '([^']+)' has no preceding ([^ ]+) section$/.exec(text);
  if (match) {
    return `This line says to return to ${match[1]}, but no earlier ${match[2]} section was found.`;
  }

  return text;
}

export function groupProblems(problems = []) {
  const groups = [];
  const byKey = new Map();

  for (const problem of problems) {
    const line = Number(problem?.line) || 0;
    const col = problem?.col == null ? null : Number(problem.col);
    const message = String(problem?.msg || 'Unknown notation issue');
    const key = JSON.stringify([line, col, message]);
    const existing = byKey.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    const group = {
      line,
      col: Number.isFinite(col) ? col : null,
      message,
      displayMessage: friendlyProblemMessage(message),
      count: 1,
    };
    byKey.set(key, group);
    groups.push(group);
  }

  return groups;
}

// Return absolute textarea offsets for a parser Problem. A precise column
// selects the offending token when possible; a line-only problem selects the
// complete source line. The function is pure so cursor navigation is smokeable.
export function problemSelectionRange(text, problem = {}) {
  const source = typeof text === 'string' ? text : '';
  const requestedLine = Math.max(1, Number(problem.line) || 1);

  let lineStart = 0;
  let lineNumber = 1;
  while (lineNumber < requestedLine && lineStart < source.length) {
    const newline = source.indexOf('\n', lineStart);
    if (newline === -1) {
      lineStart = source.length;
      break;
    }
    lineStart = newline + 1;
    lineNumber += 1;
  }

  const newline = source.indexOf('\n', lineStart);
  const lineEnd = newline === -1 ? source.length : newline;

  if (problem.col == null || !Number.isFinite(Number(problem.col))) {
    return { start: lineStart, end: lineEnd };
  }

  let start = lineStart + Math.max(0, Number(problem.col) - 1);
  start = Math.min(Math.max(start, lineStart), lineEnd);

  const rawMessage = String(problem.msg || problem.message || '');
  const quoted = /^unrecognized token '([^']+)'$/.exec(rawMessage);
  if (quoted && source.slice(start, start + quoted[1].length) === quoted[1]) {
    return { start, end: Math.min(lineEnd, start + quoted[1].length) };
  }

  if (start >= lineEnd) {
    return { start: lineStart, end: lineEnd };
  }

  let end = start;
  while (end < lineEnd && !/[\s|\[\](){}]/.test(source[end])) end += 1;
  if (end === start) end = Math.min(lineEnd, start + 1);
  return { start, end };
}

