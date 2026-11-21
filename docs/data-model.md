# Data model and Teamwork Graph queries

## Conceptual model

Objects Keystone reads:

| Object | API object type | Scope | Used for |
| --- | --- | --- | --- |
| Jira work item | `JiraWorkItem` | `read:graph:issue:jira` | The unit of risk on the Jira surface |
| Confluence page | `ConfluencePage` | `read:graph:page:confluence` | The unit of risk on the Confluence surface |
| Person | `AtlassianUser` | `read:graph:user:atlassian` | Holders, activity, coverage |
| Team | `AtlassianTeam` | `read:graph:team:atlassian` | Intermediate object for coverage candidates |

Relationships traversed:

- `(:AtlassianUser)-[:atlassian_user_assigned_jira_work_item]->(:JiraWorkItem)`
- `(:AtlassianUser)-[:atlassian_user_is_in_atlassian_team]->(:AtlassianTeam)`
- `(:AtlassianUser)-[:atlassian_user_owns_confluence_page]->(:ConfluencePage)` — **unverified**

Every intermediate object counts for scope: the coverage query passes through
`AtlassianTeam`, so `read:graph:team:atlassian` is required even though the answer is about
people.

## Risk model

```
concentration  0.32   how much of the knowledge sits with the top holder
singlePoint    0.26   headcount failure mode (1 holder = 1.0, 4 holders ≈ 0.33, 8 ≈ 0)
criticality    0.24   0.60·priority + 0.25·status + 0.15·log-scaled dependents
staleness      0.18   days since the object was last updated / 180, capped at 1
```

`score = round(100 · Σ weight·signal)`, then:

| Rule | Floor | Why |
| --- | --- | --- |
| No effective holder, no human on record | 88 | Work nobody owns is the worst case |
| Only departed/inactive holders | 82 | Knowledge existed and has left |
| One holder and criticality ≥ 0.75 | 78 | The classic bus-factor-one |

Tiers: critical ≥ 75, high ≥ 55, moderate ≥ 35, otherwise low.

Concentration is `1 − H/log₂(n)` over holder shares. With one holder it is 1; with four
equal holders it is 0; a 90/10 split still scores above 0.5. That shape is intentional:
adding a fifth name to a list does not create coverage.

Reachable holders are humans with positive evidence of activity inside the window.
Unknown-activity accounts are shown but never counted as coverage. Bots never count.

## Query set

All queries are **persisted Cypher**, registered once with
`POST /gateway/api/twg/cypher-queries`, then executed through GraphQL `customQuery` with a
`queryKey` and typed `queryParams`. Raw Cypher at request time is refused for new apps, so
this is a platform constraint, not a preference.

| Registry key | Purpose | Params |
| --- | --- | --- |
| `keystone_jira_inventory` | Work items updated in the window, one row per (item, holder) | `since`, `limit` |
| `keystone_jira_object` | One item by key, `OPTIONAL MATCH` so ownerless items survive | `objectKey`, `limit` |
| `keystone_confluence_inventory` | Pages in the window with a holder | `since`, `limit` |
| `keystone_confluence_object` | One page by ARI | `objectKey`, `limit` |
| `keystone_team_peers` | Teammates of a holder, ordered by assigned load | `userAri`, `since`, `limit` |

Runtime document (`src/services/twg.js`):

```graphql
query KeystoneCustomQuery($queryKey: String!, $queryParams: CypherRequestParams, $first: Int, $after: String) {
  customQuery(queryKey: $queryKey, queryParams: $queryParams, first: $first, after: $after) {
    edges { node { columns { key value { __typename value } } } }
    pageInfo { hasNextPage endCursor }
  }
}
```

Line by line: the variables are typed; the query is addressed by key, never by text; the
column selection is isolated in one constant because the exact `value` union shape needs
confirmation on a live site; `pageInfo` is what makes pagination possible.

Why flat scalar columns (`RETURN item.key AS objectKey, holder.ari AS holderAri`) instead
of returning nodes: the parser never needs to understand node serialisation, payloads stay
small, and a change in node shape cannot break a score.

## Permissions

- Every read runs through `api.asUser().requestTeamworkGraph(...)`. There is no
  `asApp()` path for graph reads; `@forge/api` does not expose one, and we would not use it.
- The graph returns only rows the user can see. Curated and custom reads are
  permission-filtered server-side.
- Defence in depth: `filterVisibleObjects()` can drop anything outside an allowlist when
  the caller has one, and the summary is computed from returned rows only — never from an
  organisation-wide total.
- Missing scopes do not error; they silently omit data. That is why an empty Confluence
  result is labelled as a data-source problem, not as low risk.

## Scale

- Page size 25, at most 8 pages per scan by default (`KEYSTONE_MAX_PAGES`).
- The inventory query is `ORDER BY item.updatedAt DESC LIMIT $limit`, so the newest
  objects are read first and the app never pulls the whole graph into memory.
- Objects analysed per scan are capped (default 50, max 100); the summary reports
  `matched` separately from `displayed`, and the UI says the list is limited.
- Truncation from the page budget is reported as `GRAPH_RESULT_TRUNCATED`; it is never
  silently swallowed.
- Hourly cost: one scan is 1–8 graph calls. Cache TTL is 15 minutes, per user, so a lead
  clicking around does not re-read the graph.

## User parameters and injection

Three parameters reach the graph: `since` (ISO timestamp), `limit` (integer), `objectKey`
(issue key or page ARI). All are validated in `src/domain/validate.js` before the call:
issue keys match `^[A-Z][A-Z0-9_]{1,9}-\d{1,6}$`, ARIs match the Confluence page ARI
pattern, integers are range-checked, and free text never reaches a query. Because the Cypher
text is registered ahead of time and values bind as parameters, there is no structure to
manipulate. `assertSafeParamValue` additionally refuses arrays and objects.

## When the output would mislead

| Scenario | What we do |
| --- | --- |
| Object has no owner | Score 88+, flag `NO_HUMAN_OWNER`, recommend assigning an owner |
| Only a departed account remains | Flag `INACTIVE_OWNER_ONLY`, recommend backup owner |
| Bots appear as holders | Excluded from coverage, shown as a count only |
| Team has no visible members | `NO_TEAMMATE_VISIBLE`; UI says this may be a permission boundary |
| Window has no data | Empty state explains both causes; no zero-risk claim |
| User sees one project | All counts are scoped to returned rows; summary says "visible to you" |
| Contribution data absent | Weights default to equal; concentration stays meaningful but coarser |
