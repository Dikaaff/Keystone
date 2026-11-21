// Single source of truth for the risk model. Every number here is justified in
// docs/data-model.md; changing one changes the product's behaviour, so they live
// together rather than being sprinkled through the analysis code.

export const RISK_WEIGHTS = Object.freeze({
  // How much of the knowledge sits with the top holder.
  concentration: 0.32,
  // Headcount risk: one holder is the whole failure mode.
  singlePoint: 0.26,
  // How much it would hurt if this object's context vanished.
  criticality: 0.24,
  // How long since anyone with context touched it.
  staleness: 0.18,
});

export const WEIGHT_SUM = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);

export const TIER_THRESHOLDS = Object.freeze({
  critical: 75,
  high: 55,
  moderate: 35,
});

// Escalation floors. Without these, a single-owner object with low priority can
// score "moderate" and never reach the top of a manager's list, which is exactly
// the case that causes the loss.
export const ESCALATION = Object.freeze({
  noEffectiveOwner: 88,
  departedOrInactiveOnly: 82,
  singlePointCritical: 78,
});

export const CRITICALITY_BY_PRIORITY = Object.freeze({
  highest: 1,
  high: 0.85,
  medium: 0.55,
  low: 0.3,
  lowest: 0.15,
  undefined: 0.5,
});

export const CRITICALITY_BY_STATUS = Object.freeze({
  blocked: 1,
  'in progress': 0.8,
  'in review': 0.7,
  'to do': 0.55,
  done: 0.2,
  closed: 0.2,
  undefined: 0.5,
});

export const ANALYSIS_DEFAULTS = Object.freeze({
  activityWindowDays: 90,
  staleAfterDays: 180,
  // Below this, a cohort is too small to display: showing "1 person" per team
  // is an inference channel, not a metric.
  minCohort: 3,
  pageSize: 25,
  maxPages: 8,
  scanLimit: 50,
  maxScanLimit: 100,
  maxObjectHolders: 25,
  maxCoverageCandidates: 5,
  cacheTtlSeconds: 900,
  maxNoteLength: 280,
});

export const LIMITS = Object.freeze({
  minSinceDays: 7,
  maxSinceDays: 730,
  minLimit: 1,
});

export const COVERAGE_DECISIONS = Object.freeze([
  'BACKUP_OWNER',
  'PAIRED_REVIEW',
  'DOCUMENTED',
  'DEFERRED',
]);

export const SCOPES = Object.freeze(['jira', 'confluence']);
