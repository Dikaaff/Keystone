import React, { useState } from 'react';
import ForgeReconciler, {
  Button,
  DynamicTable,
  Heading,
  Label,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Strong,
  Text,
  Textfield,
} from '@forge/react';
import { requestJira } from '@forge/bridge';

const riskTone = (risk) => (risk === 'Critical' ? 'removed' : risk === 'High' ? 'moved' : 'inprogress');

const scanProject = async (projectKey) => {
  const response = await requestJira('/rest/api/3/search/jql', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jql: `project = "${projectKey}" ORDER BY updated DESC`,
      maxResults: 100,
      fields: ['summary', 'assignee', 'priority'],
    }),
  });
  if (!response.ok) throw new Error(`Jira search failed (${response.status})`);

  const { issues = [] } = await response.json();
  const ownerCounts = issues.reduce((counts, issue) => {
    const owner = issue.fields.assignee?.displayName || 'Unassigned';
    counts[owner] = (counts[owner] || 0) + 1;
    return counts;
  }, {});

  return issues.map((issue) => {
    const { assignee, priority, summary } = issue.fields;
    const owner = assignee?.displayName || 'Unassigned';
    const ownerShare = ownerCounts[owner] / Math.max(issues.length, 1);
    const isCritical = ['Highest', 'High'].includes(priority?.name);
    return {
      key: issue.key,
      summary,
      owner,
      priority: priority?.name || 'Unset',
      ownerShare: Math.round(ownerShare * 100),
      risk: isCritical && ownerShare >= 0.25 ? 'Critical' : ownerShare >= 0.25 ? 'High' : 'Medium',
    };
  }).filter((item) => item.owner !== 'Unassigned' && item.ownerShare >= 25)
    .sort((a, b) => b.ownerShare - a.ownerShare);
};

const createTransferTask = async (projectKey, item) => {
  const response = await requestJira('/rest/api/3/issue', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        summary: `Knowledge transfer: ${item.summary}`,
        issuetype: { name: 'Task' },
        description: {
          type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{
            type: 'text',
            text: `Keystone detected concentrated knowledge in ${item.key}. Pair with ${item.owner} to document and verify this work before it becomes a single point of failure. Risk: ${item.risk}. Owner share: ${item.ownerShare}%.`,
          }] }],
        },
        labels: ['keystone-knowledge-transfer'],
      },
    }),
  });
  if (!response.ok) throw new Error(`Could not create Jira task (${response.status})`);
  return response.json();
};

const App = () => {
  const [projectKey, setProjectKey] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(null);
  const [message, setMessage] = useState('Enter a Jira project key to scan for single-owner work.');

  const handleScan = async () => {
    const key = projectKey.trim().toUpperCase();
    if (!key) { setMessage('Enter a project key first, for example ENG.'); return; }
    setLoading(true);
    setMessage('Scanning recent Jira work for concentrated ownership...');
    try {
      const items = await scanProject(key);
      setResults(items);
      setMessage(items.length
        ? `Found ${items.length} work item${items.length === 1 ? '' : 's'} that may need knowledge transfer.`
        : 'No concentrated ownership found in the first 100 issues.');
    } catch (error) {
      setResults([]);
      setMessage(`${error.message}. Check the project key and your Jira permissions.`);
    } finally { setLoading(false); }
  };

  const handleCreateTask = async (item) => {
    setCreating(item.key);
    try {
      const created = await createTransferTask(projectKey.trim().toUpperCase(), item);
      setMessage(`Created ${created.key}: a knowledge-transfer task is now in Jira.`);
    } catch (error) { setMessage(error.message); }
    finally { setCreating(null); }
  };

  const rows = results.map((item) => ({
    key: item.key,
    cells: [
      { key: 'issue', content: <Text><Strong>{item.key}</Strong> — {item.summary}</Text> },
      { key: 'owner', content: <Text>{item.owner} ({item.ownerShare}%)</Text> },
      { key: 'priority', content: <Text>{item.priority}</Text> },
      { key: 'risk', content: <Lozenge appearance={riskTone(item.risk)}>{item.risk}</Lozenge> },
      { key: 'action', content: <Button appearance="primary" isLoading={creating === item.key} onClick={() => handleCreateTask(item)}>Create transfer task</Button> },
    ],
  }));

  return (
    <Stack space="space.200">
      <Heading as="h1">Keystone</Heading>
      <Text>Find work that depends on one person, then turn the risk into an executable knowledge-transfer task.</Text>
      <SectionMessage title="How this scan works" appearance="information">
        Keystone scans up to 100 recently updated issues and flags owners responsible for at least 25% of the project&apos;s assigned work. High-priority work becomes Critical.
      </SectionMessage>
      <Stack space="space.100">
        <Label labelFor="project-key">Jira project key</Label>
        <Textfield id="project-key" placeholder="For example, ENG" value={projectKey} onChange={(event) => setProjectKey(event.target.value)} />
        <Button appearance="primary" isLoading={loading} onClick={handleScan}>Scan for knowledge concentration</Button>
      </Stack>
      <Text>{message}</Text>
      {loading && <Spinner size="medium" />}
      {!loading && results.length > 0 && (
        <DynamicTable
          head={{ cells: [
            { key: 'issue', content: 'Work item' }, { key: 'owner', content: 'Single owner' },
            { key: 'priority', content: 'Priority' }, { key: 'risk', content: 'Risk' }, { key: 'action', content: 'Action' },
          ] }}
          rows={rows}
          rowsPerPage={10}
        />
      )}
    </Stack>
  );
};

ForgeReconciler.render(<App />);
