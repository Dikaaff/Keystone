# Demo video and submission text

Target length: 4:20. Screen recording, no slides except a two-second title card.

## Structure

| Time | On screen | Narration (one core sentence) |
| --- | --- | --- |
| 0:00–0:25 | A real issue with one assignee and no watchers; cursor on "Assignee". Then the person's team page showing they moved teams. | "This work has exactly one person who understands it, and last month that person changed teams." |
| 0:25–0:55 | Cut to the successor's first week: the issue, the missing context, the unanswered question in comments (blur names). | "Nothing broke that day. It broke three weeks later, and nobody could trace why." |
| 0:55–1:25 | Open Jira → Apps → Knowledge Risk Radar on the demo site. Let the summary cards land for two seconds. | "Keystone reads the Teamwork Graph and shows where knowledge is concentrated, right now." |
| 1:25–2:05 | Click the top row. Read the two drivers aloud. Open the coverage plan; point at the load column and the caveat. | "It doesn't just score: it names the reason and the people who could take over." |
| 2:05–2:30 | Record a paired-review decision; close and reopen the row to show it recorded. | "The decision is recorded, so the next person doesn't reopen the same conversation." |
| 2:30–2:55 | Open an issue and show the panel on that issue. | "The same analysis lives where the work lives, in one glance." |
| 2:55–3:25 | Open Rovo chat. Ask: "Which work in my projects depends on one person?" Show the agent calling `keystone-scan-risks` and the same numbers. | "Rovo answers the same question in chat, with the same tools and the same permissions." |
| 3:25–3:50 | Show the agent refusing a performance question, then the MCP tool list in Rovo Studio. | "It refuses to rank people, and its tools are read-only." |
| 3:50–4:20 | Back to the radar, zoom on the footnote: source, window, "visible to you". Cut to the methodology panel. | "Every number says what it covers and who it excludes — because a knowledge tool that becomes a surveillance tool is worse than none." |

## Where each bonus prize is visible

| Claim | Must be seen on screen, not just said |
| --- | --- |
| **Rovo agent** | The agent responds in Rovo chat and its tool call is visible |
| **Rovo skill** | The agent's skill list shows the packaged skill; a prompt triggers it |
| **MCP** | Rovo Studio tool picker showing the three Keystone tools |
| **Teamwork Graph** | The panel data matches an issue's real assignee and activity; mention that it is read as the user |

Do not claim a public MCP endpoint; it does not exist.

## What must be real data

- The issue, its assignee, team membership, and last activity — from the demo site.
- The score and list ordering — from the app, unedited.
- The coverage candidates — from the graph, even if the result is thin.

What may be prepared in advance: the demo site's data set (seeded issues, teams, one
departed owner), the Rovo agent, and the open tabs. Do not hand-edit numbers in the UI.

## Five common hackathon video mistakes, and our answer

1. **Opening with a logo or feature list.** We open with a person's problem on a real screen.
2. **Narrating the UI ("here is the button").** We narrate the meaning of the result, not the clicks.
3. **A demo path that only works with prepared data.** The same flow is tested on an ownerless object and an empty window, and both are shown in the repo tests.
4. **Claiming a capability that is not on screen.** MCP is shown in Studio; the public-endpoint claim is removed.
5. **Running long on setup.** Install steps are in the README; the video starts after install.

## Submission text

### How the project meets the technology requirement

Keystone is a Forge app whose data layer is the Teamwork Graph API. It reads `JiraWorkItem`,
`AtlassianUser`, `AtlassianTeam`, and `ConfluencePage` through persisted Cypher queries
executed as the signed-in user, with per-object-type scopes. It packages the same actions
for Rovo agents, a `rovo:skill`, and `rovo:mcp`. The UI is Forge-hosted Custom UI. There is
no external server and no outbound network call.

### Category and bonus paragraphs

- **Category:** [fill in the chosen Codegeist category] — the app reduces operational risk
  from knowledge loss, with a measurable coverage metric.
- **Rovo agent/skill:** agent prompt and skill package in `rovo/`; three read-only actions
  shared with the UI.
- **MCP:** three tools exposed to Rovo Studio custom agents; recording is deliberately not
  exposed.
- **Teamwork Graph:** five persisted queries; permission-filtered reads; scope-per-object.

### Repository materials required

- `README.md`: how to run, install, and register queries.
- `docs/data-model.md`: object model, scoring math, query walkthrough.
- `manifest.yml`: scope list with inline justification.
- `docs/verification.md`: the honest list of what is verified and what is not.
