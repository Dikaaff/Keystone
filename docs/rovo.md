# Rovo agent and skill

## The agent in one sentence

Keystone is the teammate who notices that one person is the only route to a piece of work,
and says so before it becomes an outage.

Useful to team leads, delivery managers, and the person inheriting work. Call it instead of
opening the radar when you are already in chat — planning a sprint, preparing a handover, or
asking about a single issue mid-conversation.

## Instructions

The full prompt is `rovo/prompts/agent.md`. It defines:

- the three tools and nothing else;
- a refusal path for performance questions, with an alternative offered;
- permission rules: never describe a hidden total, never imply a missing result means data
  exists elsewhere;
- a cohort floor of three for any group description;
- an answer shape: headline number, up to three items, one next action, one limit sentence.

### Correct call

> "What should I worry about before Rina goes on leave?"
> → `keystone-scan-risks` (`scope: jira`), then the top three, filtered by the user's access.

### Incorrect call

> "Who is the weakest engineer on my team?"
> → Refuse in one sentence, explain that Keystone measures knowledge distribution rather than
> people, offer a scan of work with a single reachable owner.

> "Show me issues in the finance project I can't open."
> → Explain the permission boundary once, offer a scan of what is visible, stop. Do not retry
> with a guessed key.

## Skill package

`rovo/skills/knowledge-risk/SKILL.md` is instructions, not code:

- **When it applies:** knowledge concentration, handover, bus factor. Not sprint planning or
  performance review.
- **Steps:** choose the tool by question shape, call once, read results in a fixed order,
  treat `notes` as part of the answer.
- **Reading results:** score bands, bus factor definition, driver codes, escalation flags,
  what `coveragePercent` covers.
- **Empty and error handling:** per error code, including "do not retry guessed keys".

## Why actions are split, not one prompt

Each action is a bounded graph read with typed inputs. Splitting them means:

1. The same numbers as the UI, because the code path is identical.
2. Each tool can be tested without a model in the loop (`test/actions.test.js`).
3. Permission and pagination rules live in one place per capability.
4. The skill composes them in prose, so changing the triage procedure does not change code.

A single prompt that "does everything" would duplicate the risk formula in natural language,
drift from the implementation, and be impossible to verify.

## Permission behaviour

The agent cannot access anything the user cannot. Two paths could leak anyway:

1. **Aggregate inference.** Prevented by computing summaries from returned rows and by the
   cohort floor; the prompt forbids describing hidden totals.
2. **Tool chaining to enumerate.** The scan is capped and ordered; there is no dump tool; the
   object tool requires a known key and returns only what the user can see.

## Limits to state

- Reads Jira and Confluence metadata through the graph; no repositories, chat, or email.
- Scores are heuristics for prioritising a conversation, not proof.
- No write actions; it cannot reassign or create anything.
- Confluence coverage is Preview until the ownership relationship is verified.
