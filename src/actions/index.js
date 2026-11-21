// The action layer.
//
// One implementation per capability, consumed by three surfaces:
//   - the Custom UI through the resolver,
//   - Rovo agents and skills through the action modules,
//   - external MCP clients through rovo:mcp.
// Nothing about permissions, limits, or error text forks by surface.

import { ANALYSIS_DEFAULTS } from '../domain/constants.js';
import { ERROR_CODES, KeystoneError, toKeystoneError, userMessage } from '../domain/errors.js';
import { scopeSummaryToResults } from '../domain/visibility.js';
import { validateObjectKey, validateRecordInput, validateScanInput } from '../domain/validate.js';
import { createAuditLogger } from '../services/audit.js';
import { buildCacheKey, createCache, createDecisionStore } from '../services/cache.js';
import { readConfig } from '../services/config.js';
import { listQueries, QUERIES, queryForObject, queryForScope } from '../services/queries.js';
import { createGraphClient } from '../services/twg.js';
import { analyzeObjects, describeForAgent, groupRowsByObject, shapeForUi } from './shape.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function resolveAccountId(context) {
  const candidate =
    context?.principal?.accountId ?? context?.accountId ?? context?.userAccess?.accountId ?? null;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (trimmed.length < 5 || trimmed.length > 200) return null;
  if (/\s/.test(trimmed)) return null;
  return trimmed;
}

function recommendationsFor(flags = []) {
  if (flags.includes('NO_HUMAN_OWNER')) return ['ASSIGN_OWNER', 'DOCUMENT_DECISIONS'];
  if (flags.includes('INACTIVE_OWNER_ONLY')) return ['BACKUP_OWNER', 'PAIRED_REVIEW'];
  if (flags.includes('SINGLE_POINT_OF_FAILURE')) return ['PAIRED_REVIEW', 'DOCUMENTED'];
  if (flags.includes('NO_EFFECTIVE_OWNER')) return ['BACKUP_OWNER'];
  return ['PAIRED_REVIEW'];
}

export function createActions(deps = {}) {
  const config = deps.config ?? readConfig();
  const graph = deps.graph ?? createGraphClient({ maxPages: config.maxPages });
  const cache = deps.cache ?? createCache();
  const decisions = deps.decisions ?? createDecisionStore();
  const audit = deps.audit ?? createAuditLogger();
  const clock = deps.now ?? Date.now;

  function analysisOptions() {
    return {
      now: clock(),
      activityWindowDays: config.activityWindowDays,
      staleAfterDays: config.staleAfterDays,
    };
  }

  function notesFor(query, result, analysed, displayed) {
    const notes = [];
    if (query.verification !== 'verified') notes.push('QUERY_NOT_VERIFIED_ON_THIS_SITE');
    if (result.truncated) notes.push('GRAPH_RESULT_TRUNCATED');
    if (analysed > displayed) notes.push('LIST_LIMITED_TO_TOP_RESULTS');
    if (analysed === 0) notes.push('NO_DATA_IN_WINDOW');
    return notes;
  }

  async function scanRisks(payload = {}, context = {}) {
    const startedAt = clock();
    const input = validateScanInput(payload ?? {});
    const accountId = resolveAccountId(context);
    const query = queryForScope(input.scope);
    const params = {
      since: new Date(clock() - input.sinceDays * DAY_MS).toISOString(),
      limit: Math.min(input.limit * 4, 400),
    };
    const cacheKey = buildCacheKey({ accountId, queryKey: query.key, params });

    const cached = await cache.get(cacheKey);
    if (cached) return { ...cached, cacheHit: true };

    const result = await graph.run(query.key, params, { pages: config.maxPages });
    const objects = groupRowsByObject(result.rows, input.scope);
    const analyses = analyzeObjects(objects, analysisOptions());
    const limited = analyses.slice(0, input.limit);
    const items = limited.map((analysis) => shapeForUi(analysis));

    const output = {
      scope: input.scope,
      windowDays: input.sinceDays,
      generatedAt: new Date(clock()).toISOString(),
      summary: {
        ...scopeSummaryToResults(limited),
        matched: analyses.length,
        displayed: items.length,
      },
      items,
      notes: notesFor(query, result, analyses.length, items.length),
      query: { key: query.key, verification: query.verification },
      cacheHit: false,
    };

    await cache.set(cacheKey, output, config.cacheTtlSeconds);
    audit.event('scan.completed', {
      rows: result.rows.length,
      truncated: result.truncated,
      ms: clock() - startedAt,
      queryKey: query.key,
    });
    return output;
  }

  async function analyseOne(objectInput) {
    const key = validateObjectKey(objectInput);
    const query = queryForObject(key.kind);
    const result = await graph.run(
      query.key,
      { objectKey: key.value, limit: ANALYSIS_DEFAULTS.maxObjectHolders * 4 },
      { pages: 2 },
    );
    const objects = groupRowsByObject(result.rows, key.kind);
    const match =
      objects.find((object) => object.objectAri === key.value) ??
      objects.find(
        (object) =>
          String(object.objectKey ?? '').toUpperCase() === String(key.value).toUpperCase(),
      );

    if (!match) {
      throw new KeystoneError(ERROR_CODES.NOT_FOUND, { field: 'objectKey' });
    }

    const [analysis] = analyzeObjects([match], analysisOptions());
    return { analysis, query, key, truncated: result.truncated };
  }

  async function objectRisk(payload = {}) {
    const startedAt = clock();
    const { analysis, query, truncated } = await analyseOne(payload ?? {});
    audit.event('object.read', { ms: clock() - startedAt, queryKey: query.key });

    return {
      item: {
        ...shapeForUi(analysis, { maxHolders: 10 }),
        recommendations: recommendationsFor(analysis.flags),
      },
      notes: [
        ...(query.verification !== 'verified' ? ['QUERY_NOT_VERIFIED_ON_THIS_SITE'] : []),
        ...(truncated ? ['GRAPH_RESULT_TRUNCATED'] : []),
      ],
      query: { key: query.key, verification: query.verification },
      generatedAt: new Date(clock()).toISOString(),
    };
  }

  async function coveragePlan(payload = {}, context = {}) {
    const startedAt = clock();
    const { analysis, key } = await analyseOne(payload ?? {});
    const anchor =
      analysis.holders?.effective?.[0] ??
      analysis.holders?.inactive?.[0] ??
      analysis.holders?.unknown?.[0] ??
      null;

    const base = {
      objectKey: analysis.objectKey,
      risk: {
        score: analysis.score,
        tier: analysis.tier,
        flags: analysis.flags,
        busFactor: analysis.busFactor,
      },
      anchor: anchor ? { name: anchor.displayName } : null,
      candidates: [],
      explanation: null,
      generatedAt: new Date(clock()).toISOString(),
    };

    if (!anchor?.ari) {
      audit.event('coverage.no_anchor', { ms: clock() - startedAt });
      return {
        ...base,
        explanation: 'NO_ANCHOR',
      };
    }

    const result = await graph.run(
      QUERIES.teamPeers.key,
      {
        userAri: anchor.ari,
        since: new Date(clock() - config.activityWindowDays * DAY_MS).toISOString(),
        limit: 50,
      },
      { pages: 2 },
    );

    const byUser = new Map();
    for (const row of result.rows) {
      if (!row?.userAri || row.userAri === anchor.ari) continue;
      const existing = byUser.get(row.userAri);
      const load = Number.isFinite(Number(row.activeItems)) ? Number(row.activeItems) : 0;
      if (existing) {
        if (row.teamName) existing.teams.add(String(row.teamName));
        existing.activeItems = Math.max(existing.activeItems, load);
      } else {
        byUser.set(row.userAri, {
          name: row.displayName ?? null,
          accountType: row.accountType ?? null,
          teams: new Set(row.teamName ? [String(row.teamName)] : []),
          activeItems: load,
        });
      }
    }

    const candidates = [...byUser.values()]
      .filter((candidate) => candidate.accountType !== 'bot' && candidate.accountType !== 'app')
      .filter((candidate) => !/bot|automation|integration/i.test(String(candidate.name ?? '')))
      .sort((left, right) => left.activeItems - right.activeItems)
      .slice(0, ANALYSIS_DEFAULTS.maxCoverageCandidates)
      .map((candidate) => ({
        name: candidate.name,
        sharedTeams: [...candidate.teams],
        activeItems: candidate.activeItems,
        reason: 'SAME_TEAM_LOWER_LOAD',
      }));

    audit.event('coverage.generated', {
      rows: result.rows.length,
      ms: clock() - startedAt,
      queryKey: QUERIES.teamPeers.key,
    });

    return {
      ...base,
      candidates,
      explanation: candidates.length === 0 ? 'NO_TEAMMATE_VISIBLE' : null,
      caveat:
        'Candidates are ranked by shared team membership and current assigned load. Load is not expertise: confirm with the team before handing work over.',
    };
  }

  async function recordCoverage(payload = {}, context = {}) {
    const accountId = resolveAccountId(context);
    if (!accountId) throw new KeystoneError(ERROR_CODES.PERMISSION_DENIED);

    const input = validateRecordInput(payload ?? {});
    const record = await decisions.record({
      accountId,
      objectKey: input.value,
      decision: input.decision,
      note: input.note,
    });

    audit.event('coverage.recorded', { ms: 0 });
    return {
      recorded: Boolean(record),
      objectKey: input.value,
      decision: input.decision,
      noteSaved: Boolean(input.note),
      recordedAt: record?.recordedAt ?? null,
    };
  }

  function diagnostics() {
    return {
      config: {
        activityWindowDays: config.activityWindowDays,
        staleAfterDays: config.staleAfterDays,
        minCohort: config.minCohort,
        cacheTtlSeconds: config.cacheTtlSeconds,
      },
      queries: listQueries(),
    };
  }

  return { scanRisks, objectRisk, coveragePlan, recordCoverage, diagnostics };
}

export function agentPayload(result) {
  if (result?.item) {
    const item = result.item;
    return {
      ok: true,
      answer: `${item.objectKey ?? 'That object'}: ${item.score}/100 (${item.tier}). ${
        item.busFactor === 0
          ? 'No reachable owner is recorded.'
          : `${item.busFactor} person(s) can currently be asked about it.`
      } Drivers: ${item.drivers.map((driver) => driver.code).join(', ') || 'none'}.`,
      item,
    };
  }
  return { ok: true, answer: describeForAgent(result), summary: result.summary, items: result.items };
}

export function failurePayload(error) {
  const safe = toKeystoneError(error);
  return { ok: false, code: safe.code, message: userMessage(safe.code) };
}
