import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';

import { PanelView, RadarView, ErrorState, LoadingState } from './views.jsx';
import './styles.css';

function App() {
  const [context, setContext] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    view
      .getContext()
      .then(setContext)
      .catch(() => setError(new Error('Keystone could not read the Jira context. Reload the page.')));
  }, []);

  if (error) return <div className="ks-root"><ErrorState error={error} /></div>;
  if (!context) return <div className="ks-root"><LoadingState label="Starting Keystone…" /></div>;

  const isIssuePanel =
    context.moduleKey === 'keystone-issue-panel' || Boolean(context.extension?.issue?.key);

  if (isIssuePanel) {
    const issueKey = context.extension?.issue?.key;
    if (!issueKey) {
      return (
        <div className="ks-root ks-root--panel">
          <ErrorState error={{ message: 'Open an issue to see its knowledge risk.' }} />
        </div>
      );
    }
    return <PanelView issueKey={issueKey} />;
  }

  return <RadarView />;
}

createRoot(document.getElementById('root')).render(<App />);
