# Keystone

## Knowledge Risk Radar for Jira and Confluence

Keystone helps teams find work that depends on one person before that knowledge becomes a single point of failure. It analyses the knowledge distribution around Jira issues and Confluence pages, explains why an object is risky, and suggests practical coverage actions.

Keystone is built entirely on **Atlassian Forge** and the **Teamwork Graph**. It respects the signed-in user's visibility and does not send Atlassian data to an external service.

> Built for Atlassian Codegeist 2026.

## Why Keystone exists

Most teams can see activity, ownership, and project status. They cannot easily see where important knowledge is concentrated in one reachable person, becoming stale, or lacking a realistic backup.

Keystone turns that hidden dependency into an actionable conversation:

1. Find high-risk Jira issues or Confluence pages.
2. Explain the signals behind each risk score.
3. Identify colleagues who may be able to provide coverage.
4. Record the human decision used to spread the knowledge.

Keystone evaluates the **object**, never the value or performance of a person. A risk score is a prioritisation heuristic, not a personnel assessment.

## Product surfaces

| Surface | Purpose |
| --- | --- |
| Jira issue panel | Shows the issue's risk, key drivers, possible holders, and coverage plan. |
| Jira global page | Provides an organisation-level radar of critical, ownerless, stale, and concentrated work visible to the user. |
| Confluence global page | Applies the same radar model to Confluence pages; this surface remains subject to live-site verification. |
| Rovo agent and skill | Answers questions such as "What knowledge risks should I worry about this week?" using the same action layer. |
| Rovo MCP tools | Exposes the read-only risk tools to compatible custom agents. |

## What makes the implementation different

- **A transparent risk model.** Four weighted signals and escalation rules produce an explainable score in `src/domain/risk.js`.
- **Ownership classification.** Humans, bots, deactivated accounts, and unknown activity are treated separately in `src/domain/ownership.js`.
- **Permission-aware analysis.** Results are scoped to what the signed-in user can see through the Teamwork Graph.
- **One action layer.** The UI, Rovo, and MCP integrations use the same domain and action code.
- **Persisted graph queries.** Queries are registered once and invoked by key with typed parameters.
- **Human-in-the-loop coverage.** Keystone suggests a next step; a person decides how to spread the knowledge.

## Architecture

```text
Jira / Confluence
       |
Teamwork Graph + persisted queries
       |
Forge action layer
   /       |       \\\
  UI     Rovo     MCP
       |
Risk model + coverage plan + app storage
```

```text
manifest.yml              Forge modules, permissions, actions, and Rovo configuration
src/domain/               Risk, ownership, visibility, validation, and errors
src/services/             Teamwork Graph client, queries, cache, configuration, and audit
src/actions/              Shared actions consumed by the UI, Rovo, and MCP
src/ui/                   React Custom UI for the issue panel and radar
src/index.js              Forge function entry points
rovo/                     Rovo agent and skill definitions
scripts/                  Persisted-query registration and probe utilities
test/                     Node.js test suite
docs/                     Architecture, security, verification, data model, and demo notes
```

## Requirements

- Node.js 22 or newer
- An Atlassian Cloud test site
- Atlassian admin access to deploy and install a Forge app
- Forge CLI 14 or newer

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Run checks

```bash
npm test          # Run the domain, query, and action tests
npm run build     # Build the Custom UI bundle
npm run check     # Run tests and build
```

### 3. Authenticate with Forge

```bash
npm install --global @forge/cli
forge login
forge register
```

Replace the placeholder `app.id` in `manifest.yml` with the ID returned by `forge register` if the CLI does not update it automatically.

### 4. Deploy to a development site

```bash
forge lint
forge deploy
forge install --product jira
forge install --product confluence
```

When scopes or manifest modules change, deploy the new version and upgrade the existing installation:

```bash
forge deploy
forge install --upgrade
```

For faster UI iteration, use the Forge tunnel where supported:

```bash
forge tunnel
```

## Register and verify Teamwork Graph queries

The app uses persisted queries. Registration requires an app owner's authenticated browser session and should be performed once per site.

Print the exact payload without sending it anywhere:

```bash
npm run queries:print
```

Post the queries using environment variables. Keep the cookie secret and never commit it:

```bash
KS_SITE=yourtenant \\\
KS_APP_ID=ari:cloud:ecosystem::app/... \\\
KS_COOKIE='<cookie header>' \\\
npm run queries:post
```

Probe a registered query before trusting the UI:

```bash
KS_SITE=yourtenant \\\
KS_COOKIE='<cookie header>' \\\
npm run queries:probe -- keystone_jira_inventory '{"since":"2026-01-01T00:00:00Z","limit":5}'
```

The complete live-site checklist is in [`docs/verification.md`](docs/verification.md). Marketplace and dual-app guidance is in [`docs/marketplace.md`](docs/marketplace.md).

## Permissions and data boundaries

| Scope | Use |
| --- | --- |
| `read:graph:issue:jira` | Read Jira work items and assignee relationships. |
| `read:graph:page:confluence` | Read Confluence page relationships. |
| `read:graph:user:atlassian` | Read holder identity and activity signals. |
| `read:graph:team:atlassian` | Find potential coverage candidates through team relationships. |
| `storage:app` | Cache per-user summaries and store coverage decisions. |

Keystone does not request Jira write scopes, content scopes, chat or email access, or external hosts. It does not read source code or evaluate individual performance.

More detail is available in [`docs/security/data-classification.md`](docs/security/data-classification.md), [`docs/security/threat-model.md`](docs/security/threat-model.md), and [`docs/security/audit.md`](docs/security/audit.md).

## Project status and known limitations

The core risk model, ownership classification, shared actions, UI, Rovo configuration, and automated tests are implemented. Before production or Marketplace release, complete the live-site verification checklist.

Known limitations:

- Some Teamwork Graph field names and the Confluence ownership relationship are marked `unverified` until tested against a live site.
- Contribution weighting currently defaults to equal weighting because the contribution relationship is not yet confirmed.
- Coverage suggestions indicate shared team membership and current load; they are not proof of expertise.
- Results are intentionally limited to objects visible to the current user.

## Documentation

- [Architecture](docs/architecture.md)
- [Product requirements](docs/PRD.md)
- [Data model](docs/data-model.md)
- [Security and data classification](docs/security/data-classification.md)
- [Threat model](docs/security/threat-model.md)
- [Rovo integration](docs/rovo.md)
- [MCP integration](docs/mcp.md)
- [Live verification checklist](docs/verification.md)
- [Demo script](docs/demo-script.md)
- [Marketplace checklist](docs/marketplace.md)

## Contributing

Keep domain logic deterministic and independently testable. Changes that affect risk scoring, visibility, permissions, or data handling should include tests and documentation updates.

Before opening a pull request:

```bash
npm run check
forge lint
git diff --check
```

Do not commit Atlassian cookies, app credentials, generated build artifacts, or private site data.

## License

This repository does not currently declare an open-source license. All rights are reserved unless the repository owner states otherwise.
