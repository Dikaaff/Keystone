// One error vocabulary for the resolver, the Rovo actions, and the MCP tools.
// Every error carries a code that is safe to log, and a human sentence that is
// safe to show. No message here ever includes an object key, a person, or content.

export const ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  TOO_MUCH_DATA: 'TOO_MUCH_DATA',
  GRAPH_SCOPE_MISSING: 'GRAPH_SCOPE_MISSING',
  INTERNAL: 'INTERNAL',
});

const MESSAGES = {
  INVALID_INPUT:
    "Some details in that request aren't valid. Check the values and try again.",
  NOT_FOUND:
    "I couldn't find that issue or page, or you don't have access to it. Check the key and try again.",
  PERMISSION_DENIED:
    "Keystone can only show objects you already have access to. This one isn't visible to you.",
  RATE_LIMITED:
    'Atlassian is rate-limiting graph reads right now. Nothing was changed; try again in a minute.',
  UPSTREAM_UNAVAILABLE:
    "Keystone couldn't reach the knowledge graph just now. Nothing was changed; try again shortly.",
  TOO_MUCH_DATA:
    'That covers too many objects to show at once. Narrow the activity window and try again.',
  GRAPH_SCOPE_MISSING:
    "Your administrator hasn't granted this data type to Keystone, so there's nothing to analyse yet. An org admin can grant it in Atlassian Administration.",
  INTERNAL:
    'Something went wrong inside Keystone. Nothing was changed; try again, or ask your admin to check the app logs.',
};

export class KeystoneError extends Error {
  constructor(code, { field, causeCode, retryAfterSeconds } = {}) {
    super(code);
    this.name = 'KeystoneError';
    this.code = ERROR_CODES[code] ? code : ERROR_CODES.INTERNAL;
    this.field = field ?? null;
    this.causeCode = causeCode ?? null;
    this.retryAfterSeconds = retryAfterSeconds ?? null;
  }
}

export function isKeystoneError(error) {
  return error instanceof KeystoneError;
}

export function toKeystoneError(error) {
  if (isKeystoneError(error)) return error;
  return new KeystoneError(ERROR_CODES.INTERNAL, {
    causeCode: typeof error?.code === 'string' ? error.code : null,
  });
}

export function userMessage(code) {
  return MESSAGES[code] ?? MESSAGES.INTERNAL;
}

/**
 * Log payloads are built from an allowlist, never by serialising an error or a
 * row. This is the only place we are allowed to add fields to a log line.
 */
export function safeLogFields(errorOrResult) {
  const fields = {
    code: errorOrResult?.code ?? null,
    status: Number.isFinite(errorOrResult?.status) ? errorOrResult.status : null,
    queryKey: typeof errorOrResult?.queryKey === 'string' ? errorOrResult.queryKey : null,
    rows: Number.isFinite(errorOrResult?.rows) ? errorOrResult.rows : null,
    truncated: typeof errorOrResult?.truncated === 'boolean' ? errorOrResult.truncated : null,
    ms: Number.isFinite(errorOrResult?.ms) ? errorOrResult.ms : null,
    pages: Number.isFinite(errorOrResult?.pages) ? errorOrResult.pages : null,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null));
}
