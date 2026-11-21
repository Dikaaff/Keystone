// Forge entry points. Every export referenced by manifest.yml lives here.
//
// Handler signatures follow Forge: the resolver receives a Custom UI event with
// `payload` and `context`; an action module function receives the action inputs as
// its first argument, plus context.

import { createActions, failurePayload, agentPayload } from './actions/index.js';
import { ERROR_CODES, KeystoneError, safeLogFields, toKeystoneError, userMessage } from './domain/errors.js';
import { createAuditLogger } from './services/audit.js';

const actions = createActions();
const audit = createAuditLogger();

const OPERATIONS = {
  scanRisks: (input, context) => actions.scanRisks(input, context),
  objectRisk: (input) => actions.objectRisk(input),
  coveragePlan: (input, context) => actions.coveragePlan(input, context),
  recordCoverage: (input, context) => actions.recordCoverage(input, context),
  diagnostics: () => actions.diagnostics(),
};

export async function resolver(event = {}) {
  const operation = event.payload?.operation;
  const input = event.payload?.input ?? {};
  const startedAt = Date.now();

  try {
    const handler = OPERATIONS[operation];
    if (!handler) throw new KeystoneError(ERROR_CODES.INVALID_INPUT, { field: 'operation' });
    const data = await handler(input, event.context);
    return { ok: true, data };
  } catch (error) {
    const safe = toKeystoneError(error);
    audit.event('resolver.failed', {
      code: safe.code,
      ms: Date.now() - startedAt,
      queryKey: typeof operation === 'string' ? operation.slice(0, 40) : null,
    });
    return {
      ok: false,
      code: safe.code,
      field: safe.field,
      message: userMessage(safe.code),
    };
  }
}

// --- Rovo / MCP actions -----------------------------------------------------
// These return a sentence the model can relay, plus structured data. They never
// throw: an action that throws gives the agent nothing useful to say.

export async function scanRisksAction(payload = {}, context = {}) {
  try {
    const result = await actions.scanRisks(payload ?? {}, context);
    return agentPayload(result);
  } catch (error) {
    return failurePayload(error);
  }
}

export async function objectRiskAction(payload = {}, context = {}) {
  try {
    const result = await actions.objectRisk(payload ?? {}, context);
    return agentPayload(result);
  } catch (error) {
    return failurePayload(error);
  }
}

export async function coveragePlanAction(payload = {}, context = {}) {
  try {
    const result = await actions.coveragePlan(payload ?? {}, context);
    const names = result.candidates.map((candidate) => candidate.name).filter(Boolean);
    return {
      ok: true,
      answer: names.length
        ? `Possible receiving owners, least loaded first: ${names.join(', ')}. Confirm expertise with the team before reassigning.`
        : result.explanation === 'NO_ANCHOR'
          ? 'This object has no recorded owner to anchor a handover. Assign an owner first, then ask again.'
          : 'No teammate is visible to you as a candidate. That may be a permission boundary rather than an absence of people.',
      plan: result,
    };
  } catch (error) {
    return failurePayload(error);
  }
}

export async function recordCoverageAction(payload = {}, context = {}) {
  try {
    const result = await actions.recordCoverage(payload ?? {}, context);
    return {
      ok: true,
      answer: `Recorded ${result.decision} for ${result.objectKey}. Keystone will show it as addressed on the radar.`,
      record: result,
    };
  } catch (error) {
    return failurePayload(error);
  }
}
