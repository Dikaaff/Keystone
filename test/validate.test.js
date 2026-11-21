import test from 'node:test';
import assert from 'node:assert/strict';

import { KeystoneError, ERROR_CODES, safeLogFields, userMessage } from '../src/domain/errors.js';
import { validateObjectKey, validateRecordInput, validateScanInput } from '../src/domain/validate.js';

test('scan input defaults are usable without arguments', () => {
  const input = validateScanInput({ scope: 'jira' });
  assert.deepEqual(input, { scope: 'jira', limit: 50, sinceDays: 90 });
});

test('scan input rejects unknown scopes and out-of-range limits', () => {
  assert.throws(() => validateScanInput({ scope: 'admin' }), KeystoneError);
  assert.throws(() => validateScanInput({ scope: 'jira', limit: 0 }), KeystoneError);
  assert.throws(() => validateScanInput({ scope: 'jira', limit: 101 }), KeystoneError);
  assert.throws(() => validateScanInput({ scope: 'jira', sinceDays: 2 }), KeystoneError);
});

test('numeric strings from action inputs are accepted', () => {
  const input = validateScanInput({ scope: 'JIRA', limit: '20', sinceDays: '30' });
  assert.equal(input.limit, 20);
  assert.equal(input.sinceDays, 30);
});

test('object keys must look like a key or a page ARI', () => {
  assert.deepEqual(validateObjectKey('proj-123'), { kind: 'jira', value: 'PROJ-123' });
  const ari = 'ari:cloud:confluence:1234:page/5678';
  assert.deepEqual(validateObjectKey({ objectKey: ari }), { kind: 'confluence', value: ari });

  for (const bad of ['PROJ-1" RETURN n', 'DROP TABLE', '', 'x'.repeat(200), null, 42]) {
    assert.throws(() => validateObjectKey(bad), KeystoneError);
  }
});

test('coverage decisions are normalized and notes are bounded', () => {
  const record = validateRecordInput({ objectKey: 'PROJ-1', decision: 'paired_review' });
  assert.equal(record.decision, 'PAIRED_REVIEW');
  assert.equal(record.note, null);

  assert.throws(
    () => validateRecordInput({ objectKey: 'PROJ-1', decision: 'DELETE_EVERYTHING' }),
    KeystoneError,
  );
  assert.throws(
    () =>
      validateRecordInput({ objectKey: 'PROJ-1', decision: 'DOCUMENTED', note: 'x'.repeat(281) }),
    KeystoneError,
  );
});

test('control characters are stripped from user notes', () => {
  const record = validateRecordInput({
    objectKey: 'PROJ-1',
    decision: 'DEFERRED',
    note: '  handover\u0000 planned\tnext sprint  ',
  });
  assert.equal(record.note, 'handover  planned next sprint');
});

test('error messages are human and never echo input', () => {
  const error = new KeystoneError(ERROR_CODES.NOT_FOUND, { field: 'objectKey' });
  const message = userMessage(error.code);
  assert.ok(message.length > 20);
  assert.ok(!message.includes('objectKey'));
  assert.ok(!/undefined|null/.test(message));
});

test('log fields are allowlisted', () => {
  const fields = safeLogFields({
    code: 'RATE_LIMITED',
    status: 429,
    queryKey: 'keystone_jira_inventory',
    rows: 12,
    displayName: 'Rina Putri',
    title: 'Payroll migration',
  });
  assert.deepEqual(fields, {
    code: 'RATE_LIMITED',
    status: 429,
    queryKey: 'keystone_jira_inventory',
    rows: 12,
  });
});
