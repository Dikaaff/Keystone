// The scoring function. It is deliberately pure: given the same normalised
// object, it returns the same score, which is what makes it testable and what
// lets the UI, the agent, and the MCP tool quote identical numbers.

import {
  CRITICALITY_BY_PRIORITY,
  CRITICALITY_BY_STATUS,
  ESCALATION,
  RISK_WEIGHTS,
  TIER_THRESHOLDS,
  WEIGHT_SUM,
} from './constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function tierForScore(score) {
  if (score >= TIER_THRESHOLDS.critical) return 'critical';
  if (score >= TIER_THRESHOLDS.high) return 'high';
  if (score >= TIER_THRESHOLDS.moderate) return 'moderate';
  return 'low';
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function prioritySignal(priority) {
  const key = String(priority ?? 'undefined').trim().toLowerCase();
  return CRITICALITY_BY_PRIORITY[key] ?? CRITICALITY_BY_PRIORITY.undefined;
}

function statusSignal(status) {
  const key = String(status ?? 'undefined').trim().toLowerCase();
  return CRITICALITY_BY_STATUS[key] ?? CRITICALITY_BY_STATUS.undefined;
}

export function criticalitySignal({ priority, status, dependents = 0 } = {}) {
  const dependentSignal = clamp01(Math.log10(1 + Math.max(0, dependents)) / 2);
  return clamp01(0.6 * prioritySignal(priority) + 0.25 * statusSignal(status) + 0.15 * dependentSignal);
}

export function stalenessSignal({ lastHumanTouchAt, now = Date.now(), staleAfterDays = 180 } = {}) {
  const time = lastHumanTouchAt ? Date.parse(String(lastHumanTouchAt)) : NaN;
  if (!Number.isFinite(time)) return 1;
  const days = Math.max(0, (now - time) / DAY_MS);
  return clamp01(days / staleAfterDays);
}

/**
 * @param {object} input
 * @param {number} input.concentration   0..1
 * @param {number} input.singlePoint     0..1
 * @param {number} input.criticality     0..1
 * @param {number} input.staleness       0..1
 * @param {boolean} input.hasEffectiveHolder
 * @param {boolean} input.hasHumanHolder
 * @param {boolean} input.hasInactiveHolderOnly
 * @param {number} [input.criticalityRaw]
 */
export function scoreKnowledgeRisk(input = {}) {
  const components = {
    concentration: clamp01(input.concentration),
    singlePoint: clamp01(input.singlePoint),
    criticality: clamp01(input.criticality),
    staleness: clamp01(input.staleness),
  };

  const weighted = Object.fromEntries(
    Object.entries(components).map(([key, value]) => [
      key,
      (value * RISK_WEIGHTS[key]) / WEIGHT_SUM,
    ]),
  );

  const base = Object.values(weighted).reduce((sum, value) => sum + value, 0);
  let score = Math.round(base * 100);
  const flags = [];

  // A departed owner is checked before "no owner": the object did have knowledge,
  // and that knowledge has now walked out, which needs a different conversation
  // than work that never had an owner.
  if (!input.hasEffectiveHolder && input.hasInactiveHolderOnly) {
    flags.push('INACTIVE_OWNER_ONLY');
    score = Math.max(score, ESCALATION.departedOrInactiveOnly);
  } else if (!input.hasEffectiveHolder) {
    flags.push(input.hasHumanHolder ? 'NO_EFFECTIVE_OWNER' : 'NO_HUMAN_OWNER');
    score = Math.max(score, ESCALATION.noEffectiveOwner);
  }

  if (
    components.singlePoint >= 0.99 &&
    components.criticality >= 0.75 &&
    !flags.includes('NO_EFFECTIVE_OWNER')
  ) {
    flags.push('SINGLE_POINT_OF_FAILURE');
    score = Math.max(score, ESCALATION.singlePointCritical);
  }

  score = Math.min(100, Math.max(0, score));

  return {
    score,
    tier: tierForScore(score),
    flags,
    components,
    drivers: rankDrivers(weighted),
  };
}

/**
 * Drivers are the two signals that contributed most to the score. The UI and the
 * agent both show these instead of dumping the whole model, because a manager
 * needs "why is this red", not a formula.
 */
export function rankDrivers(weighted) {
  return Object.entries(weighted)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([code, contribution]) => ({
      code: code.toUpperCase().replace(/([A-Z])/g, '_$1').replace(/^_/, ''),
      contribution: Number(contribution.toFixed(4)),
    }));
}

/**
 * One object, fully analysed. `holders` is the classified result from ownership.js,
 * never raw rows, so no content ever reaches this function.
 */
export function analyzeObject(object = {}, options = {}) {
  const { now = Date.now(), staleAfterDays = 180 } = options;
  const holders = object.holders ?? {
    effective: [],
    inactive: [],
    unknown: [],
    bots: [],
    hasEffectiveHolder: false,
    hasHumanHolder: false,
  };

  const effectiveCount = holders.effective.length;
  const concentration =
    object.concentration ?? concentrationFromHolders(holders.effective);
  const singlePoint =
    object.singlePoint ?? singlePointFromCount(effectiveCount);
  const criticality =
    object.criticality ??
    criticalitySignal({
      priority: object.priority,
      status: object.status,
      dependents: object.dependents,
    });

  // Staleness is about the object, not about how busy its holder is elsewhere:
  // a person active on other work does not keep this object fresh.
  const lastHumanTouchAt =
    object.lastHumanTouchAt ?? object.updatedAt ?? latestHumanTouch(holders, null);
  const staleness =
    object.staleness ?? stalenessSignal({ lastHumanTouchAt, now, staleAfterDays });

  const scored = scoreKnowledgeRisk({
    concentration,
    singlePoint,
    criticality,
    staleness,
    hasEffectiveHolder: effectiveCount > 0,
    hasHumanHolder: holders.hasHumanHolder !== false && (holders.holders?.length ?? effectiveCount) > 0,
    hasInactiveHolderOnly:
      effectiveCount === 0 && (holders.inactive?.length ?? 0) > 0,
  });

  return {
    objectAri: object.objectAri ?? null,
    objectKey: object.objectKey ?? null,
    title: object.title ?? null,
    scope: object.scope ?? 'jira',
    priority: object.priority ?? null,
    status: object.status ?? null,
    updatedAt: object.updatedAt ?? null,
    lastHumanTouchAt,
    busFactor: effectiveCount,
    concentration,
    topShare: object.topShare ?? null,
    holders: {
      effective: holders.effective,
      inactive: holders.inactive,
      unknown: holders.unknown,
      bots: holders.bots,
    },
    ...scored,
    drivers: scored.drivers,
  };
}

function concentrationFromHolders(effective) {
  if (effective.length <= 1) return 1;
  const weights = effective.map((h) => (h.contributionCount > 0 ? h.contributionCount : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const entropy = weights.reduce((sum, weight) => {
    const share = weight / total;
    return sum - share * Math.log2(share);
  }, 0);
  return clamp01(1 - entropy / Math.log2(effective.length));
}

function singlePointFromCount(count) {
  if (count <= 0) return 1;
  if (count === 1) return 1;
  return clamp01(1 - Math.log2(count) / 3);
}

function latestHumanTouch(holders, fallback) {
  const times = [...(holders.effective ?? []), ...(holders.unknown ?? [])]
    .map((holder) => holder.daysSinceActive)
    .filter((days) => Number.isFinite(days));
  if (times.length === 0) return fallback ?? null;
  const minDays = Math.min(...times);
  return new Date(Date.now() - minDays * DAY_MS).toISOString();
}
