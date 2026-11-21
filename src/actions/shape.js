// Row shaping shared by every action.
//
// The graph returns one row per (object, holder). Everything below turns that into
// per-object analyses, and then into the smallest payload the UI or the agent needs.

import { classifyHolders, concentrationIndex, topShare } from '../domain/ownership.js';
import { analyzeObject } from '../domain/risk.js';
import { ANALYSIS_DEFAULTS } from '../domain/constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function groupRowsByObject(rows = [], scope = 'jira') {
  const byAri = new Map();

  for (const row of rows) {
    const objectAri = row?.objectAri;
    if (!objectAri) continue;

    if (!byAri.has(objectAri)) {
      byAri.set(objectAri, {
        objectAri,
        objectKey: row.objectKey ?? null,
        title: row.title ?? null,
        status: row.status ?? null,
        priority: row.priority ?? null,
        updatedAt: row.updatedAt ?? null,
        scope,
        holders: [],
      });
    }

    const object = byAri.get(objectAri);
    if (row.holderAri) {
      object.holders.push({
        userAri: row.holderAri,
        displayName: row.holderName ?? null,
        accountType: row.holderAccountType ?? null,
        lastActiveAt: row.holderLastActiveAt ?? null,
      });
    }
    // A later row may carry metadata the first row lacked (for example when the
    // first row came from an OPTIONAL MATCH with no holder).
    object.objectKey = object.objectKey ?? row.objectKey ?? null;
    object.title = object.title ?? row.title ?? null;
    object.updatedAt = object.updatedAt ?? row.updatedAt ?? null;
  }

  return [...byAri.values()];
}

export function analyzeObjects(
  objects = [],
  {
    now = Date.now(),
    activityWindowDays = ANALYSIS_DEFAULTS.activityWindowDays,
    staleAfterDays = ANALYSIS_DEFAULTS.staleAfterDays,
  } = {},
) {
  return objects
    .map((object) => {
      const holders = classifyHolders(object.holders, { now, activityWindowDays });
      return analyzeObject(
        {
          ...object,
          holders,
          concentration: concentrationIndex(holders.effective),
          topShare: topShare(holders.effective),
        },
        { now, staleAfterDays },
      );
    })
    .sort((left, right) => right.score - left.score);
}

/**
 * UI payload: enough to explain the score, without shipping every raw holder.
 * Display names are included because a manager has to know who to talk to; they
 * are never written to storage or logs.
 */
export function shapeForUi(analysis, { maxHolders = 5 } = {}) {
  const effective = (analysis.holders?.effective ?? []).slice(0, maxHolders);
  return {
    objectKey: analysis.objectKey,
    title: analysis.title,
    scope: analysis.scope,
    score: analysis.score,
    tier: analysis.tier,
    flags: analysis.flags,
    drivers: analysis.drivers,
    busFactor: analysis.busFactor,
    concentration: Number(analysis.concentration.toFixed(3)),
    topShare: Number((analysis.topShare ?? 1).toFixed(3)),
    priority: analysis.priority,
    status: analysis.status,
    updatedAt: analysis.updatedAt,
    lastHumanTouchAt: analysis.lastHumanTouchAt,
    staleDays: daysSince(analysis.lastHumanTouchAt),
    holders: {
      effective: effective.map((holder) => ({
        name: holder.displayName,
        daysSinceActive: holder.daysSinceActive,
      })),
      inactiveCount: analysis.holders?.inactive?.length ?? 0,
      unknownCount: analysis.holders?.unknown?.length ?? 0,
      botCount: analysis.holders?.bots?.length ?? 0,
    },
  };
}

export function daysSince(timestamp, now = Date.now()) {
  if (!timestamp) return null;
  const time = Date.parse(String(timestamp));
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / DAY_MS));
}

/**
 * Agent output: the same numbers, phrased as one readable paragraph. Rovo passes
 * this straight to the user, so it must stand alone.
 */
export function describeForAgent(result) {
  const { summary, items = [], scope, windowDays } = result;
  const label = scope === 'confluence' ? 'Confluence pages' : 'Jira work items';
  if (summary.analysed === 0) {
    return `No ${label} were found in the last ${windowDays} days that you can see. That can mean the window is too narrow, or that your access covers projects with no recent activity — it does not prove there is no risk.`;
  }

  const top = items.slice(0, 3);
  const lines = top.map(
    (item, index) =>
      `${index + 1}. ${item.objectKey ?? '(no key)'} — ${item.score}/100, ${item.tier}, ${
        item.busFactor === 0 ? 'no reachable owner' : `${item.busFactor} reachable holder(s)`
      }`,
  );

  return [
    `Across ${summary.analysed} ${label} you can see (last ${windowDays} days), ${summary.critical} are critical and ${summary.high} are high risk.`,
    `Coverage: ${summary.coveragePercent}% have at least one reachable owner.`,
    lines.length ? `Highest risk:\n${lines.join('\n')}` : '',
    'These numbers are limited to what you are allowed to see.',
  ]
    .filter(Boolean)
    .join('\n');
}
