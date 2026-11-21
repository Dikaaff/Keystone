# Self-audit

Run after the implementation, before submission. Findings are ordered by practical danger,
not by how easy they are to fix. Each one names real code.

## 1. Confluence ownership relationship is guessed

**Problem.** `atlassian_user_owns_confluence_page` is not confirmed in the published
relationship reference. If it is wrong, the Confluence query returns nothing.

**Evidence.** `src/services/queries.js` → `confluenceInventory`, `confluenceObject`;
`verification: 'unverified-relationship'`.

**Impact.** A judge opening the Confluence surface sees an empty radar and concludes the
feature is broken. Worse, an empty result could be read as "no risk".

**Fix.** Confirm the relationship name on the GraphQL explorer (`docs/verification.md` C2).
Until then the UI labels the source `unverified-relationship` and the empty state refuses
to claim low risk. If the real relationship differs, change the two query strings and
re-register; nothing else depends on the name.

## 2. Graph property names are unconfirmed

**Problem.** `item.updatedAt`, `item.priority`, `holder.lastActiveAt`,
`holder.accountType`, `page.id` are plausible but not proven on a live tenant.

**Evidence.** `src/services/queries.js`, all `RETURN` clauses; the same assumptions are
listed per field in the registry.

**Impact.** A wrong property makes a column null. A null `updatedAt` makes staleness 1 and
inflates every score to the escalation floor, which is a silent correctness failure.

**Fix.** C1: run each query in the explorer, compare columns. Then update the query strings
and the tests' fixtures. The parser tolerates both wrapped and plain values, so only the
Cypher changes.

## 3. Cache can be disabled without anyone noticing

**Problem.** `buildCacheKey` returns `null` when the caller has no account id. That is the
correct security choice, but it also means every resolver call re-reads the graph.

**Evidence.** `src/services/cache.js` → `buildCacheKey`; `src/actions/index.js` →
`resolveAccountId`.

**Impact.** Rate limits during a demo if the resolver context lacks an account id. No data
leak, only cost.

**Fix.** C6: log context keys once with `forge tunnel` and add the real field to
`resolveAccountId`. Do not fall back to a shared cache key.

## 4. Truncation is reported but not measured

**Problem.** When the page budget is exhausted, `truncated` is true, but the app does not
know how many objects were missed, so the coverage percentage can read slightly low.

**Evidence.** `src/services/twg.js` → `run()`; `src/actions/index.js` → `notesFor`.

**Impact.** A manager may over-estimate risk. The UI says the list is truncated, which is
honest but not complete.

**Fix.** Show a range or suppress the percentage when `GRAPH_RESULT_TRUNCATED` is present.
Acceptable for v1 because the note is visible; must be fixed before any "quarterly trend"
claim.

## 5. Issue keys are the only object address in the UI

**Problem.** The issue panel works from `context.extension.issue.key`. If a panel context
does not include it, the panel shows an error rather than falling back to the resolver
context.

**Evidence.** `src/ui/index.jsx` → `isIssuePanel` / `issueKey`.

**Impact.** A blank panel on a product surface change. Easy to detect, easy to work around.

**Fix.** C7: verify `view.getContext()` on a real issue. If the key is absent, read
`context.extension.issue.id` and resolve by ARI.

## 6. Persisted queries must be registered per site

**Problem.** The app ships query keys, not query text. On a fresh site, `customQuery`
fails until the owner registers them.

**Evidence.** `scripts/register-queries.mjs`; `src/services/queries.js`.

**Impact.** First run after install fails with an upstream error. That is the correct
failure mode (not silent empty data), but the judge sees an error.

**Fix.** Make registration part of the documented install steps and run it on the demo site
before recording. A future version should register from the app's own lifecycle, but that
needs an API that is not available to app runtime today.

## 7. `rovo:mcp` exposure is limited to Rovo Studio

**Problem.** The submission material must not claim a public MCP endpoint. The module
exposes actions as tools for custom agents in Rovo Studio, within the installed site.

**Evidence.** `manifest.yml` → `rovo:mcp`; `docs/mcp.md`.

**Impact.** Overclaiming is a credibility risk with judges, not a security risk.

**Fix.** Documentation and video wording already state the actual scope. Keep it that way.

## 8. Scope set includes Confluence even if the surface is preview

**Problem.** `read:graph:page:confluence` is requested while the Confluence feature is
unverified.

**Evidence.** `manifest.yml` → `permissions.scopes`.

**Impact.** An admin may withhold it; the Jira surface must still work. It does, because
queries are per-surface and a missing scope is reported as a data-source problem.

**Fix.** None required. If the Confluence surface is cut before submission, remove that
scope and the module to reduce review surface.

## 9. User note is free text in app storage

**Problem.** A user can write anything into a 280-character note.

**Evidence.** `src/domain/validate.js` → `validateRecordInput`; `src/services/cache.js` →
`createDecisionStore`.

**Impact.** Personal data beyond need, if the user chooses to put it there.

**Fix.** Accepted, bounded risk: the note is user-initiated, small, not logged, and never
sent anywhere. The UI placeholder steers toward handover facts, not people's performance.

## 10. No per-user rate limit beyond graph paging

**Problem.** A user can click Refresh repeatedly; each scan costs up to 8 graph calls if
the cache is cold.

**Evidence.** `src/actions/index.js` → `scanRisks`; no limiter module exists.

**Impact.** Rate-limit responses, not data exposure. The graph client retries twice with
backoff, which can amplify load slightly.

**Fix.** Add a storage-backed per-account cool-down (for example 10 seconds) before the
demo if the site is shared. Not required for correctness.

## Checked and clean

- No external hosts: no `fetch`/`requestRemote` in `src/` or the bundled UI.
- No `asApp` graph reads; the client only calls `api.asUser().requestTeamworkGraph`.
- No declared scope is unused: each graph scope appears in at least one query; `storage:app`
  is used by cache and decisions.
- No personal data in logs: `safeLogFields` is an allowlist, and `audit.event` is the only
  logger in `src/`.
- No user input reaches Cypher text: queries are registered ahead of time and executed by
  key with typed params.
