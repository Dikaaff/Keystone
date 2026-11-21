// Input normalisation for every entry point. The same validator runs for the UI,
// the Rovo action, and the MCP tool, so an external client cannot reach a code
// path with looser rules than the UI.

import { ANALYSIS_DEFAULTS, COVERAGE_DECISIONS, LIMITS, SCOPES } from './constants.js';
import { KeystoneError, ERROR_CODES } from './errors.js';
import { looksLikeConfluenceAri, looksLikeJiraKey } from './ids.js';

function invalid(field) {
  return new KeystoneError(ERROR_CODES.INVALID_INPUT, { field });
}

function boundedInt(raw, { fallback, min, max, field }) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(value)) throw invalid(field);
  if (value < min || value > max) throw invalid(field);
  return value;
}

export function validateScanInput(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw invalid('input');
  const scope = String(input.scope ?? '').trim().toLowerCase();
  if (!SCOPES.includes(scope)) throw invalid('scope');

  return {
    scope,
    limit: boundedInt(input.limit, {
      fallback: ANALYSIS_DEFAULTS.scanLimit,
      min: LIMITS.minLimit,
      max: ANALYSIS_DEFAULTS.maxScanLimit,
      field: 'limit',
    }),
    sinceDays: boundedInt(input.sinceDays, {
      fallback: ANALYSIS_DEFAULTS.activityWindowDays,
      min: LIMITS.minSinceDays,
      max: LIMITS.maxSinceDays,
      field: 'sinceDays',
    }),
  };
}

/**
 * Accepts a Jira issue key or a Confluence page ARI, and returns a typed result
 * instead of a string, so later code never re-guesses what it was given.
 */
export function validateObjectKey(input = {}) {
  const raw = typeof input === 'string' ? input : input?.objectKey;
  if (typeof raw !== 'string') throw invalid('objectKey');
  const value = raw.trim();
  if (value.length === 0 || value.length > 160) throw invalid('objectKey');

  // Issue keys are stored uppercase, and people type them lowercase.
  const upper = value.toUpperCase();
  if (looksLikeJiraKey(upper)) return { kind: 'jira', value: upper };
  if (looksLikeConfluenceAri(value)) return { kind: 'confluence', value };
  throw invalid('objectKey');
}

export function validateRecordInput(input = {}) {
  const key = validateObjectKey(input);
  const decision = String(input?.decision ?? '').trim().toUpperCase();
  if (!COVERAGE_DECISIONS.includes(decision)) throw invalid('decision');

  const rawNote = input?.note;
  let note = null;
  if (rawNote !== undefined && rawNote !== null && rawNote !== '') {
    if (typeof rawNote !== 'string') throw invalid('note');
    // Control characters are stripped rather than stored: this text is shown back
    // to humans and written to storage.
    note = rawNote.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (note.length > ANALYSIS_DEFAULTS.maxNoteLength) throw invalid('note');
    if (note.length === 0) note = null;
  }

  return { ...key, decision, note };
}

/**
 * For values that end up as GraphQL variables. Persisted Cypher binds these, so
 * there is no string concatenation anywhere; this is the second lock, not the only one.
 */
export function assertSafeParamValue(value, field) {
  if (typeof value === 'string' && value.length > 500) throw invalid(field);
  if (Array.isArray(value) || (value && typeof value === 'object')) throw invalid(field);
  return value;
}
