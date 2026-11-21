import test from 'node:test';
import assert from 'node:assert/strict';

import {
  columnsToRow,
  createGraphClient,
  parseCustomQueryResponse,
  unwrapCypherValue,
} from '../src/services/twg.js';
import { KeystoneError } from '../src/domain/errors.js';

function response(status, json) {
  return { status, json: async () => json };
}

function page(rows, { hasNextPage = false, endCursor = null } = {}) {
  return {
    data: {
      customQuery: {
        edges: rows.map((row) => ({
          node: { columns: Object.entries(row).map(([key, value]) => ({ key, value })) },
        })),
        pageInfo: { hasNextPage, endCursor },
      },
    },
  };
}

test('wrapped cypher scalars are unwrapped', () => {
  assert.equal(unwrapCypherValue({ __typename: 'CypherString', value: 'RISK-1' }), 'RISK-1');
  assert.equal(unwrapCypherValue({ __typename: 'CypherInt', value: 7 }), 7);
  assert.equal(unwrapCypherValue({ stringValue: 'x' }), 'x');
  assert.equal(unwrapCypherValue(null), null);
  assert.equal(unwrapCypherValue('plain'), 'plain');
});

test('columns become a flat row', () => {
  const row = columnsToRow([
    { key: 'objectKey', value: { __typename: 'CypherString', value: 'RISK-1' } },
    { key: 'holderName', value: null },
  ]);
  assert.deepEqual(row, { objectKey: 'RISK-1', holderName: null });
});

test('graphql errors are surfaced without throwing away classification', () => {
  const parsed = parseCustomQueryResponse({
    errors: [{ message: 'rate limit exceeded', extensions: { classification: 'RATE_LIMITED' } }],
  });
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.rows.length, 0);
});

test('pagination follows cursors until the graph says stop', async () => {
  const requests = [];
  const client = createGraphClient({
    pageSize: 2,
    maxPages: 5,
    sleep: async () => {},
    request: async (document, variables) => {
      requests.push(variables);
      if (!variables.after) {
        return response(200, page([{ objectKey: 'A-1' }, { objectKey: 'A-2' }], {
          hasNextPage: true,
          endCursor: 'cursor-1',
        }));
      }
      return response(200, page([{ objectKey: 'A-3' }]));
    },
  });

  const result = await client.run('keystone_jira_inventory', { since: 'x', limit: 50 });
  assert.equal(result.rows.length, 3);
  assert.equal(result.pages, 2);
  assert.equal(result.truncated, false);
  assert.equal(requests[1].after, 'cursor-1');
});

test('hitting the page budget is reported as truncation', async () => {
  const client = createGraphClient({
    pageSize: 1,
    maxPages: 2,
    sleep: async () => {},
    request: async () =>
      response(200, page([{ objectKey: 'A-1' }], { hasNextPage: true, endCursor: 'c' })),
  });

  const result = await client.run('keystone_jira_inventory', {});
  assert.equal(result.pages, 2);
  assert.equal(result.truncated, true);
});

test('a rate limit is retried once and then succeeds', async () => {
  let calls = 0;
  const client = createGraphClient({
    sleep: async () => {},
    request: async () => {
      calls += 1;
      if (calls === 1) return response(429, {});
      return response(200, page([{ objectKey: 'A-1' }]));
    },
  });

  const result = await client.run('keystone_jira_inventory', {});
  assert.equal(calls, 2);
  assert.equal(result.rows.length, 1);
});

test('permission failures become PERMISSION_DENIED', async () => {
  const client = createGraphClient({
    sleep: async () => {},
    request: async () => response(403, {}),
  });

  await assert.rejects(
    () => client.run('keystone_jira_inventory', {}),
    (error) => error instanceof KeystoneError && error.code === 'PERMISSION_DENIED',
  );
});

test('a missing customQuery result is an upstream failure, not empty data', async () => {
  const client = createGraphClient({
    sleep: async () => {},
    request: async () => response(200, { data: {} }),
  });

  await assert.rejects(
    () => client.run('keystone_jira_inventory', {}),
    (error) => error instanceof KeystoneError && error.code === 'UPSTREAM_UNAVAILABLE',
  );
});
