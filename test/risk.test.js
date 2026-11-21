import test from 'node:test';
import assert from 'node:assert/strict';

import { tierForScore, scoreKnowledgeRisk, analyzeObject, criticalitySignal } from '../src/domain/risk.js';
import { classifyHolders } from '../src/domain/ownership.js';

const NOW = Date.parse('2026-11-21T00:00:00Z');
const isoDaysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

test('a single fresh holder of critical work scores critical', () => {
  const result = scoreKnowledgeRisk({
    concentration: 1,
    singlePoint: 1,
    criticality: 0.8,
    staleness: 1,
    hasEffectiveHolder: true,
    hasHumanHolder: true,
  });

  assert.equal(result.score, 95);
  assert.equal(result.tier, 'critical');
  assert.ok(result.drivers.length <= 2);
});

test('broad, equal, fresh ownership scores low', () => {
  const result = scoreKnowledgeRisk({
    concentration: 0,
    singlePoint: 0.3333,
    criticality: 0.4675,
    staleness: 0,
    hasEffectiveHolder: true,
    hasHumanHolder: true,
  });

  assert.ok(result.score < 35, `expected low tier, got ${result.score}`);
  assert.equal(result.tier, 'low');
});

test('ownerless work is escalated even when priority is ordinary', () => {
  const result = scoreKnowledgeRisk({
    concentration: 1,
    singlePoint: 1,
    criticality: 0.5,
    staleness: 1,
    hasEffectiveHolder: false,
    hasHumanHolder: false,
  });

  assert.equal(result.score, 88);
  assert.ok(result.flags.includes('NO_HUMAN_OWNER'));
  assert.equal(result.tier, 'critical');
});

test('a departed-only owner is flagged separately from never having an owner', () => {
  const result = scoreKnowledgeRisk({
    concentration: 1,
    singlePoint: 1,
    criticality: 0.5,
    staleness: 1,
    hasEffectiveHolder: false,
    hasHumanHolder: true,
    hasInactiveHolderOnly: true,
  });

  assert.ok(result.flags.includes('INACTIVE_OWNER_ONLY'));
  assert.ok(!result.flags.includes('NO_HUMAN_OWNER'));
  assert.ok(result.score >= 82);
});

test('scoring is deterministic', () => {
  const input = {
    concentration: 0.61,
    singlePoint: 0.66,
    criticality: 0.7,
    staleness: 0.4,
    hasEffectiveHolder: true,
    hasHumanHolder: true,
  };
  assert.deepEqual(scoreKnowledgeRisk(input), scoreKnowledgeRisk(input));
});

test('tier boundaries are stable', () => {
  assert.equal(tierForScore(75), 'critical');
  assert.equal(tierForScore(74.9), 'high');
  assert.equal(tierForScore(55), 'high');
  assert.equal(tierForScore(54.9), 'moderate');
  assert.equal(tierForScore(35), 'moderate');
  assert.equal(tierForScore(34.9), 'low');
});

test('criticality uses priority, status, and dependents', () => {
  const low = criticalitySignal({ priority: 'Low', status: 'Done', dependents: 0 });
  const high = criticalitySignal({ priority: 'Highest', status: 'Blocked', dependents: 10 });
  assert.ok(high > low);
  assert.ok(high <= 1);
});

test('a one-person object is a single point of failure', () => {
  const holders = classifyHolders([{ userAri: 'user-1', lastActiveAt: isoDaysAgo(2) }], {
    now: NOW,
    activityWindowDays: 90,
  });

  const analysis = analyzeObject(
    {
      objectKey: 'RISK-1',
      scope: 'jira',
      priority: 'Highest',
      status: 'In progress',
      holders,
    },
    { now: NOW, staleAfterDays: 180 },
  );

  assert.equal(analysis.busFactor, 1);
  assert.equal(analysis.concentration, 1);
  assert.ok(analysis.flags.includes('SINGLE_POINT_OF_FAILURE'));
  assert.ok(analysis.score >= 75);
  assert.equal(analysis.holders.effective[0].displayName, null);
});

test('an object with no holder rows has no human owner', () => {
  const holders = classifyHolders([], { now: NOW });
  const analysis = analyzeObject({ objectKey: 'RISK-2', holders }, { now: NOW });
  assert.equal(analysis.busFactor, 0);
  assert.ok(analysis.flags.includes('NO_HUMAN_OWNER'));
  assert.ok(analysis.score >= 88);
});

test('stale work with an active holder still ages', () => {
  const holders = classifyHolders(
    [{ userAri: 'user-1', lastActiveAt: isoDaysAgo(30), contributionCount: 5 }],
    { now: NOW, activityWindowDays: 90 },
  );
  const fresh = analyzeObject({ objectKey: 'A-1', holders, updatedAt: isoDaysAgo(1) }, { now: NOW });
  const stale = analyzeObject({ objectKey: 'A-1', holders, updatedAt: isoDaysAgo(300) }, { now: NOW });
  assert.ok(stale.score > fresh.score);
});
