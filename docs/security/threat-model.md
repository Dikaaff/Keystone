# Threat model

Assets: object → holder relationships, person activity recency, and the fact that a
specific person is the only owner of specific work. Secondary: coverage decisions and
notes written by users.

Attacker models considered: a curious employee inside the site, a project admin who can
install the app, an org admin inspecting logs, and an external AI client driving the MCP
tools. No anonymous internet attacker exists in this design: there is no webtrigger, no
public endpoint, and no external host.

| # | Threat | Asset | Who | Realistic path in Forge | Impact | Control |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cross-project data leak | Work items and holders outside the viewer's projects | Curious employee | The app reads the graph as the user, but a bug aggregates across all rows the app can see and shows a total | Infers existence and size of restricted projects | All reads via `api.asUser()`, no `asApp()` graph path; summary computed only from returned rows; per-user cache keyed by account id; `filterVisibleObjects` available |
| 2 | Privilege escalation | Everything readable by the app | User with app access | A function that runs as the app (`asApp`) to "make the radar faster", bypassing user ACLs | Full org visibility | No `asApp` graph calls anywhere; the graph client is the only API surface and is hard-wired to `asUser()` |
| 3 | Agent reads what the user cannot see | Restricted objects | User prompting Rovo | Ask the agent for a project the user has no access to, then infer from an "empty" answer or an aggregate | Disclosure by omission or by totals | Agent tools call the same permission-filtered actions; prompt forbids reconstructing totals; cohorts below three suppressed; empty results explicitly labelled as ambiguous |
| 4 | Query parameter manipulation | Graph data | User via UI, MCP, or agent | Inject Cypher through an issue key or window value | Read arbitrary graph data | Validated patterns for keys/ARIs, integer ranges, and a registered parameterised query; user text never concatenated; `assertSafeParamValue` refuses arrays/objects |
| 5 | Sensitive data in the wrong store | Personal data, content | Developer mistake | Cache raw rows or titles for "performance" | Data at rest beyond need, and shared across users | Cache stores summaries only, per account id; if the account id is unknown, caching is disabled; raw rows never persisted |
| 6 | Log and error leakage | Names, titles, keys | Org admin reading logs; support bundle | Log `JSON.stringify(error)` or a row on failure | Personal data in logs, retained beyond need | `audit.event` only accepts allowlisted scalars (`safeLogFields`); errors map to codes; messages never echo input |
| 7 | MCP tool abuse | Graph data | Custom agent in Rovo Studio, or a user driving it | Call a tool repeatedly with absurd parameters, or chain tools to enumerate objects | Rate-limit exhaustion, cost, enumeration | Tools are read-only (`actionVerb: GET`); inputs validated per call; page and result caps; no bulk-dump tool; record-coverage deliberately not exposed |
| 8 | Inference from aggregates | Individual facts | Manager with narrow access | View a team-level count that, combined with known facts, identifies one person | Employee surveillance effect | Cohort floor of three, hidden-group counts surfaced instead of silent drops; no people-level ranking in any response |
| 9 | Stored decision notes as content | User-entered free text | User typing sensitive details | Paste a performance complaint into the note field | Unbounded personal data in app storage | 280-character cap, control characters stripped, no Atlassian content stored, note is optional |
| 10 | Scope over-request | Customer trust, review | Developer convenience | Add `read:graph:*` broad scopes "just in case" | Extra review burden and broader exposure | Four object-type graph scopes only; the admin can withhold any one of them and the rest still works |

## Residual risk we cannot remove

- An org admin can read the app's stored decisions and logs. We minimise what exists;
  we cannot make the platform private from its admins.
- A user who can see an object can always screenshot it. Keystone does not add a channel;
  it reduces the chance that the channel is an aggregate.
- If the graph itself returns data more broadly than expected, Keystone cannot detect that.
  We rely on the platform's documented per-user filtering and keep our own filters as a
  second line.
