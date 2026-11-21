// Per-user analysis cache.
//
// Two rules make this safe:
//   1. Keys always include the account id, so one person's cached result is never
//      served to another. If we cannot identify the caller, we do not cache.
//   2. Values are computed summaries only. Raw graph rows, titles, and people are
//      never written to storage.

// Forge Key-Value Store. The legacy `storage` export was removed from @forge/api
// and @forge/storage is not the app-facing package: @forge/kvs is.
import { kvs } from '@forge/kvs';

const PREFIX = 'keystone:v1:';

export function hashKey(input) {
  const text = String(input);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function buildCacheKey({ accountId, queryKey, params = {} }) {
  if (!accountId) return null;
  const stableParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return `${hashKey(accountId)}:${hashKey(queryKey)}:${hashKey(stableParams)}`;
}

export function createCache({ storageApi = kvs, now = Date.now } = {}) {
  return {
    async get(key) {
      if (!key) return null;
      try {
        const record = await storageApi.get(`${PREFIX}${key}`);
        if (!record || typeof record !== 'object') return null;
        if (Number(record.expiresAt) <= now()) return null;
        return record.value ?? null;
      } catch {
        // A cache miss is never an error the user needs to see.
        return null;
      }
    },

    async set(key, value, ttlSeconds) {
      if (!key) return;
      try {
        await storageApi.set(`${PREFIX}${key}`, {
          value,
          expiresAt: now() + Math.max(0, ttlSeconds) * 1000,
        });
      } catch {
        // Losing the cache only costs a graph call.
      }
    },
  };
}

/**
 * Coverage decisions are deliberately long-lived and separate from the analysis
 * cache: they are a human's record, not a derived value.
 */
export function createDecisionStore({ storageApi = kvs, now = Date.now } = {}) {
  return {
    async record({ accountId, objectKey, decision, note }) {
      if (!accountId) return null;
      const key = `keystone:v1:decision:${hashKey(accountId)}:${hashKey(objectKey)}`;
      const record = {
        objectKeyHash: hashKey(objectKey),
        decision,
        note: note ?? null,
        recordedAt: new Date(now()).toISOString(),
      };
      await storageApi.set(key, record);
      return record;
    },
  };
}
