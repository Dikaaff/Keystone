// Identity hygiene. "A person" in the Teamwork Graph can be a human, a bot, or a
// deactivated account, and treating those the same is how a knowledge-risk tool
// produces nonsense (and how it starts to look like employee surveillance).

const BOT_PATTERN =
  /(^|[\s._-])(bot|automation|automations|integration|connector|service\s?account|jira\s?assistant|rovo)([\s._-]|$)/i;

const BOT_ACCOUNT_TYPES = new Set(['bot', 'app', 'service', 'automation']);

/**
 * Bots are not knowledge holders: they never leave, they never take a new job,
 * and counting them inflates coverage.
 */
export function isBotIdentity(holder = {}) {
  const accountType = String(holder.accountType ?? '').toLowerCase();
  if (BOT_ACCOUNT_TYPES.has(accountType)) return true;
  return BOT_PATTERN.test(String(holder.displayName ?? ''));
}

export function isHumanIdentity(holder = {}) {
  return !isBotIdentity(holder);
}

export function normalizeAri(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function sameAri(a, b) {
  const left = normalizeAri(a);
  const right = normalizeAri(b);
  return left !== null && left === right;
}

export const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9:_-]{5,128}$/;
export const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,9}-\d{1,6}$/;
export const CONFLUENCE_ARI_PATTERN =
  /^ari:cloud:confluence:[A-Za-z0-9-]+:page\/[A-Za-z0-9:_-]{1,128}$/;

export function looksLikeJiraKey(value) {
  return JIRA_KEY_PATTERN.test(String(value ?? '').trim());
}

export function looksLikeConfluenceAri(value) {
  return CONFLUENCE_ARI_PATTERN.test(String(value ?? '').trim());
}
