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

### 0. Prerequisites

The Forge CLI requires Node `^22.23.4` or `^24.22.1`. Check yours:

```bash
node -v                              # must satisfy the range above
npm install -g @forge/cli            # installs the `forge` command
forge --version
forge login                          # opens the browser, pick your Atlassian site
```

You also need admin rights on one **test** site. Do not install this on a production site
while the graph queries are unverified.

### 1. Install dependencies and check the build

```bash
npm install
npm test          # 50 domain/query/action tests, no network
npm run build     # bundles the Custom UI into static/radar/build
```

### 2. Register the app and set its id

```bash
forge register       # asks for an app name; writes app.id into manifest.yml
```

If it only prints an id, paste it into `manifest.yml` → `app.id` (replace the all-zero
placeholder).

### 3. Lint, deploy, install

```bash
npm run build            # the resource must exist before deploy
forge lint               # manifest + code checks, no deploy
forge deploy             # development environment by default
forge install --product jira
forge install --product confluence
```

`forge install` asks which site to install on. A scope change is a new app version:
deploy, then `forge install --upgrade`.

### 4. Register the graph queries (once per site)

Needs an app owner's signed-in browser session, because registration is not available to
the app runtime.

```bash
npm run queries:print    # inspect exactly what would be sent; nothing leaves the machine
KS_SITE=yourtenant KS_APP_ID=ari:cloud:ecosystem::app/... \
KS_COOKIE='<cookie header>' npm run queries:post
```

Get the cookie from the site: DevTools → Network → any `atlassian.net` request → Request
Headers → copy the whole `cookie` value. Treat it as a secret; the script only reads it
from the environment.

### 5. Prove the columns before trusting the UI

```bash
KS_SITE=yourtenant KS_COOKIE='<cookie>' \
npm run queries:probe -- keystone_jira_inventory '{"since":"2026-01-01T00:00:00Z","limit":5}'
```

This runs the same GraphQL document the app uses and prints the column keys plus two
sample rows. That is verification item C1; repeat with
`keystone_confluence_inventory` for C2.

Full verification steps are in [`docs/verification.md`](docs/verification.md), and the
Marketplace/dual-app checklist is in [`docs/marketplace.md`](docs/marketplace.md).

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
