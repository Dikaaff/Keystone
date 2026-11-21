---
name: keystone-knowledge-risk-triage
description: Triage knowledge-loss risk in Jira and Confluence — scan for concentrated ownership, explain one object's risk, and propose receiving owners. Use when someone asks what work depends on a single person, who understands a specific issue or page, or how to spread ownership before someone leaves.
---

# Knowledge risk triage

## When this skill applies

Use it when the user asks about knowledge concentration, single-person dependencies,
handover preparation, bus factor, or "what breaks if this person leaves". Do not use
it for sprint planning, workload balancing as a management goal, or performance review.

## Steps

1. Decide the shape of the question.
   - Organisation/team level → `keystone-scan-risks` with `scope: "jira"` (or `"confluence"`).
   - One object → `keystone-object-risk` with the issue key or page ARI.
   - "Who could take over?" → `keystone-coverage-plan`.
2. Call one tool. Do not chain tools speculatively; each call costs a graph read.
3. Read the result in this order: `summary` → `items[].score` and `tier` → `drivers` →
   `holders` / `busFactor` → `notes`.
4. Treat `notes` as part of the answer, not as noise. `NO_DATA_IN_WINDOW`,
   `GRAPH_RESULT_TRUNCATED`, and `QUERY_NOT_VERIFIED_ON_THIS_SITE` change what you may claim.
5. Reply in the format below.

## Reading results

- `score` is 0–100. `critical` ≥ 75, `high` ≥ 55, `moderate` ≥ 35.
- `busFactor` counts reachable, non-bot holders. `0` means nobody recorded can be asked today.
- `drivers` are the two largest contributors to the score, as codes such as
  `CONCENTRATION` and `STALENESS`. Translate them into plain language.
- `flags` such as `NO_HUMAN_OWNER`, `INACTIVE_OWNER_ONLY`, and
  `SINGLE_POINT_OF_FAILURE` are the cases worth escalating.
- `summary.coveragePercent` covers only the objects the user can see. Never describe it
  as an organisation-wide figure.

## Empty and error results

- Empty list: say no objects were found in the window for what the user can see. Name the
  two plausible causes (narrow window, limited access). Do not say "no risk exists".
- `NOT_FOUND`: the object does not exist or is not visible. Do not retry with guessed keys.
- `PERMISSION_DENIED`: state the boundary once, offer a scan of what is visible, and stop.
- `RATE_LIMITED` / `UPSTREAM_UNAVAILABLE`: say the graph is busy or unreachable, that nothing
  changed, and suggest trying again shortly. Do not retry more than once.
- `GRAPH_SCOPE_MISSING`: explain that an org admin has to grant the data type, and stop.

## Response shape

1. One sentence with the headline number.
2. Up to three items: key, score/tier, strongest driver.
3. One recommended next action a human can actually take this week.
4. One sentence on the limits of the data if any `notes` apply.

## Never

- Name a cohort smaller than three people, or imply how large a hidden group is.
- Describe a holder as a risk, a bottleneck, or irreplaceable as a person.
- Present cached or partial results as complete.
