# Keystone — Knowledge Risk Radar

Keystone finds the work that would break if one person left, then helps spread it.
It runs entirely on Atlassian Forge, reads the Teamwork Graph as the signed-in user,
and sends no data anywhere else.

Built for **Atlassian Codegeist 2026**.

---

## The problem, in one paragraph

Every organisation has work that exactly one person understands: the payroll migration,
the page everyone links to but nobody maintains, the integration only one engineer can
debug. That knowledge is invisible while the person is present and catastrophic when
they are not — and it is not recoverable after they leave. Existing tools show activity,
not dependency. Keystone shows dependency: which objects have one reachable holder, how
concentrated that knowledge is, how stale it is, and who nearby could take it over.

## What it does

| Surface | What the user gets |
| --- | --- |
| **Jira issue panel** | That issue's risk score, the one or two reasons it scored that way, who can be asked today, and a coverage plan. |
| **Jira global page** | Organisation-level radar: critical objects, ownerless work, coverage percentage, and a ranked table — scoped to what the viewer can see. |
| **Confluence global page** | The same radar for pages (Preview; see `docs/verification.md` C3). |
| **Rovo agent + skill** | "What depends on one person?" answered in chat, using the same three tools. |
| **Rovo MCP** | The same read-only tools exposed to custom agents in Rovo Studio. |

## Why this is not a wrapper

- The score is a real model with four weighted signals, two escalation rules, and tests
  for each boundary: `src/domain/risk.js`.
- Ownership is classified, not counted: bots, deactivated accounts, and accounts whose
  activity is unknown are separated from reachable humans: `src/domain/ownership.js`.
- Queries are persisted Cypher traversals over the Teamwork Graph, registered once and
  then called by key with typed parameters — never string-built SQL/Cypher.
- One action layer serves UI, agent, and MCP. No `if (surface === 'mcp')` branches.

## Run it

```bash
npm install
npm test          # 41 domain/query/action tests, no network
npm run build     # bundles the Custom UI into static/radar/build
```

Then, with the Forge CLI installed and logged in:

```bash
forge register                      # prints the app id
# put that id in manifest.yml -> app.id
forge deploy
forge install --product jira --product confluence
```

Register the graph queries once per site (needs an owner's browser session):

```bash
npm run queries:print               # inspect exactly what would be sent
KS_SITE=yourtenant KS_APP_ID=ari:cloud:ecosystem::app/... \
KS_COOKIE='<cookie header>' npm run queries:post
```

Full verification steps, including the items that need a live site, are in
[`docs/verification.md`](docs/verification.md).

## Permissions

Five scopes, each earning its place. Justifications are written for the Marketplace
review form in [`docs/marketplace.md`](docs/marketplace.md).

| Scope | Why |
| --- | --- |
| `read:graph:issue:jira` | Read Jira work items and their assignees from the graph. |
| `read:graph:user:atlassian` | Read holder identity and last-activity data. |
| `read:graph:team:atlassian` | Traverse user → team → teammate for coverage candidates. |
| `read:graph:page:confluence` | Read Confluence pages for the Confluence surface. |
| `storage:app` | Cache one user's summary, and store coverage decisions. |

No `read:jira-work`, no content scopes, no write scopes, no external hosts.

## Repository map

```
manifest.yml              Forge modules (surfaces, actions, Rovo agent/skill/MCP, scopes)
src/domain/               Pure logic: risk, ownership, visibility, validation, errors
src/services/             Teamwork Graph client, persisted queries, cache, config, audit
src/actions/              One action layer used by UI, Rovo, and MCP
src/ui/                   Custom UI (React): issue panel + radar + coverage drawer
src/index.js              Forge entry points declared in the manifest
rovo/                     Agent prompt and SKILL.md package
scripts/                  Persisted-query registration
test/                     node:test suite
docs/                     PRD, architecture, data model, security, Marketplace, demo
```

## Honest limitations

- The graph field names and the Confluence ownership relationship are marked
  `unverified` in code and listed in `docs/verification.md`. They need one session on a
  real site before the Confluence surface can be called done.
- Contribution weighting is equal-by-default because a contribution relationship is not
  yet confirmed; concentration is still meaningful, but coarser than it will be.
- Keystone reads no source code, chat, email, or anything outside Atlassian — by design,
  and because the submission is bound by "data does not leave the platform".
