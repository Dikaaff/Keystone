// The only place that talks to the Teamwork Graph.
//
// Contract: callers pass a registered query key and typed parameters. This module
// paginates, retries rate limits, maps failures to our error vocabulary, and never
// logs row contents.

import api from '@forge/api';
import { ERROR_CODES, KeystoneError } from '../domain/errors.js';
import { ANALYSIS_DEFAULTS } from '../domain/constants.js';

// VERIFY (docs/verification.md C1): the exact selection set for the `value` union
// on `customQuery.edges.node.columns`. The public docs show a union with a
// `__typename`; different Cypher scalar types may expose different fields. This is
// isolated here, and parseColumns() tolerates several shapes, so a correction is
// a one-line change.
const COLUMN_SELECTION = 'columns { key value { __typename value } }';

export function buildCustomQueryDocument() {
  return `query KeystoneCustomQuery($queryKey: String!, $queryParams: CypherRequestParams, $first: Int, $after: String) {
  customQuery(queryKey: $queryKey, queryParams: $queryParams, first: $first, after: $after) {
    edges { node { ${COLUMN_SELECTION} } }
    pageInfo { hasNextPage endCursor }
  }
}`;
}

/**
 * Cypher values arrive wrapped. This unwraps the known shapes and returns the raw
 * value for anything else, so an unexpected type degrades to data rather than a crash.
 */
export function unwrapCypherValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(unwrapCypherValue);
  if ('value' in value) return unwrapCypherValue(value.value);
  if ('stringValue' in value) return value.stringValue;
  if ('intValue' in value) return value.intValue;
  if ('booleanValue' in value) return value.booleanValue;
  return value;
}

export function columnsToRow(columns = []) {
  const row = {};
  for (const column of columns) {
    if (!column || typeof column.key !== 'string') continue;
    row[column.key] = unwrapCypherValue(column.value);
  }
  return row;
}

export function parseCustomQueryResponse(json = {}) {
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const first = json.errors[0] ?? {};
    const message = String(first.message ?? '');
    const classification = String(first.extensions?.classification ?? '');
    return { rows: [], errors: [{ message, classification }] };
  }

  const connection = json.data?.customQuery;
  if (!connection) return { rows: [], errors: [], missing: true };

  const edges = Array.isArray(connection.edges) ? connection.edges : [];
  const rows = edges.map((edge) => columnsToRow(edge?.node?.columns ?? []));
  return {
    rows,
    errors: [],
    hasNextPage: Boolean(connection.pageInfo?.hasNextPage),
    endCursor: connection.pageInfo?.endCursor ?? null,
  };
}

function classifyFailure(status, errors = []) {
  const combined = errors
    .map((error) => `${error.classification} ${error.message}`)
    .join(' ')
    .toLowerCase();

  if (status === 429 || combined.includes('rate_limit') || combined.includes('rate limit')) {
    return ERROR_CODES.RATE_LIMITED;
  }
  if (status === 401 || status === 403 || combined.includes('permission') || combined.includes('unauthor')) {
    return ERROR_CODES.PERMISSION_DENIED;
  }
  if (combined.includes('scope')) return ERROR_CODES.GRAPH_SCOPE_MISSING;
  return ERROR_CODES.UPSTREAM_UNAVAILABLE;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds the graph client. `request` is injectable so the retry, pagination, and
 * failure mapping can be tested without a live site.
 */
export function createGraphClient({
  request,
  pageSize = ANALYSIS_DEFAULTS.pageSize,
  maxPages = ANALYSIS_DEFAULTS.maxPages,
  sleep = defaultSleep,
  now = Date.now,
} = {}) {
  const callGraph =
    request ??
    ((document, variables, operationName) =>
      api.asUser().requestTeamworkGraph(document, variables, operationName));

  async function executeWithRetry(document, variables, { retries = 2 } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      let response;
      try {
        response = await callGraph(document, variables, 'KeystoneCustomQuery');
      } catch (error) {
        lastError = new KeystoneError(ERROR_CODES.UPSTREAM_UNAVAILABLE, {
          causeCode: 'TRANSPORT',
        });
        if (attempt === retries) throw lastError;
        await sleep(250 * 2 ** attempt);
        continue;
      }

      const status = Number(response?.status ?? 0);
      const json = await response.json().catch(() => null);
      const parsed = parseCustomQueryResponse(json ?? {});

      if (status >= 200 && status < 300 && parsed.errors.length === 0 && !parsed.missing) {
        return { ...parsed, status };
      }

      // An HTTP failure is classified by its status even when the body is empty or
      // unparseable: a 403 with no JSON is still a permission problem, not an outage.
      const code =
        status >= 400
          ? classifyFailure(status, parsed.errors)
          : parsed.missing
            ? ERROR_CODES.UPSTREAM_UNAVAILABLE
            : classifyFailure(status, parsed.errors);

      if (code === ERROR_CODES.UPSTREAM_UNAVAILABLE && status >= 500 && attempt < retries) {
        await sleep(250 * 2 ** attempt);
        continue;
      }
      if (code === ERROR_CODES.RATE_LIMITED && attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }

      throw new KeystoneError(code, {
        causeCode: parsed.missing ? 'NO_CUSTOM_QUERY_IN_RESPONSE' : `HTTP_${status || 'NA'}`,
      });
    }
    throw lastError ?? new KeystoneError(ERROR_CODES.UPSTREAM_UNAVAILABLE);
  }

  return {
    /**
     * Runs one registered query and pages until the data ends, the page budget is
     * used up, or the caller's own limit is reached.
     */
    async run(queryKey, queryParams = {}, { pageLimit = null, pages = maxPages } = {}) {
      const started = now();
      const document = buildCustomQueryDocument();
      const rows = [];
      let after = null;
      let pagesRead = 0;
      let truncated = false;
      const rowBudget = Number.isInteger(pageLimit) ? pageLimit : null;

      for (let index = 0; index < pages; index += 1) {
        const result = await executeWithRetry(document, {
          queryKey,
          queryParams,
          first: pageSize,
          after,
        });
        pagesRead += 1;
        rows.push(...result.rows);

        if (rowBudget !== null && rows.length >= rowBudget) {
          rows.length = rowBudget;
          truncated = result.hasNextPage || rows.length > rowBudget;
          break;
        }
        if (!result.hasNextPage || !result.endCursor) break;
        if (index === pages - 1) truncated = true;
        after = result.endCursor;
      }

      return {
        rows,
        truncated,
        pages: pagesRead,
        ms: now() - started,
        queryKey,
      };
    },
  };
}
