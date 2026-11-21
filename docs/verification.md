# Verification checklist

Everything here needs one session on a test site. Each item says exactly what to do,
what you will see if it passes, and what to change if it fails. Run them before recording
the demo; do not mark an item done because the code "looks right".

## C1 — Graph property and relationship names

**Why it matters:** a wrong property silently becomes `null`, which makes staleness 1 and
inflates every score. A wrong relationship silently returns no rows.

1. Open `https://<your-site>.atlassian.net/graphql` (GraphQL explorer) while signed in.
2. Register the queries: `npm run queries:print`, then `queries:post` with a browser cookie.
3. In the explorer, run the custom query with a small parameter set:

```graphql
query {
  customQuery(queryKey: "keystone_jira_inventory", queryParams: { since: "2026-01-01T00:00:00Z", limit: 5 }, first: 5) {
    edges { node { columns { key value { __typename value } } } }
    pageInfo { hasNextPage endCursor }
  }
}
```

4. **Pass:** every column key in `src/services/queries.js` appears in every row, with
   non-null values for at least one real object.
5. **If it fails:** the error names the unknown property or relationship. Fix only the
   Cypher string in `queries.js`, redeploy, re-register, rerun. Update test fixtures if the
   column names change.

Record the result here: `C1: ______ (date, site)`.

## C2 — Confluence ownership relationship

1. Run the same check with `keystone_confluence_inventory` on a space with known pages.
2. **Pass:** rows appear whose `holderName` matches the page's last editor.
3. **If empty:** list the relationships available on `ConfluencePage` in the explorer's
   schema and pick the one that means "owner" or "last author". Change two query strings
   and set `verification: 'verified'` in the registry.

Until this passes, the Confluence surface must stay labelled Preview.

## C3 — Confluence module deploys

1. `forge deploy`, then `forge install --product jira --product confluence`.
2. Open Confluence → Apps → Knowledge Risk Radar.
3. **Pass:** the global page loads at the configured route.
4. **If the module is rejected:** the deploy output names the missing compatibility
   configuration. Add it, or drop the Confluence module and the page scope from the
   manifest. The Jira surfaces do not depend on it.

## C4 — MCP tools appear in Rovo Studio

1. Open Rovo → Studio → create a custom agent.
2. Open the tool picker.
3. **Pass:** "Keystone risk tools" is listed and expands to three tools.
4. **If absent:** check that each key in `rovo:mcp.tools` exists under `action`, and that
   the app version installed is the latest (`forge install --upgrade`).

## C5 — Skill packaging

1. Confirm `rovo/skills/knowledge-risk/SKILL.md` exists and the directory has no other
   required file.
2. `forge deploy`.
3. **Pass:** the agent created by `rovo:agent` lists the skill, and a prompt triggers it.
4. **If deploy rejects the skill:** the error names the missing file or frontmatter field.
   Add exactly that; do not guess more metadata.

## C6 — Resolver context carries an account id

**Why it matters:** without it the cache is disabled (safe, but slower).

1. `forge tunnel`, open the issue panel, and temporarily log
   `Object.keys(event.context)` from `src/index.js` in a local branch.
2. **Pass:** an account id field exists. Add it to `resolveAccountId` in
   `src/actions/index.js`.
3. **If absent:** leave caching disabled. Never substitute a shared key.

## C7 — Issue panel context

1. Open a real Jira issue with the app installed.
2. **Pass:** the panel shows that issue's score, not an error.
3. **If the panel cannot find the issue:** `view.getContext()` lacks
   `extension.issue.key`. Read `extension.issue.id` and resolve by ARI instead.

## C8 — Query registration persists

1. After registering, reinstall the app on a *different* test site.
2. Open the radar.
3. **Pass:** data appears (registration is per site, so repeat the script if not).
4. **Expected failure mode:** an upstream error with a human message — not a fake empty
   radar. If you see an empty radar with no note, the error mapping regressed.

## C9 — Scopes are actually granted

1. As an org admin, open Atlassian Administration → Apps → the app → permissions.
2. **Pass:** the four graph scopes are individually grantable. Withhold
   `read:graph:team:atlassian` and confirm the radar still loads, while a coverage plan
   says no teammate is visible.
3. **If the radar fails entirely when one scope is withheld:** a query reads an object
   type it should not. Split the query rather than requesting a broader scope.

## C10 — No egress

1. `grep -rn "fetch(\|requestRemote\|http" src/` must return nothing that targets an
   external host.
2. Inspect the built bundle for network targets, not for URL strings: libraries embed
   documentation links (React, iframe-resizer) that are never fetched. Check every
   `fetch(`/`XMLHttpRequest` call and confirm it is relative or Forge-bridge internal.
   `grep -o "fetch([^)]\{0,60\}" static/radar/build/main.js` is the starting point.
3. **Pass:** zero requests to external hosts, zero analytics.

Record each item's date and site next to its heading before submitting.
