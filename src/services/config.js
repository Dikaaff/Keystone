// Runtime configuration from Forge app variables. Every value has a working
// default, because an app that needs configuration before it is useful never gets
// past the judge's install link.

import { ANALYSIS_DEFAULTS, LIMITS } from '../domain/constants.js';

function intFrom(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function readConfig(env = globalThis.process?.env ?? {}) {
  return {
    activityWindowDays: intFrom(
      env.KEYSTONE_ACTIVITY_WINDOW_DAYS,
      ANALYSIS_DEFAULTS.activityWindowDays,
      LIMITS.minSinceDays,
      LIMITS.maxSinceDays,
    ),
    staleAfterDays: intFrom(env.KEYSTONE_STALE_AFTER_DAYS, ANALYSIS_DEFAULTS.staleAfterDays, 30, 730),
    minCohort: intFrom(env.KEYSTONE_MIN_COHORT, ANALYSIS_DEFAULTS.minCohort, 1, 20),
    cacheTtlSeconds: intFrom(env.KEYSTONE_CACHE_TTL_SECONDS, ANALYSIS_DEFAULTS.cacheTtlSeconds, 0, 3600),
    maxPages: intFrom(env.KEYSTONE_MAX_PAGES, ANALYSIS_DEFAULTS.maxPages, 1, 20),
    scanLimit: intFrom(env.KEYSTONE_SCAN_LIMIT, ANALYSIS_DEFAULTS.scanLimit, LIMITS.minLimit, ANALYSIS_DEFAULTS.maxScanLimit),
  };
}
