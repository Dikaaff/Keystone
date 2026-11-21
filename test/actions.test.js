import test from 'node:test';
import assert from 'node:assert/strict';

import { createActions } from '../src/actions/index.js';
import { KeystoneError } from '../src/domain/errors.js';

const NOW = Date.parse('2026-11-21T00:00:00Z');
const isoDaysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

function makeActions(handlers = {}, overrides = {}) {
  const calls = [];
  const graph = {
    async run(queryKey, params) {
      calls.push({ queryKey, params });
      const handler = handlers[queryKey];
      if (!handler) throw new Error(`unexpected query ${queryKey}`);
      return { rows: [], truncated: false, pages: 1, ms: 1, queryKey, ...handler(params) };
    },
  };

  const actions = createActions({
    graph,
    cache: { get: async () => null, set: async () => {} },
    decisions: { record: async ({ decision, note }) => ({ decision, note, recordedAt: '2026-11-21T00:00:00Z' }) },
    audit: { event: () => {} },
    now: () => NOW,
    config: {
      activityWindowDays: 90,
      staleAfterDays: 180,
      minCohort: 3,
      cacheTtlSeconds: 0,
      maxPages: 4,
      scanLimit: 50,
    },
    ...overrides,
  });

  return { actions, calls };
}

const inventoryRows = [
  {
    objectAri: 'ari:issue/1',
    objectKey: 'PAY-1',
    title: 'Payroll migration',
    status: 'In progress',
    priority: 'Highest',
    updatedAt: isoDaysAgo(5),
    holderAri: 'user-1',
    holderName: 'Rina',
    holderAccountType: 'atlassian',
    holderLastActiveAt: isoDaysAgo(1),
  },
  {
    objectAri: 'ari:issue/2',
    objectKey: 'PAY-2',
    title: 'Tax tables',
    status: 'To do',
    priority: 'Medium',
    updatedAt: isoDaysAgo(40),
    holderAri: null,
    holderName: null,
    holderAccountType: null,
    holderLastActiveAt: null,
  },
  {
    objectAri: 'ari:issue/2',
    objectKey: 'PAY-2',
    title: 'Tax tables',
    status: 'To do',
    priority: 'Medium',
    updatedAt: isoDaysAgo(40),
    holderAri: 'bot-1',
    holderName: 'Automation Bot',
    holderAccountType: 'app',
    holderLastActiveAt: isoDaysAgo(1),
  },
];

test('a scan groups holder rows into objects and ranks by score', async () => {
  const { actions } = makeActions({
    keystone_jira_inventory: () => ({ rows: inventoryRows }),
  });

  const result = await actions.scanRisks({ scope: 'jira' });
  assert.equal(result.summary.analysed, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].objectKey, 'PAY-2', 'ownerless work should rank first');
  assert.equal(result.summary.ownerless, 1);
  assert.ok(result.items[0].score >= 88);
  assert.ok(result.notes.includes('NO_DATA_IN_WINDOW') === false);
  assert.equal(result.windowDays, 90);
});

test('bots do not create coverage for an ownerless object', async () => {
  const { actions } = makeActions({
    keystone_jira_inventory: () => ({ rows: inventoryRows }),
  });
  const result = await actions.scanRisks({ scope: 'jira' });
  const ownerless = result.items.find((item) => item.objectKey === 'PAY-2');
  assert.equal(ownerless.busFactor, 0);
  assert.equal(ownerless.holders.botCount, 1);
});

test('an empty window is reported as empty, not as safe', async () => {
  const { actions } = makeActions({ keystone_jira_inventory: () => ({ rows: [] }) });
  const result = await actions.scanRisks({ scope: 'jira' });
  assert.equal(result.summary.analysed, 0);
  assert.equal(result.summary.coveragePercent, null);
  assert.ok(result.notes.includes('NO_DATA_IN_WINDOW'));
});

test('the returned list is capped but the matched count is honest', async () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({
    ...inventoryRows[0],
    objectAri: `ari:issue/${index}`,
    objectKey: `PAY-${index + 10}`,
  }));
  const { actions } = makeActions({ keystone_jira_inventory: () => ({ rows }) });
  const result = await actions.scanRisks({ scope: 'jira', limit: 2 });
  assert.equal(result.items.length, 2);
  assert.equal(result.summary.matched, 5);
  assert.ok(result.notes.includes('LIST_LIMITED_TO_TOP_RESULTS'));
});

test('an unknown issue key is NOT_FOUND rather than an empty analysis', async () => {
  const { actions } = makeActions({ keystone_jira_object: () => ({ rows: [] }) });
  await assert.rejects(
    () => actions.objectRisk({ objectKey: 'PAY-999' }),
    (error) => error instanceof KeystoneError && error.code === 'NOT_FOUND',
  );
});

test('an ownerless object still returns an analysis instead of failing', async () => {
  const { actions } = makeActions({
    keystone_jira_object: () => ({
      rows: [
        {
          objectAri: 'ari:issue/9',
          objectKey: 'PAY-9',
          title: 'Unassigned migration step',
          status: 'To do',
          priority: 'High',
          updatedAt: isoDaysAgo(300),
          holderAri: null,
        },
      ],
    }),
  });

  const result = await actions.objectRisk({ objectKey: 'PAY-9' });
  assert.equal(result.item.busFactor, 0);
  assert.ok(result.item.flags.includes('NO_HUMAN_OWNER'));
  assert.ok(result.item.recommendations.includes('ASSIGN_OWNER'));
});

test('coverage candidates exclude bots and sort by lowest load', async () => {
  const { actions } = makeActions({
    keystone_jira_object: () => ({
      rows: [
        {
          objectAri: 'ari:issue/1',
          objectKey: 'PAY-1',
          title: 'Payroll',
          status: 'In progress',
          priority: 'Highest',
          updatedAt: isoDaysAgo(4),
          holderAri: 'user-1',
          holderName: 'Rina',
          holderAccountType: 'atlassian',
          holderLastActiveAt: isoDaysAgo(1),
        },
      ],
    }),
    keystone_team_peers: () => ({
      rows: [
        { userAri: 'user-2', displayName: 'Budi', accountType: 'atlassian', teamName: 'Payments', activeItems: 6 },
        { userAri: 'user-3', displayName: 'Sari', accountType: 'atlassian', teamName: 'Payments', activeItems: 2 },
        { userAri: 'bot-2', displayName: 'Sync Bot', accountType: 'app', teamName: 'Payments', activeItems: 0 },
      ],
    }),
  });

  const plan = await actions.coveragePlan({ objectKey: 'PAY-1' });
  assert.deepEqual(
    plan.candidates.map((candidate) => candidate.name),
    ['Sari', 'Budi'],
  );
  assert.equal(plan.anchor.name, 'Rina');
  assert.ok(plan.caveat.includes('not expertise'));
});

test('recording a decision requires an identified user', async () => {
  const { actions } = makeActions({});
  await assert.rejects(
    () => actions.recordCoverage({ objectKey: 'PAY-1', decision: 'PAIRED_REVIEW' }),
    (error) => error instanceof KeystoneError && error.code === 'PERMISSION_DENIED',
  );

  const saved = await actions.recordCoverage(
    { objectKey: 'PAY-1', decision: 'PAIRED_REVIEW', note: 'Shadow Sari next sprint' },
    { principal: { accountId: '712020:abc123' } },
  );
  assert.equal(saved.recorded, true);
  assert.equal(saved.noteSaved, true);
});

test('the analysis cache is skipped when the caller cannot be identified', async () => {
  const cacheCalls = [];
  const { actions } = makeActions(
    { keystone_jira_inventory: () => ({ rows: [] }) },
    { cache: { get: async (key) => { cacheCalls.push(key); return null; }, set: async () => {} } },
  );

  await actions.scanRisks({ scope: 'jira' });
  assert.deepEqual(cacheCalls, [null], 'an anonymous caller must not share a cache slot');
});

test('diagnostics expose query verification status without data', async () => {
  const { actions } = makeActions({});
  const diagnostics = actions.diagnostics();
  assert.ok(diagnostics.queries.length >= 5);
  assert.ok(diagnostics.queries.every((query) => typeof query.verification === 'string'));
  assert.ok(!JSON.stringify(diagnostics).includes('Payroll'));
});
