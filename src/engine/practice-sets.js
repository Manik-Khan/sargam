// src/engine/practice-sets.js — pure, versioned contracts for recorded-clip
// practice routines. This module deliberately knows nothing about React,
// Audio elements, Vilambit, project folders, or browser APIs.

export const PRACTICE_SET_VERSION = 1;
export const PRACTICE_MODES = Object.freeze(['sequence', 'shuffle']);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const positiveInt = (value, fallback, max = 10000) =>
  clamp(Math.round(finite(value, fallback)), 1, max);
const text = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;

function normalizeSpeed(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const startPercent = clamp(Math.round(finite(source.startPercent, 100)), 25, 200);
  const endPercent = clamp(Math.round(finite(source.endPercent, startPercent)), 25, 200);
  return {
    startPercent,
    endPercent,
    stepPercent: clamp(Math.round(Math.abs(finite(source.stepPercent, 5))), 1, 100),
    changeEveryRepetitions: positiveInt(source.changeEveryRepetitions, 1, 1000),
  };
}

export function normalizePracticeStep(value, index = 0) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const audioLinkId = text(source.audioLinkId);
  if (!audioLinkId) {
    return { ok: false, problem: `Practice step ${index + 1} does not name an audioLinkId.` };
  }

  const rawTarget = source.target && typeof source.target === 'object' && !Array.isArray(source.target)
    ? source.target
    : {};
  const target = rawTarget.kind === 'minutes'
    ? {
        kind: 'minutes',
        minutes: clamp(finite(rawTarget.minutes, 1), 0.1, 240),
      }
    : {
        kind: 'repetitions',
        count: positiveInt(rawTarget.count, 5, 10000),
      };

  return {
    ok: true,
    step: {
      id: text(source.id, `step-${index + 1}`),
      audioLinkId,
      label: text(source.label),
      target,
      speed: normalizeSpeed(source.speed),
      restSeconds: clamp(finite(source.restSeconds, 0), 0, 300),
    },
  };
}

export function normalizePracticeSet(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, problems: ['Practice set must be an object.'], set: null };
  }
  if (value.version != null && Number(value.version) !== PRACTICE_SET_VERSION) {
    return {
      ok: false,
      problems: [`Unsupported practice-set version ${value.version}.`],
      set: null,
    };
  }

  const problems = [];
  const steps = [];
  for (const [index, raw] of (Array.isArray(value.steps) ? value.steps : []).entries()) {
    const result = normalizePracticeStep(raw, index);
    if (result.ok) steps.push(result.step);
    else problems.push(result.problem);
  }
  if (!steps.length) problems.push('Practice set must contain at least one valid step.');

  return {
    ok: problems.length === 0,
    problems,
    set: {
      version: PRACTICE_SET_VERSION,
      id: text(value.id, 'practice-set-1'),
      name: text(value.name, 'Practice Set'),
      mode: PRACTICE_MODES.includes(value.mode) ? value.mode : 'sequence',
      repeatSet: positiveInt(value.repeatSet, 1, 1000),
      steps,
    },
  };
}

export function speedForPracticePass(step, passIndex) {
  const normalized = normalizePracticeStep(step);
  if (!normalized.ok) return 100;
  const speed = normalized.step.speed;
  const direction = Math.sign(speed.endPercent - speed.startPercent);
  if (direction === 0) return speed.startPercent;
  const increments = Math.floor(Math.max(0, Number(passIndex) || 0) / speed.changeEveryRepetitions);
  const candidate = speed.startPercent + direction * speed.stepPercent * increments;
  return direction > 0
    ? Math.min(candidate, speed.endPercent)
    : Math.max(candidate, speed.endPercent);
}

export function planPracticeStep(step, { clipDurationSeconds, maxPasses = 10000 } = {}) {
  const normalized = normalizePracticeStep(step);
  if (!normalized.ok) return { ok: false, problem: normalized.problem, passes: [] };
  const duration = finite(clipDurationSeconds);
  if (!(duration > 0)) {
    return { ok: false, problem: 'A positive clip duration is required to plan this step.', passes: [] };
  }

  const item = normalized.step;
  const passes = [];
  let elapsedSeconds = 0;
  const hardCap = positiveInt(maxPasses, 10000, 100000);
  const targetSeconds = item.target.kind === 'minutes' ? item.target.minutes * 60 : null;
  const targetCount = item.target.kind === 'repetitions' ? item.target.count : hardCap;

  for (let index = 0; index < hardCap && index < targetCount; index++) {
    const speedPercent = speedForPracticePass(item, index);
    const playSeconds = duration / (speedPercent / 100);
    const totalSeconds = playSeconds + item.restSeconds;
    passes.push({
      index,
      repetition: index + 1,
      speedPercent,
      playSeconds,
      restSeconds: item.restSeconds,
      totalSeconds,
    });
    elapsedSeconds += totalSeconds;
    if (targetSeconds != null && elapsedSeconds >= targetSeconds) break;
  }

  return {
    ok: true,
    step: item,
    passes,
    plannedSeconds: elapsedSeconds,
    targetReached: item.target.kind === 'repetitions'
      ? passes.length === item.target.count
      : elapsedSeconds >= targetSeconds,
  };
}

export function buildPracticeQueue(value, clipDurations = {}) {
  const normalized = normalizePracticeSet(value);
  if (!normalized.ok) return { ok: false, problems: normalized.problems, queue: [] };
  if (normalized.set.mode === 'shuffle') {
    return {
      ok: false,
      problems: ['Shuffle requires a session randomizer and is intentionally deferred to the playback layer.'],
      queue: [],
      set: normalized.set,
    };
  }

  const queue = [];
  const problems = [];
  for (let setRound = 0; setRound < normalized.set.repeatSet; setRound++) {
    for (const step of normalized.set.steps) {
      const plan = planPracticeStep(step, { clipDurationSeconds: clipDurations[step.audioLinkId] });
      if (!plan.ok) {
        problems.push(`${step.id}: ${plan.problem}`);
        continue;
      }
      for (const pass of plan.passes) {
        queue.push({
          setRound: setRound + 1,
          stepId: step.id,
          audioLinkId: step.audioLinkId,
          label: step.label,
          ...pass,
        });
      }
    }
  }
  return { ok: problems.length === 0, problems, queue, set: normalized.set };
}
