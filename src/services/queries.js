// Teamwork Graph reads as persisted Cypher queries.
//
// Why persisted and not inline text: since September 2026 the Teamwork Graph API
// refuses arbitrary Cypher from apps. The app registers these queries once, and at
// runtime sends only `queryKey` + typed `queryParams`. That also means no user
// input is ever concatenated into a query string.
//
// Every query below returns flat scalar columns, not whole nodes, so the parser
// never has to understand node serialisation and the payload stays small.
//
// `verification` marks what has and has not been exercised against a live site.
// See docs/verification.md for the exact steps to confirm each item.

export const QUERIES = Object.freeze({
  jiraInventory: {
    key: 'keystone_jira_inventory',
    name: 'keystone-jira-inventory',
    scope: 'jira',
    verification: 'unverified',
    purpose: 'All Jira work items updated in the window, with their assignees.',
    cypher: `
MATCH (holder:AtlassianUser)-[:atlassian_user_assigned_jira_work_item]->(item:JiraWorkItem)
WHERE item.updatedAt >= $since
RETURN item.ari AS objectAri,
       item.key AS objectKey,
       item.title AS title,
       item.status AS status,
       item.priority AS priority,
       item.updatedAt AS updatedAt,
       holder.ari AS holderAri,
       holder.displayName AS holderName,
       holder.accountType AS holderAccountType,
       holder.lastActiveAt AS holderLastActiveAt
ORDER BY item.updatedAt DESC
LIMIT $limit
`.trim(),
    params: [
      { name: 'since', type: 'STRING', required: true },
      { name: 'limit', type: 'INT', required: true },
    ],
    fields: [
      'item.ari',
      'item.key',
      'item.title',
      'item.status',
      'item.priority',
      'item.updatedAt',
      'holder.ari',
      'holder.displayName',
      'holder.accountType',
      'holder.lastActiveAt',
    ],
  },

  jiraObject: {
    key: 'keystone_jira_object',
    name: 'keystone-jira-object',
    scope: 'jira',
    verification: 'unverified',
    purpose: 'One Jira work item by key, including the ownerless case.',
    cypher: `
MATCH (item:JiraWorkItem {key: $objectKey})
OPTIONAL MATCH (holder:AtlassianUser)-[:atlassian_user_assigned_jira_work_item]->(item)
RETURN item.ari AS objectAri,
       item.key AS objectKey,
       item.title AS title,
       item.status AS status,
       item.priority AS priority,
       item.updatedAt AS updatedAt,
       holder.ari AS holderAri,
       holder.displayName AS holderName,
       holder.accountType AS holderAccountType,
       holder.lastActiveAt AS holderLastActiveAt
LIMIT $limit
`.trim(),
    params: [
      { name: 'objectKey', type: 'STRING', required: true },
      { name: 'limit', type: 'INT', required: true },
    ],
    fields: ['item.*', 'holder.*'],
  },

  confluenceInventory: {
    key: 'keystone_confluence_inventory',
    name: 'keystone-confluence-inventory',
    scope: 'confluence',
    // The Confluence page ownership relationship has not been confirmed against a
    // live graph. Until it is, the Confluence surface reports this as a diagnostic
    // instead of pretending an empty result means "no risk".
    verification: 'unverified-relationship',
    purpose: 'Confluence pages updated in the window, with their last known author.',
    cypher: `
MATCH (holder:AtlassianUser)-[:atlassian_user_owns_confluence_page]->(page:ConfluencePage)
WHERE page.updatedAt >= $since
RETURN page.ari AS objectAri,
       page.id AS objectKey,
       page.title AS title,
       page.status AS status,
       null AS priority,
       page.updatedAt AS updatedAt,
       holder.ari AS holderAri,
       holder.displayName AS holderName,
       holder.accountType AS holderAccountType,
       holder.lastActiveAt AS holderLastActiveAt
ORDER BY page.updatedAt DESC
LIMIT $limit
`.trim(),
    params: [
      { name: 'since', type: 'STRING', required: true },
      { name: 'limit', type: 'INT', required: true },
    ],
    fields: ['page.ari', 'page.id', 'page.title', 'page.updatedAt', 'holder.*'],
  },

  confluenceObject: {
    key: 'keystone_confluence_object',
    name: 'keystone-confluence-object',
    scope: 'confluence',
    verification: 'unverified-relationship',
    purpose: 'One Confluence page by ARI, including the ownerless case.',
    cypher: `
MATCH (page:ConfluencePage {ari: $objectKey})
OPTIONAL MATCH (holder:AtlassianUser)-[:atlassian_user_owns_confluence_page]->(page)
RETURN page.ari AS objectAri,
       page.id AS objectKey,
       page.title AS title,
       page.status AS status,
       null AS priority,
       page.updatedAt AS updatedAt,
       holder.ari AS holderAri,
       holder.displayName AS holderName,
       holder.accountType AS holderAccountType,
       holder.lastActiveAt AS holderLastActiveAt
LIMIT $limit
`.trim(),
    params: [
      { name: 'objectKey', type: 'ARI', required: true },
      { name: 'limit', type: 'INT', required: true },
    ],
    fields: ['page.*', 'holder.*'],
  },

  teamPeers: {
    key: 'keystone_team_peers',
    name: 'keystone-team-peers',
    scope: 'jira',
    verification: 'unverified',
    purpose: 'Teammates of one holder, ordered by current assigned workload.',
    cypher: `
MATCH (subject:AtlassianUser {ari: $userAri})-[:atlassian_user_is_in_atlassian_team]->(team:AtlassianTeam)<-[:atlassian_user_is_in_atlassian_team]-(peer:AtlassianUser)
WHERE peer.ari <> $userAri
OPTIONAL MATCH (peer)-[:atlassian_user_assigned_jira_work_item]->(item:JiraWorkItem)
WHERE item.updatedAt >= $since
RETURN peer.ari AS userAri,
       peer.displayName AS displayName,
       peer.accountType AS accountType,
       team.ari AS teamAri,
       team.name AS teamName,
       count(DISTINCT item) AS activeItems
ORDER BY activeItems ASC
LIMIT $limit
`.trim(),
    params: [
      { name: 'userAri', type: 'ARI', required: true },
      { name: 'since', type: 'STRING', required: true },
      { name: 'limit', type: 'INT', required: true },
    ],
    fields: ['peer.*', 'team.*', 'count(item)'],
  },
});

export function queryForScope(scope) {
  return scope === 'confluence' ? QUERIES.confluenceInventory : QUERIES.jiraInventory;
}

export function queryForObject(kind) {
  return kind === 'confluence' ? QUERIES.confluenceObject : QUERIES.jiraObject;
}

/**
 * A flat list for the registration script and the diagnostics panel.
 */
export function listQueries() {
  return Object.values(QUERIES).map((query) => ({
    key: query.key,
    name: query.name,
    scope: query.scope,
    verification: query.verification,
    purpose: query.purpose,
  }));
}
