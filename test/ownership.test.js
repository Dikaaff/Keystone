import test from 'node:test';
import assert from 'node:assert/strict';

import {
  busFactor,
  classifyHolder,
  classifyHolders,
  concentrationIndex,
  singlePointRisk,
  topShare,
} from '../src/domain/ownership.js';

const NOW = Date.parse('2026-11-21T00:00:00Z');
const isoDaysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

test('bots are never knowledge holders', () => {
  assert.equal(classifyHolder({ userAri: 'bot-1', displayName: 'Automation Bot' }).isBot, true);
  assert.equal(classifyHolder({ userAri: 'app-1', accountType: 'app' }).isBot, true);
  assert.equal(classifyHolder({ userAri: 'u-1', displayName: 'Rina Putri' }).isBot, false);
});

test('an account silent past the window is inactive, not effective', () => {
  const holder = classifyHolder(
    { userAri: 'u-1', displayName: 'Budi', lastActiveAt: isoDaysAgo(200) },
    { now: NOW, activityWindowDays: 90 },
  );
  assert.equal(holder.inactive, true);
  assert.equal(holder.daysSinceActive, 200);
});

test('unknown activity is not counted as healthy coverage', () => {
  const holders = classifyHolders([{ userAri: 'u-1' }], { now: NOW, activityWindowDays: 90 });
  assert.equal(holders.effective.length, 0);
  assert.equal(holders.unknown.length, 1);
  assert.equal(holders.hasEffectiveHolder, false);
});

test('deactivated accounts are marked departed', () => {
  const holders = classifyHolders(
    [{ userAri: 'u-9', displayName: 'Former colleague', accountType: 'deactivated', active: false }],
    { now: NOW },
  );
  assert.equal(holders.inactive.length, 1);
  assert.equal(holders.inactive[0].departed, true);
  assert.equal(holders.effective.length, 0);
});

test('duplicate rows for the same holder collapse', () => {
  const holders = classifyHolders(
    [
      { userAri: 'u-1', lastActiveAt: isoDaysAgo(1) },
      { userAri: 'u-1', lastActiveAt: isoDaysAgo(1) },
    ],
    { now: NOW },
  );
  assert.equal(holders.holders.length, 1);
});

test('concentration is maximal for one holder and zero for four equal holders', () => {
  const one = [{ contributionCount: 10 }];
  const four = [1, 1, 1, 1].map(() => ({ contributionCount: 1 }));
  assert.equal(concentrationIndex(one), 1);
  assert.equal(concentrationIndex(four), 0);
  assert.equal(topShare(one), 1);
  assert.equal(topShare(four), 0.25);
});

test('a lopsided pair still looks concentrated', () => {
  const lopsided = [{ contributionCount: 9 }, { contributionCount: 1 }];
  assert.ok(concentrationIndex(lopsided) > 0.5);
});

test('single-point risk drops fast then flattens', () => {
  assert.equal(singlePointRisk(0), 1);
  assert.equal(singlePointRisk(1), 1);
  assert.ok(singlePointRisk(2) < 0.7);
  assert.ok(singlePointRisk(8) <= 0.0001);
  assert.equal(busFactor(3), 3);
});
