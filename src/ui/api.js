import { invoke } from '@forge/bridge';

/**
 * Every UI call goes through one resolver entry. The resolver returns either
 * { ok: true, data } or { ok: false, code, message }, so the UI has exactly one
 * failure shape to render.
 */
export async function call(operation, input = {}) {
  let response;
  try {
    response = await invoke('keystone', { operation, input });
  } catch {
    const error = new Error('Keystone could not reach its backend. Try again.');
    error.code = 'UPSTREAM_UNAVAILABLE';
    throw error;
  }

  if (!response?.ok) {
    const error = new Error(response?.message ?? 'Keystone could not answer.');
    error.code = response?.code ?? 'INTERNAL';
    error.field = response?.field ?? null;
    throw error;
  }
  return response.data;
}

export const scanRisks = (input) => call('scanRisks', input);
export const objectRisk = (objectKey) => call('objectRisk', { objectKey });
export const coveragePlan = (objectKey) => call('coveragePlan', { objectKey });
export const recordCoverage = (input) => call('recordCoverage', input);
