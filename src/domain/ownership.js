// Ownership analysis: who actually holds the knowledge for one object, and how
// concentrated it is. This is the part that must not be fooled by bots, stale
// accounts, or a missing owner.

import { isBotIdentity, normalizeAri } from './ids.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(value) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? time : null;
}

/**
 * Turns one raw holder row into a classification we can reason about.
 * A holder with no activity timestamp is kept but marked unknown rather than
 * silently treated as active: unknown must not look like healthy.
 */
export function classifyHolder(raw = {}, { now = Date.now(), activityWindowDays = 90 } = {}) {
  const ari = normalizeAri(raw.userAri ?? raw.ari);
  const lastActiveTime = toTime(raw.lastActiveAt);
  const daysSinceActive =
    lastActiveTime === null ? null : Math.max(0, Math.floor((now - lastActiveTime) / DAY_MS));
  const isBot = isBotIdentity({ accountType: raw.accountType, displayName: raw.displayName });
  const explicitlyInactive = raw.active === false || raw.accountType === 'deactivated';
  const activityUnknown = daysSinceActive === null;

  return {
    ari,
    displayName: typeof raw.displayName === 'string' ? raw.displayName : null,
    isBot,
    activityUnknown,
    daysSinceActive,
    // "Inactive" means either the directory says so, or we have positive evidence
    // the account has been quiet for longer than the window. Unknown is separate.
    inactive: explicitlyInactive || (!activityUnknown && daysSinceActive > activityWindowDays),
    departed: explicitlyInactive,
    contributionCount: Number.isFinite(raw.contributionCount) ? raw.contributionCount : 0,
  };
}

/**
 * Splits holders into people who can actually be asked a question today versus
 * everyone else. Coverage means "someone reachable knows this", so that is the
 * only set the bus factor may count.
 */
export function classifyHolders(rawHolders = [], options = {}) {
  const seen = new Set();
  const holders = [];

  for (const raw of rawHolders) {
    const holder = classifyHolder(raw, options);
    if (!holder.ari) continue;
    if (seen.has(holder.ari)) continue;
    seen.add(holder.ari);
    holders.push(holder);
  }

  const humans = holders.filter((holder) => !holder.isBot);
  const effective = humans.filter((holder) => !holder.inactive && !holder.activityUnknown);
  const inactive = humans.filter((holder) => holder.inactive);
  const unknown = humans.filter((holder) => holder.activityUnknown && !holder.inactive);
  const bots = holders.filter((holder) => holder.isBot);

  return {
    holders,
    effective,
    inactive,
    unknown,
    bots,
    hasHumanHolder: humans.length > 0,
    hasEffectiveHolder: effective.length > 0,
    humanCount: humans.length,
    botCount: bots.length,
  };
}

/**
 * Concentration is 1 minus normalised Shannon entropy over holder shares.
 * One holder => 1. Four equal holders => 0. It rewards breadth, and it does not
 * reward "many holders" where one person still holds 90% of the activity.
 */
export function concentrationIndex(effectiveHolders = []) {
  if (effectiveHolders.length === 0) return 1;
  if (effectiveHolders.length === 1) return 1;

  const weights = effectiveHolders.map((holder) =>
    holder.contributionCount > 0 ? holder.contributionCount : 1,
  );
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 1;

  const entropy = weights.reduce((sum, weight) => {
    const share = weight / total;
    return share > 0 ? sum - share * Math.log2(share) : sum;
  }, 0);

  const maxEntropy = Math.log2(effectiveHolders.length);
  const normalized = maxEntropy > 0 ? entropy / maxEntropy : 0;
  return clamp01(1 - normalized);
}

export function topShare(effectiveHolders = []) {
  if (effectiveHolders.length === 0) return 1;
  const weights = effectiveHolders.map((holder) =>
    holder.contributionCount > 0 ? holder.contributionCount : 1,
  );
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 1;
  return Math.max(...weights) / total;
}

/**
 * Single-point risk falls quickly with each additional reachable holder, then
 * flattens: the jump from one to two people matters far more than three to four.
 */
export function singlePointRisk(effectiveCount) {
  if (effectiveCount <= 0) return 1;
  if (effectiveCount === 1) return 1;
  return clamp01(1 - Math.log2(effectiveCount) / 3);
}

export function busFactor(effectiveCount) {
  return Math.max(0, effectiveCount);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
