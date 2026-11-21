# Architecture

## Why these modules

| Module | Chosen because | Rejected alternative |
| --- | --- | --- |
| `jira:issuePanel` | The risk has to appear where the work already is. A panel needs no new tab, no new habit. | A dashboard-only app; nobody opens a new tab mid-triage. |
| `jira:globalPage` | The ten-second organisation read needs room for cards and a table. | Issue panel alone: cannot show distribution or coverage. |
| `confluence:globalPage` | Pages are the other half of institutional knowledge. | A Confluence macro: macros run inside a page where a manager will not look for an org view. |
| `function` + resolver | Forge-native execution; no server, no domain, no outbound host. | Forge Remote: adds an external host, which the project constitution forbids. |
| `action` | One definition reused by the agent, the skill, and MCP. | Separate per-surface handlers: guarantees drift between surfaces. |
| `rovo:agent` | Chat is where planning questions are actually asked. | A second UI. |
| `rovo:skill` | Packages the triage procedure as instructions, not code, so it can be reused by other agents. | One giant prompt: untestable, unshareable. |
| `rovo:mcp` | Lets a customer's own Rovo Studio agent use Keystone's reads. | Custom remote MCP server: outside Atlassian, forbidden. |
| `storage:app` | Per-user cache and human decisions, nothing else. | External database: outside Atlassian, forbidden. |

Deliberately absent: `webtrigger` (no unauthenticated entry point), `scheduledTrigger`
(no background collection in v1), `graph:connector` (Keystone reads the graph; it does not
ingest a third-party system, so a connector would be a misleading bonus claim).

## Manifest shape

See `manifest.yml`. Properties that come from the published reference but have not been
exercised on a live site are commented `# VERIFY:` and listed in `docs/verification.md`.
The app id is a placeholder until `forge register` runs.

## Responsibility split

| Layer | Runs in | Holds |
| --- | --- | --- |
| UI (`src/ui`) | Browser, Forge-hosted static assets | Render state, filters, selection, optimistic "recording…" state |
| Resolver (`src/index.js`) | Forge function | Operation dispatch, error envelope, no business rules |
| Actions (`src/actions`) | Forge function | Validation, graph reads, analysis, shaping, cache, audit |
| Domain (`src/domain`) | Forge function, pure | Scoring, ownership classification, visibility, validation |
| Graph client (`src/services/twg.js`) | Forge function | Pagination, retry, error mapping, column parsing |

What crosses between UI and backend: typed operation names, scalar filters, and payloads
whose shape is defined in `src/actions/shape.js`. No raw graph rows cross. No credentials
exist in the UI at all.

## Custom UI over UI Kit

The radar needs a distribution bar, per-row risk meters, and a drawer that keeps the table
in view. UI Kit can build native panels but not those visual comparisons without fighting
the component set. Custom UI is therefore the choice — with a cost we accept: we own the
styling, so `styles.css` deliberately reuses Atlassian tokens (N-series ink, 8px line,
#0C66E4 accent) and the risk palette only appears as signal.

The issue panel uses the same bundle and switches on `moduleKey`, so there is one build
and one resolver.

## Where data lives

| Data | Location | Retention |
| --- | --- | --- |
| Scan summaries | Forge storage, keyed by account id + query + params | 15 minutes (configurable) |
| Coverage decisions | Forge storage, keyed by account id + object hash | Until overwritten |
| Raw graph rows | Never persisted | — |
| Object titles and holder names | Returned to the UI only | — |
| Logs | Event name + allowlisted scalars | Forge log retention |

What we intentionally do not store: page bodies, issue descriptions, comments, query
text, person-level risk histories, or any cross-user aggregate.

## What breaks deployment or review, most likely first

1. Scope names that do not match the graph's per-object-type scopes — deploy fails with a
   missing-scope error. Checked against the published scope reference; still verify on site.
2. App id not replaced after `forge register`.
3. Confluence module installed without product compatibility — see C3.
4. Persisted queries not registered on the site, so `customQuery` returns nothing. The app
   surfaces this as an upstream failure, not as empty data.
5. Custom UI resource path not built (`npm run build` before `forge deploy`).
6. Rovo skill directory without `SKILL.md`, or a tool key not present in the action list.
7. Marketplace privacy form claiming "no data stored" while `storage:app` is requested —
   the form must mention the cache and decisions.
