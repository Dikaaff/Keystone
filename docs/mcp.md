# MCP: what actually happens

## What exposing an action does

`rovo:mcp` takes **action keys** from the same app and publishes them as tools for
**custom agents in Rovo Studio**, inside the site where the app is installed. When a
customer's agent calls one, Forge runs the referenced function as the person interacting
with the agent. Nothing is hosted by Keystone, and there is no public MCP endpoint.

What does **not** happen: we do not stand up a remote MCP server, we do not accept
connections from arbitrary clients, and we do not hold a service token that could act
without a user.

## Tools exposed

| Tool (action key) | Inputs | Output bound | Why it is useful to an outside agent |
| --- | --- | --- | --- |
| `keystone-scan-risks` | `scope` (jira/confluence), `limit` 1–100, `sinceDays` 7–730 | Top 50 by default, max 100 objects; 1–8 graph calls | An agent planning a sprint or a handover can ask "what is at risk for this person's work" |
| `keystone-object-risk` | `objectKey` (issue key or page ARI) | One object, 10 holders max | The most common question in chat: "why is this one risky" |
| `keystone-coverage-plan` | `objectKey` | Up to 5 candidates | Turns a finding into an action without leaving chat |

Deliberately not exposed: `keystone-record-coverage`. Writing a decision from an external
agent conflates "an agent suggested it" with "a human decided it". Recording stays in the
panel where a person is looking at the full context.

## Identity and permissions

The tool call carries the invoking user's identity through Rovo/Forge; the function then
reads the graph with `api.asUser()`. There is no elevated path: `asApp()` is not used for
graph reads, and `@forge/api` does not even expose `requestTeamworkGraph` on `asApp()`.
An agent cannot exceed the user's visibility, and the agent prompt forbids trying to infer
a hidden total from partial results.

## Activation (for the judge's site)

1. Deploy and install the app.
2. Open **Rovo** in the site, then **Studio** (custom agents).
3. Create a custom agent, and add tools from the app's MCP server (name shown: *Keystone
   risk tools*).
4. Grant the agent a chat surface, and ask: "What knowledge risks should I worry about this
   week?"

Exact menu labels can shift; the reliable check is that `Keystone risk tools` appears in
the tool picker. If it does not, the `rovo:mcp` module or its action keys are wrong, and
`forge deploy` output will name the mismatch.

## Security risks specific to external clients

| Risk | Control |
| --- | --- |
| Enumeration by repeated calls | Page and result caps; no bulk export tool; no "list all objects" tool |
| Parameter abuse (huge windows, deep pagination) | Validated integer ranges and a page budget per call |
| Prompt-injected instructions to dump data | Actions return bounded summaries; content fields are not exposed; the agent has no write tool |
| Confused deputy (agent acting as a privileged installer) | Every call runs as the interacting user, never as the app |
| Silent partial answers | Results carry `notes` (`GRAPH_RESULT_TRUNCATED`, `NO_DATA_IN_WINDOW`), and the agent instruction requires relaying them |

## Abuse limits

A tool call with an invalid key returns `ok: false` plus a human message; it does not retry.
Repeated calls are bounded by the same page budget and the 15-minute per-user cache. The
graph client retries at most twice, only on 429/5xx, with backoff, so a misbehaving client
cannot amplify a rate limit into an outage.

## Claim discipline

For Codegeist, the honest claim is: **Keystone exposes its read-only risk tools to custom
agents in Rovo Studio through `rovo:mcp`.** It does not run a public MCP server, and the
submission should not say it does.
