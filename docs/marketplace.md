# Marketplace readiness

## Scope justifications (copy-paste for the review form)

| Scope | What it is used for | Why a narrower scope is not enough |
| --- | --- | --- |
| `read:graph:issue:jira` | Read Jira work items and their assignee relationship to compute knowledge risk | The product's unit of analysis is a work item; without it there is nothing to score |
| `read:graph:user:atlassian` | Read holder identity, account type, and last-activity recency | Coverage must exclude bots and departed accounts; identity is required to do that, and to name who can be asked |
| `read:graph:team:atlassian` | Traverse user → team → teammate for coverage suggestions | The coverage plan needs a legitimate candidate set; team membership is the smallest signal that justifies suggesting a colleague |
| `read:graph:page:confluence` | Read Confluence pages for the Confluence surface | Pages are a separate object type with its own scope; an admin can withhold it and the Jira surface still works |
| `storage:app` | Cache one user's analysis for 15 minutes and store coverage decisions | Without it every panel open re-reads the graph; decisions are the app's only user-authored data |

No write scopes. No content scopes. No `read:jira-work` (the app never calls the Jira REST
API). No user-impersonation scope.

## External hosts

**None.** The app makes no network request outside Atlassian. There is no server, no
webtrigger, no remote, no analytics, no external LLM. `scripts/register-queries.mjs` calls
the site's own gateway, runs at build/install time by a human, and is not part of the app.

## Listing copy

**Short description (under 160 characters):**
Keystone shows where work depends on one person, then helps spread that knowledge before it
walks out the door. Runs entirely on Atlassian.

**How it works:**
Keystone reads the Teamwork Graph as the signed-in user, groups work items and pages by who
actually holds them, and scores each object on concentration, single-point risk, criticality,
and staleness. The radar shows the highest risks visible to that user; the issue panel shows
one object; the coverage plan suggests teammates by shared team and current load. Rovo can
answer the same questions in chat from the same tools.

**Privacy note:**
No data leaves Atlassian. Raw content is never stored; the cache holds a computed summary
keyed to one user for 15 minutes, and coverage decisions are stored only when a user records
one. Logs contain event codes and counts, never names, keys, or titles.

## Pre-submit checklist, longest lead time first

1. **Vendor verification** for the developer account (can take weeks).
2. **Privacy and security review ticket** — start it before polishing the UI; it needs the
   scope table above and the "no external hosts" statement.
3. **App id and production install** on the review site, with the persisted queries
   registered there.
4. **Listing assets**: icon, screenshots from real data, short description, privacy policy.
5. **Demo instance** with realistic (not fabricated) data, and a judge-facing install link.
6. **Version note**: which app version the video shows.
7. **Support contact** and a response expectation.

## The trap: listing vs installation link

Once an app is submitted for Marketplace listing, the installation link used for judging can
stop working as a sharing mechanism. Prepare two apps:

- **App A — judge build**: private/unlisted, installation link generated from
  `forge install --upgrade`, query set registered on the demo site. Use this link in the
  submission.
- **App B — listing build**: registered for Marketplace review, same code, separate app id.

Both manifests must have their own `app.id`. Keep the code identical; only the id differs.
Do not submit App A for listing.

## What commonly delays review, and whether we have it

| Delay cause | Do we have it? | Note |
| --- | --- | --- |
| Scopes that do not match behaviour | No | Four graph scopes each map to a named query; storage maps to cache and decisions |
| External host not declared | No | There are none |
| Storing personal data without saying so | No | Cache is per-user summaries; the form must still mention it |
| Missing privacy policy | Risk | Must be written before submit; the note above is the source |
| Broad `read:graph:jira` scope | No | Uses per-object-type scopes only |
| Unverified install on a clean site | Risk | Run the full install on an empty site, as the judge will |
| Screenshots with customer data | Risk | Record only on test data |
| Unclear pricing/licensing | Risk | Free during hackathon; state it explicitly |
