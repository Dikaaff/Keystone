// Permission shaping and inference control.
//
// The Teamwork Graph already filters every row for the calling user, so the first
// function here is defence in depth, not the primary control. The second is the
// part people forget: small cohorts leak individually identifiable facts even when
// each individual row is legal, so aggregates below a floor are not displayed.

import { ANALYSIS_DEFAULTS } from './constants.js';

/**
 * @param {Array<object>} objects
 * @param {Set<string>|null} visibleProjectKeys null means "trust the graph filter"
 */
export function filterVisibleObjects(objects = [], visibleProjectKeys = null) {
  if (!(visibleProjectKeys instanceof Set)) return objects;
  return objects.filter((object) => {
    const key = object.projectKey;
    if (!key) return false;
    return visibleProjectKeys.has(String(key).toUpperCase());
  });
}

/**
 * Drops buckets smaller than the floor and returns how much was hidden, so the UI
 * can say "some small teams are hidden" instead of silently under-reporting.
 */
export function suppressSmallCohorts(
  entries = [],
  { minCohort = ANALYSIS_DEFAULTS.minCohort, countKey = 'count' } = {},
) {
  const visible = [];
  const hidden = [];
  let hiddenTotal = 0;

  for (const entry of entries) {
    const count = Number(entry?.[countKey] ?? 0);
    if (count < minCohort) {
      hidden.push(entry);
      hiddenTotal += count;
    } else {
      visible.push(entry);
    }
  }

  return { visible, hidden, hiddenTotal, hiddenGroups: hidden.length };
}

export function isAggregateDisplayable(count, { minCohort = ANALYSIS_DEFAULTS.minCohort } = {}) {
  return Number(count) >= minCohort;
}

/**
 * A person who can see only one project must not be able to infer the rest of the
 * organisation from totals: counts are scoped to what was actually returned.
 */
export function scopeSummaryToResults(items = []) {
  const total = items.length;
  const byTier = items.reduce((acc, item) => {
    acc[item.tier] = (acc[item.tier] ?? 0) + 1;
    return acc;
  }, {});
  const withEffectiveOwner = items.filter((item) => item.busFactor > 0).length;
  return {
    analysed: total,
    critical: byTier.critical ?? 0,
    high: byTier.high ?? 0,
    moderate: byTier.moderate ?? 0,
    low: byTier.low ?? 0,
    ownerless: items.filter((item) => item.flags?.includes('NO_HUMAN_OWNER')).length,
    noEffectiveOwner: items.filter((item) => item.flags?.includes('NO_EFFECTIVE_OWNER')).length,
    singleHolder: items.filter((item) => item.busFactor === 1).length,
    coveragePercent: total === 0 ? null : Math.round((withEffectiveOwner / total) * 100),
  };
}
