# Hardening against messy data

| # | Scenario | What happens now | What should happen | Change needed |
| --- | --- | --- | --- | --- |
| 1 | Brand-new org with no issues or pages | Query returns no rows; summary analysed 0; coverage `—`; empty state explains both possible causes | Exactly that, with no "0% risk" wording | Done |
| 2 | Critical object whose owner left | Holder is classified inactive; bus factor 0; flag `INACTIVE_OWNER_ONLY`; score ≥ 82 | Escalate above ordinary ownerless work only when the knowledge existed | Done |
| 3 | Team where every member is inactive | No effective holders; `NO_TEAMMATE_VISIBLE`; no candidate list | Say it may be a visibility boundary, not an absence | Done |
| 4 | Bot and integration accounts appear as people | `isBotIdentity` excludes by account type and name pattern; shown as a count, never as coverage | Also exclude shared/service accounts that have human-looking names | Add a configurable deny-list of account ids when a site reports one |
| 5 | Query returns tens of thousands of rows | Page budget 8 × 25; inventory ordered by `updatedAt`; truncation note | Show a result range and suppress percentages when truncated | Audit finding 4 |
| 6 | User with access to one project only | All counts come from returned rows; header says "visible to you"; no org total exists | Never label a scoped number as organisation-wide | Done in UI copy; keep it that way |
| 7 | Slow, timed-out, or failing API | Transport failures map to `UPSTREAM_UNAVAILABLE`; 429 retried twice with backoff; 5xx retried | Surface a retry and never claim "no risk" on failure | Done; consider an `AbortController` timeout |
| 8 | Two users scanning at once | Reads are per user; cache is per account id; no locks on reads | No shared mutable state | Done |
| 9 | Data changes mid-analysis | A scan is a point-in-time set of pages; an object edited during paging may appear once with older metadata | Label the result as a snapshot with `generatedAt` | Done via `generatedAt`; no cross-page consistency guarantee, documented |
| 10 | Names/titles with unusual characters | Rendered as text in React (escaped), never concatenated into HTML; query params bound | Also protect the CSV export we do not have yet | Done; no `dangerouslySetInnerHTML` anywhere |

## Assumptions that could look like a faked demo

Reviewed the whole tree for "works only because the demo data looks like this":

- No object key, project key, person, or team name appears in `src/`. The only literals are
  query field names and status/priority vocabularies.
- No fixture data is imported by runtime code. Tests build their own rows.
- The empty, ownerless, bot-only, truncated, and error paths all have explicit handling
  and tests.
- The score does not branch on a specific project or issue type.
- The UI reads the issue key from Jira context; nothing is preloaded.

The remaining demo-specific risk is environmental, not code: the persisted queries must be
registered on the demo site, and the graph field names must match. Both are on the
pre-submit checklist.
