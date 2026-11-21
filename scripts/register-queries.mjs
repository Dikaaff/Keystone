#!/usr/bin/env node
// Registers Keystone's persisted Cypher queries with Teamwork Graph.
//
// Default (no flags) prints exactly what would be sent; nothing leaves the machine.
// `--post` performs the registration. Per the published approach, registration is
// done once per site by an app owner and needs a logged-in browser session:
//
//   KS_SITE=yourtenant KS_APP_ID=ari:cloud:ecosystem::app/... \
//   KS_COOKIE='<cookie header from a logged-in request>' npm run queries:post
//
// The cookie is read from the environment and never written to disk or logs.

import { QUERIES } from '../src/services/queries.js';

const args = new Set(process.argv.slice(2));
const shouldPost = args.has('--post');

function payloadFor(query, appId) {
  return {
    appId,
    name: query.name,
    cypher: query.cypher,
    paramsSchema: query.params.map((param) => ({
      name: param.name,
      type: param.type,
      required: Boolean(param.required),
    })),
  };
}

const appId = process.env.KS_APP_ID ?? 'ari:cloud:ecosystem::app/00000000-0000-0000-0000-000000000000';
const queries = Object.values(QUERIES);

if (!shouldPost) {
  console.log('Dry run. These payloads would be POSTed to /gateway/api/twg/cypher-queries:\n');
  for (const query of queries) {
    console.log(`# ${query.key} (${query.verification})`);
    console.log(JSON.stringify(payloadFor(query, appId), null, 2));
    console.log('');
  }
  console.log('Re-run with --post and KS_SITE / KS_APP_ID / KS_COOKIE to register them.');
  process.exit(0);
}

const site = process.env.KS_SITE;
const cookie = process.env.KS_COOKIE;

if (!site || !cookie || !appId.includes('/')) {
  console.error('Missing configuration. Required: KS_SITE, KS_COOKIE, KS_APP_ID.');
  process.exit(2);
}

for (const query of queries) {
  const url = `https://${site}.atlassian.net/gateway/api/twg/cypher-queries`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(payloadFor(query, appId)),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`${query.key}: HTTP ${response.status} — ${text.slice(0, 300)}`);
    continue;
  }

  let returnedKey = null;
  try {
    returnedKey = JSON.parse(text)?.queryKey ?? JSON.parse(text)?.key ?? null;
  } catch {
    // Registration succeeded but the body was not JSON; the key is in the response text.
  }
  console.log(`${query.key}: registered${returnedKey ? ` as ${returnedKey}` : ''}`);
}
