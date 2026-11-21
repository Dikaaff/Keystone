# PRD — Keystone

## 1. The problem

Work accumulates around specific people, and organisations have no reliable way to see
it. A service is understood by one engineer, a compliance page is maintained by one
analyst, a weekly report only one person knows how to produce. When that person changes
team, takes leave, or leaves, the work does not fail immediately — it fails weeks later,
in a way nobody can trace back to the cause. Activity tools make this worse by showing
who is busy, which is not the same as who is the only route to the work.

## 2. Who this is for

1. **The person who uses it daily — a team lead (engineering manager, support lead).**
   They see the same issues every week and need to know which one has a handover problem
   before the next planning cycle.
2. **The person who suffers most — the successor.** Someone who inherited work with no
   written trail, no second reviewer, and no one to ask. They need to know what to learn
   next and from whom.
3. **The person who signs the budget — the Head of Engineering or Director of Operations.**
   They need a defensible, per-quarter number: how much critical work has a single
   reachable owner, and is it improving?

## 3. Core workflow

1. A lead opens **Knowledge Risk Radar** from Jira's apps menu.
2. They see how many visible objects are critical, ownerless, or held by one person in the
   last 90 days.
3. They open the top item and read the two drivers — concentration and staleness, for
   example — rather than a black-box score.
4. They click **See who could take over** and get up to five colleagues, ranked by shared
   team and current load, with an explicit warning that load is not expertise.
5. They agree a handover with the team, then record the decision (paired review, backup
   owner, documented, or deferred).
6. The decision is shown back on the object, so the next person does not re-open the same
   conversation.
7. Optionally, they ask the Rovo agent the same question in chat during a planning
   meeting, and get the same numbers.

Seven steps, one of which (step 7) is optional.

## 4. What we are not building in this version

| Not building | Why |
| --- | --- |
| A performance or utilisation score per person | It changes the product's meaning, invites surveillance concerns, and would fail the ethics test in `docs/security/data-classification.md`. |
| Write access to Jira (auto-reassign, auto-create issues) | Every handover needs a human agreement; automation would create silent ownership changes. |
| Slack, email, or repository ingestion | Data must not leave Atlassian, and the graph is the only source we can authorise safely. |
| A public MCP endpoint reachable from arbitrary clients | `rovo:mcp` exposes tools to Rovo Studio custom agents, not to the open internet. Claiming otherwise would be false. |
| Trend history over months | It needs a scheduled aggregation and a retention policy we have not justified for v1. |
| Notifications and nagging | The value is a decision made once, not another alert stream. |

## 5. Definition of done

A feature is done when this is visible on screen, on real site data:

- For a scan: a summary whose counts equal the number of rows in the table, a window label,
  and a footnote naming the source and the permission boundary.
- For an issue: a score, a tier, two named drivers, and a holder list where bots and
  departed accounts are excluded — verifiably, by comparing against the issue's assignee.
- For an ownerless object: a score of at least 88 and the flag "No human owner recorded",
  not a crash and not "low risk".
- For an empty result: an explanation of why it can be empty, never a zero-risk claim.
- For a failure: a human sentence, an error code, and a retry that works.
- For Rovo and MCP: the same numbers as the panel, for the same object and user.

## 6. Success metrics (all from Atlassian data)

| Metric | How it is computed | Target for the pilot |
| --- | --- | --- |
| Visible critical/ownerless objects | Count of scanned objects with score ≥ 75 or no reachable owner | Establish baseline; the number is the product's reason to exist |
| Coverage percentage | Share of visible objects with ≥ 1 reachable, non-bot holder | +10 points within one quarter |
| Decisions recorded per active lead | `coverage.recorded` events, per user, per month | ≥ 2 |
| Repeat scan within 14 days | Distinct users scanning twice | ≥ 40% of pilot leads |

No satisfaction survey is used as a success signal.

## 7. Risks, ranked, with mitigations

1. **The graph data is too sparse or field names differ from the docs.** Mitigation:
   queries return flat columns and every assumption is listed in `docs/verification.md`;
   the UI shows the query verification status instead of pretending.
2. **Judges read the score as a judgement of people.** Mitigation: language and UI never
   name a person as the risk; the agent prompt forbids it; the PRD's non-goals say it.
3. **Permission inference via aggregates.** Mitigation: counts are scoped to returned rows,
   cohorts below three are suppressed, and the agent is instructed never to describe a
   hidden total.
4. **Graph rate limits make the radar slow during a demo.** Mitigation: page budget, retry
   with backoff, per-user cache, and a UI that explains truncation.
5. **Scope creep into Confluence ownership before the relationship is verified.**
   Mitigation: Confluence is labelled Preview and cannot block the Jira demo path.

## 8. Assumptions to verify before submission

| Assumption | Status | How to verify |
| --- | --- | --- |
| `JiraWorkItem`, `AtlassianUser`, `AtlassianTeam` and the two documented relationships exist with these property names | Unverified | GraphQL explorer on a test site; steps in `docs/verification.md` C1 |
| Confluence page ownership can be traversed as `atlassian_user_owns_confluence_page` | Unverified | Same, C2 |
| `rovo:mcp` tools appear in Rovo Studio for an installed app | Unverified | Install on a test site, open Rovo Studio, C4 |
| A `rovo:skill` directory needs only `SKILL.md` plus optional files | Verified against the published manifest reference | Deploy and open the agent, C5 |
| Resolver context carries an account id for cache keying | Unverified | Log the context keys once with `forge tunnel`, C6 |
