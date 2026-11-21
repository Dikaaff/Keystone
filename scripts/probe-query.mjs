#!/usr/bin/env node
// Runs one registered persisted query through the site's Teamwork Graph endpoint and
// prints the column names that come back. This is how verification items C1 and C2 are
// checked without depending on a GraphQL explorer being enabled on the site.
//
// It uses the exact GraphQL document the app uses (src/services/twg.js), so a pass here
// means the deployed code will see the same columns.
//
//   KS_SITE=yourtenant KS_COOKIE='<cookie>' \
//   npm run queries:probe -- keystone_jira_inventory '{"since":"2026-01-01T00:00:00Z","limit":5}'
//
// The cookie is read from the environment, never written to disk, and never logged.

import { buildCustomQueryDocument } from '../src/services/twg.js';

const [queryKey, paramsJson = '{}'] = process.argv.slice(2);
const site = process.env.KS_SITE;
const cookie = process.env.KS_COOKIE;

if (!queryKey || !site || !cookie) {
  console.error(
    [
      'Usage:',
      "  KS_SITE=yourtenant KS_COOKIE='<cookie>' npm run queries:probe -- <queryKey> '<paramsJson>'",
      '',
      'Example:',
      `  KS_SITE=yourtenant KS_COOKIE='<cookie>' npm run queries:probe -- keystone_jira_inventory '{"since":"2026-01-01T00:00:00Z","limit":5}'`,
      '',
      'The cookie must come from a signed-in browser session on that site.',
    ].join('\n'),
  );
  process.exit(2);
}

let queryParams;
try {
  queryParams = JSON.parse(paramsJson);
} catch {
  console.error('The params argument is not valid JSON.');
  process.exit(2);
}

const body = {
  query: buildCustomQueryDocument(),
  variables: { queryKey, queryParams, first: 10 },
  operationName: 'KeystoneCustomQuery',
};

const response = await fetch(`https://${site}.atlassian.net/gateway/api/graphql/twg`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(body),
});

const text = await response.text();
console.log(`HTTP ${response.status}`);

let json = null;
try {
  json = JSON.parse(text);
} catch {
  console.log(text.slice(0, 400));
  process.exit(1);
}

if (Array.isArray(json.errors) && json.errors.length > 0) {
  for (const error of json.errors) {
    console.log(`error: ${error.message}`);
    if (error.extensions?.classification) {
      console.log(`classification: ${error.extensions.classification}`);
    }
  }
  process.exit(1);
}

const connection = json.data?.customQuery;
if (!connection) {
  console.log('No customQuery in the response. The query is probably not registered for this app id.');
  console.log(text.slice(0, 400));
  process.exit(1);
}

const edges = Array.isArray(connection.edges) ? connection.edges : [];
const columnKeys = new Set();
for (const edge of edges) {
  for (const column of edge?.node?.columns ?? []) {
    if (column?.key) columnKeys.add(column.key);
  }
}

console.log(`rows: ${edges.length}`);
console.log(`column keys: ${[...columnKeys].sort().join(', ') || '(none)'}`);
console.log(`hasNextPage: ${Boolean(connection.pageInfo?.hasNextPage)}`);
console.log('');
console.log('First rows (values truncated to 80 chars):');
for (const edge of edges.slice(0, 2)) {
  const row = {};
  for (const column of edge?.node?.columns ?? []) {
    const raw = column?.value;
    row[column.key] = typeof raw === 'object' && raw !== null ? JSON.stringify(raw) : raw;
  }
  console.log(JSON.stringify(row).slice(0, 400));
}

if (edges.length === 0) {
  console.log('');
  console.log('No rows. In order: check the scope is granted, then the window, then the');
  console.log('property/relationship names in src/services/queries.js.');
  process.exit(0);
}
