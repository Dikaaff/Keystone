// Logging policy in code: an allowlisted event name plus allowlisted scalar fields.
// No object keys, titles, display names, query text, row bodies, or errors are
// logged, because app logs are visible to site admins and in support bundles.

import { safeLogFields } from '../domain/errors.js';

export function createAuditLogger({ logger = console, enabled = true } = {}) {
  return {
    event(name, fields) {
      if (!enabled) return;
      try {
        logger.log(JSON.stringify({ evt: name, ...safeLogFields(fields) }));
      } catch {
        // Logging must never break a request.
      }
    },
  };
}
