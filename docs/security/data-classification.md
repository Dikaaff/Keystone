# Data classification, privacy, and ethics

## Three tiers

| Tier | Examples in Keystone | Storage | Display | Logs | Agent output |
| --- | --- | --- | --- | --- | --- |
| **Public** | App name, methodology, score tier labels, scope list | Not stored | Always | Allowed | Allowed |
| **Internal** | Object key, title, status, priority, risk score, coverage percentage, team names | Only the derived summary in a per-user cache (15 min); decisions keyed by hashes | In the product, to users who can already see the object | Only counts and our own query keys | Summarised; object keys allowed if already returned to that user |
| **Sensitive** | Person's name, account id, last-activity recency, the fact that one person is the sole owner, user-written notes | Names/recency are never persisted; notes are user-initiated, capped at 280 chars | Only to users who can see the object; no people-level ranking | Never — `safeLogFields` has no field for them | Names only when the tool returned them; never a ranking of people |

## Does data leave Atlassian?

No. Concretely:

- All code runs in Forge functions and Forge-hosted Custom UI assets.
- Graph reads use `api.asUser().requestTeamworkGraph`; no external HTTP client is used.
- There is no `requestRemote`, no `fetch`, no webtrigger, no CDN, no analytics, and no
  external LLM. The Rovo path is Atlassian's own model and tool runtime.
- `package.json` contains no telemetry or egress dependency.
- The only outbound calls in the repository are in `scripts/register-queries.mjs`, a
  build-time script run by a human against the site's own gateway. It is not bundled into
  the app and never runs in production.

What would have to change if this were violated: a privacy notice listing the recipient,
a data-processing agreement, a deletion path for the external copy, and a Marketplace
review conversation. Rather than absorb that cost, the app refuses the capability.

## Ethics: is this employee surveillance?

It can become that if the product is framed as "who is a bottleneck". The design avoids it
in four concrete ways:

1. **The object is scored, not the person.** Every score belongs to an issue or page. There
   is no per-person score anywhere in the data model, API, UI, agent, or MCP tools.
2. **Coverage is the positive metric.** The headline number is the share of work with at
   least one reachable owner; the action is "spread knowledge", not "flag a person".
3. **No people ranking.** Coverage candidates are ranked by shared team and current load,
   and the caveat says load is not expertise. There is no "most critical employee" list.
4. **Small groups are suppressed.** A count of one or two people is not displayed as a
   cohort, because it identifies individuals even when every individual row is permitted.

## Risks that remain

- A manager can still read the table as a judgement about the single holder. Mitigation:
  language in UI and prompt names the object ("held by one person"), and the PRD's
  non-goals forbid performance scoring.
- Activity recency is a proxy. Someone on parental leave looks inactive; the UI therefore
  says "not currently reachable", not "disengaged", and an inactive owner is treated as a
  handover risk rather than a performance signal.
- Decisions recorded by one lead are visible to that lead only (keyed by account id). This
  avoids creating a hidden record about an employee that a new manager inherits.

## Retention

- Cache: 15 minutes, then ignored.
- Decisions: until the user overwrites them; no history, no diff, no audit trail of who
  decided what beyond the record itself.
- Logs: platform retention; content is absent by construction.
- No deletion workflow is needed for graph data because none is copied.
