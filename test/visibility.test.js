import test from 'node:test';
import assert from 'node:assert/strict';

import {
  filterVisibleObjects,
  scopeSummaryToResults,
  suppressSmallCohorts,
} from '../src/domain/visibility.js';

const objects = [
  { objectKey: 'A-1', projectKey: 'A' },
  { objectKey: 'B-1', projectKey: 'B' },
  { objectKey: 'C-1', projectKey: 'C' },
];

test('no project allowlist means the graph filter is trusted', () => {
  assert.equal(filterVisibleObjects(objects, null).length, 3);
});

test('an allowlist removes anything outside it', () => {
  const visible = filterVisibleObjects(objects, new Set(['A', 'B']));
  assert.deepEqual(
    visible.map((object) => object.objectKey),
    ['A-1', 'B-1'],
  );
});

test('objects without a project are dropped when an allowlist is active', () => {
  const visible = filterVisibleObjects([{ objectKey: 'X-1' }], new Set(['A']));
  assert.equal(visible.length, 0);
});

test('cohorts below the floor are hidden and counted, not silently dropped', () => {
  const result = suppressSmallCohorts(
    [
      { team: 'Platform', count: 12 },
      { team: 'Payments', count: 2 },
      { team: 'Design', count: 1 },
    ],
    { minCohort: 3 },
  );
  assert.equal(result.visible.length, 1);
  assert.equal(result.hiddenGroups, 2);
  assert.equal(result.hiddenTotal, 3);
});

test('summary counts only the rows that were actually returned', () => {
  const summary = scopeSummaryToResults([
    { tier: 'critical', busFactor: 1, flags: ['SINGLE_POINT_OF_FAILURE'] },
    { tier: 'high', busFactor: 0, flags: ['NO_HUMAN_OWNER'] },
    { tier: 'low', busFactor: 3, flags: [] },
  ]);

  assert.equal(summary.analysed, 3);
  assert.equal(summary.critical, 1);
  assert.equal(summary.high, 1);
  assert.equal(summary.ownerless, 1);
  assert.equal(summary.singleHolder, 1);
  assert.equal(summary.coveragePercent, 67);
});

test('an empty result has no coverage percentage at all', () => {
  const summary = scopeSummaryToResults([]);
  assert.equal(summary.analysed, 0);
  assert.equal(summary.coveragePercent, null);
});
