import React, { useEffect, useState } from 'react';
import {
  coveragePlan as fetchCoveragePlan,
  objectRisk as fetchObjectRisk,
  recordCoverage,
  scanRisks,
} from './api.js';

const TIER_LABEL = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

const DRIVER_LABEL = {
  CONCENTRATION: 'Knowledge is concentrated in too few people',
  SINGLE_POINT: 'One person is the only route to this work',
  CRITICALITY: 'The work itself is high consequence',
  STALENESS: 'Nobody with context has touched it recently',
};

const FLAG_LABEL = {
  NO_HUMAN_OWNER: 'No human owner recorded',
  NO_EFFECTIVE_OWNER: 'Owner recorded but not currently reachable',
  INACTIVE_OWNER_ONLY: 'Only a departed or inactive owner remains',
  SINGLE_POINT_OF_FAILURE: 'Single point of failure',
};

const NOTE_LABEL = {
  QUERY_NOT_VERIFIED_ON_THIS_SITE: 'Ownership data for this view has not been verified on this site yet. Treat the list as indicative.',
  GRAPH_RESULT_TRUNCATED: 'The graph returned more data than Keystone reads per scan. Only the most recently updated objects are included.',
  LIST_LIMITED_TO_TOP_RESULTS: 'Only the highest-risk objects are listed. The totals above describe this list.',
  NO_DATA_IN_WINDOW: 'No objects matched the window. That can mean a quiet period or limited access — not that no risk exists.',
};

const DECISIONS = [
  { value: 'PAIRED_REVIEW', label: 'Paired review' },
  { value: 'BACKUP_OWNER', label: 'Assign a backup owner' },
  { value: 'DOCUMENTED', label: 'Document the decisions' },
  { value: 'DEFERRED', label: 'Defer' },
];

export function RiskPill({ tier }) {
  return <span className={`ks-pill ks-pill--${tier}`}>{TIER_LABEL[tier] ?? tier}</span>;
}

function Meter({ value }) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="ks-meter" role="img" aria-label={`${width} out of 100`}>
      <span className="ks-meter__fill" style={{ width: `${width}%` }} />
    </div>
  );
}

export function LoadingState({ label = 'Reading the knowledge graph…' }) {
  return (
    <div className="ks-state" role="status" aria-live="polite">
      <div className="ks-state__title">{label}</div>
      <div className="ks-state__body">
        Keystone only reads what you already have access to, so this can take a moment.
      </div>
      <div className="ks-skeleton" />
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="ks-state ks-state--error" role="alert">
      <div className="ks-state__title">Keystone couldn’t answer</div>
      <div className="ks-state__body">{error?.message ?? 'Something went wrong.'}</div>
      <div className="ks-state__hint">
        Nothing was changed. {error?.code ? `Reference: ${error.code}.` : ''}
      </div>
      {onRetry ? (
        <button className="ks-button" type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ scope, windowDays }) {
  const what = scope === 'confluence' ? 'Confluence pages' : 'Jira work items';
  return (
    <div className="ks-state">
      <div className="ks-state__title">Nothing to show in this window</div>
      <div className="ks-state__body">
        Keystone found no {what} updated in the last {windowDays} days that you can see. This
        usually means the window is too narrow, or your access covers projects with no recent
        activity.
      </div>
      <div className="ks-state__hint">Widen the window, or check with your admin about graph access.</div>
    </div>
  );
}

export function NotesBanner({ notes = [], query }) {
  const visible = notes.filter((note) => NOTE_LABEL[note]);
  const unverified = query && query.verification !== 'verified';
  if (visible.length === 0 && !unverified) return null;

  return (
    <div className="ks-notes">
      {visible.map((note) => (
        <p key={note}>{NOTE_LABEL[note]}</p>
      ))}
      {unverified ? (
        <p className="ks-notes__meta">
          Data source status: <strong>{query.verification}</strong>. Verification steps are in
          docs/verification.md.
        </p>
      ) : null}
    </div>
  );
}

export function SummaryCards({ summary, windowDays }) {
  const cards = [
    {
      label: 'Objects analysed',
      value: summary.analysed,
      hint: `last ${windowDays} days, visible to you`,
    },
    {
      label: 'Critical or high',
      value: summary.critical + summary.high,
      hint: `${summary.critical} critical · ${summary.high} high`,
      emphasis: summary.critical > 0,
    },
    {
      label: 'No reachable owner',
      value: summary.ownerless + summary.noEffectiveOwner,
      hint: `${summary.singleHolder} more held by one person`,
      emphasis: summary.ownerless > 0,
    },
    {
      label: 'Coverage',
      value: summary.coveragePercent === null ? '—' : `${summary.coveragePercent}%`,
      hint: 'have at least one reachable owner',
    },
  ];

  return (
    <div className="ks-cards">
      {cards.map((card) => (
        <div className={`ks-card${card.emphasis ? ' ks-card--warn' : ''}`} key={card.label}>
          <div className="ks-card__label">{card.label}</div>
          <div className="ks-card__value">{card.value}</div>
          <div className="ks-card__hint">{card.hint}</div>
        </div>
      ))}
    </div>
  );
}

export function Distribution({ summary }) {
  const total = Math.max(1, summary.analysed);
  const rows = [
    ['critical', summary.critical],
    ['high', summary.high],
    ['moderate', summary.moderate],
    ['low', summary.low],
  ];

  return (
    <div className="ks-distribution">
      <div className="ks-distribution__title">Risk distribution</div>
      <div className="ks-distribution__bar">
        {rows.map(([tier, count]) =>
          count > 0 ? (
            <span
              key={tier}
              className={`ks-distribution__seg ks-distribution__seg--${tier}`}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${TIER_LABEL[tier]}: ${count}`}
            />
          ) : null,
        )}
      </div>
      <div className="ks-distribution__legend">
        {rows.map(([tier, count]) => (
          <span key={tier}>
            <i className={`ks-dot ks-dot--${tier}`} /> {TIER_LABEL[tier]} {count}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RiskTable({ items, onSelect, selectedKey }) {
  return (
    <div className="ks-table-wrap">
      <table className="ks-table">
        <caption className="ks-sr-only">
          Knowledge risk by object, highest risk first. Source: Teamwork Graph, filtered to your
          permissions.
        </caption>
        <thead>
          <tr>
            <th scope="col">Object</th>
            <th scope="col">Score</th>
            <th scope="col">Holders</th>
            <th scope="col">Last human touch</th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.objectKey}-${item.score}`}
              className={selectedKey === item.objectKey ? 'is-selected' : undefined}
            >
              <td>
                <button className="ks-link" type="button" onClick={() => onSelect(item)}>
                  {item.objectKey ?? 'Unknown object'}
                </button>
                <div className="ks-table__sub">{item.title ?? 'No title visible'}</div>
                {item.flags?.length ? (
                  <div className="ks-table__flags">
                    {item.flags.map((flag) => (
                      <span className="ks-flag" key={flag}>
                        {FLAG_LABEL[flag] ?? flag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </td>
              <td>
                <div className="ks-score">
                  <strong>{item.score}</strong>
                  <RiskPill tier={item.tier} />
                </div>
                <Meter value={item.score} />
              </td>
              <td>
                <div className="ks-holders">
                  {item.busFactor === 0
                    ? 'None reachable'
                    : `${item.busFactor} ${item.busFactor === 1 ? 'person' : 'people'}`}
                </div>
                <div className="ks-table__sub">
                  {(item.holders?.effective ?? []).slice(0, 2).map((holder) => holder.name).filter(Boolean).join(', ') || '—'}
                </div>
              </td>
              <td>
                {item.staleDays === null ? 'Unknown' : `${item.staleDays} days ago`}
                <div className="ks-table__sub">{item.status ?? 'No status'}</div>
              </td>
              <td>
                <ul className="ks-drivers">
                  {(item.drivers ?? []).map((driver) => (
                    <li key={driver.code}>{DRIVER_LABEL[driver.code] ?? driver.code}</li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CoveragePanel({ objectKey, plan, planError, loading, onClose, onRecorded }) {
  const [decision, setDecision] = useState('PAIRED_REVIEW');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [saveError, setSaveError] = useState(null);

  async function submit() {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await recordCoverage({ objectKey, decision, note: note || undefined });
      setSaved(result);
      onRecorded?.(result);
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="ks-drawer" aria-label={`Coverage plan for ${objectKey}`}>
      <div className="ks-drawer__head">
        <div>
          <div className="ks-eyebrow">Coverage plan</div>
          <h3>{objectKey}</h3>
        </div>
        <button className="ks-button ks-button--quiet" type="button" onClick={onClose}>
          Close
        </button>
      </div>

      {loading ? <LoadingState label="Looking for people who could take over…" /> : null}
      {planError ? <ErrorState error={planError} /> : null}

      {plan ? (
        <>
          {plan.candidates?.length ? (
            <ol className="ks-candidates">
              {plan.candidates.map((candidate) => (
                <li key={`${candidate.name}-${candidate.activeItems}`}>
                  <div className="ks-candidate__name">{candidate.name ?? 'Unnamed user'}</div>
                  <div className="ks-table__sub">
                    {candidate.sharedTeams?.length
                      ? `Shared team: ${candidate.sharedTeams.join(', ')}`
                      : 'No shared team visible'}
                    {' · '}
                    {candidate.activeItems} active item{candidate.activeItems === 1 ? '' : 's'}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="ks-state ks-state--inline">
              <div className="ks-state__body">
                {plan.explanation === 'NO_ANCHOR'
                  ? 'This object has no recorded owner to anchor a handover. Assign an owner first, then ask again.'
                  : 'No teammate is visible to you as a candidate. That may be a permission boundary rather than an absence of people.'}
              </div>
            </div>
          )}

          {plan.caveat ? <p className="ks-caveat">{plan.caveat}</p> : null}

          <div className="ks-record">
            <div className="ks-eyebrow">Record what you decided</div>
            <label className="ks-field">
              <span>Decision</span>
              <select value={decision} onChange={(event) => setDecision(event.target.value)}>
                {DECISIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ks-field">
              <span>Note (optional, 280 characters)</span>
              <textarea
                value={note}
                maxLength={280}
                rows={2}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Who agreed to what, and when"
              />
            </label>
            {saveError ? <ErrorState error={saveError} /> : null}
            {saved ? (
              <p className="ks-saved" role="status">
                Recorded {saved.decision.replace(/_/g, ' ').toLowerCase()} for {saved.objectKey}.
              </p>
            ) : null}
            <button className="ks-button ks-button--primary" type="button" onClick={submit} disabled={saving}>
              {saving ? 'Recording…' : 'Record decision'}
            </button>
          </div>
        </>
      ) : null}
    </aside>
  );
}

/**
 * Issue panel: the first thing visible is the score and the one reason that
 * matters. Everything else is one click away.
 */
export function PanelView({ issueKey }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [plan, setPlan] = useState(null);
  const [planState, setPlanState] = useState({ status: 'idle', error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', data: null, error: null });
    fetchObjectRisk(issueKey)
      .then((data) => !cancelled && setState({ status: 'ready', data, error: null }))
      .catch((error) => !cancelled && setState({ status: 'error', data: null, error }));
    return () => {
      cancelled = true;
    };
  }, [issueKey]);

  function openPlan() {
    setPlanState({ status: 'loading', error: null });
    fetchCoveragePlan(issueKey)
      .then((data) => {
        setPlan(data);
        setPlanState({ status: 'ready', error: null });
      })
      .catch((error) => setPlanState({ status: 'error', error }));
  }

  if (state.status === 'loading') return <div className="ks-root ks-root--panel"><LoadingState /></div>;
  if (state.status === 'error')
    return (
      <div className="ks-root ks-root--panel">
        <ErrorState error={state.error} onRetry={() => setState({ status: 'loading', data: null, error: null })} />
      </div>
    );

  const item = state.data?.item;
  if (!item) return <div className="ks-root ks-root--panel"><EmptyState scope="jira" windowDays={90} /></div>;

  return (
    <div className="ks-root ks-root--panel">
      <div className="ks-panel-head">
        <div>
          <div className="ks-eyebrow">Knowledge risk</div>
          <div className="ks-panel-score">
            {item.score}
            <span>/100</span>
          </div>
        </div>
        <RiskPill tier={item.tier} />
      </div>

      <Meter value={item.score} />

      <ul className="ks-drivers ks-drivers--panel">
        {(item.drivers ?? []).map((driver) => (
          <li key={driver.code}>{DRIVER_LABEL[driver.code] ?? driver.code}</li>
        ))}
      </ul>

      <div className="ks-panel-people">
        <div className="ks-eyebrow">Who can be asked today</div>
        {item.holders?.effective?.length ? (
          <div>{item.holders.effective.map((holder) => holder.name).filter(Boolean).join(', ')}</div>
        ) : (
          <div className="ks-warn">No reachable human owner.</div>
        )}
        {item.holders?.inactiveCount > 0 ? (
          <div className="ks-table__sub">{item.holders.inactiveCount} former or inactive holder(s) on record</div>
        ) : null}
      </div>

      {item.flags?.length ? (
        <div className="ks-table__flags">
          {item.flags.map((flag) => (
            <span className="ks-flag" key={flag}>
              {FLAG_LABEL[flag] ?? flag}
            </span>
          ))}
        </div>
      ) : null}

      <button className="ks-button ks-button--primary ks-button--block" type="button" onClick={openPlan}>
        See who could take over
      </button>

      {planState.status === 'loading' ? <LoadingState label="Checking teammates…" /> : null}
      {planState.status === 'error' ? <ErrorState error={planState.error} onRetry={openPlan} /> : null}
      {plan ? (
        <CoveragePanel objectKey={issueKey} plan={plan} planError={null} loading={false} onClose={() => setPlan(null)} />
      ) : null}

      <p className="ks-footnote">
        {item.staleDays === null ? 'Last human activity unknown' : `Last human activity ${item.staleDays} days ago`}
        {' · '}Source: Teamwork Graph, visible to you only.
      </p>
    </div>
  );
}

/**
 * Org-level radar. The ten-second read is the four summary cards plus the first
 * three rows of the table.
 */
export function RadarView() {
  const [scope, setScope] = useState('jira');
  const [windowDays, setWindowDays] = useState(90);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [selected, setSelected] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planState, setPlanState] = useState({ status: 'idle', error: null });

  function load() {
    setState({ status: 'loading', data: null, error: null });
    setSelected(null);
    setPlan(null);
    scanRisks({ scope, sinceDays: windowDays })
      .then((data) => setState({ status: 'ready', data, error: null }))
      .catch((error) => setState({ status: 'error', data: null, error }));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, windowDays]);

  function openPlan(item) {
    setSelected(item);
    setPlan(null);
    setPlanState({ status: 'loading', error: null });
    fetchCoveragePlan(item.objectKey)
      .then((data) => {
        setPlan(data);
        setPlanState({ status: 'ready', error: null });
      })
      .catch((error) => setPlanState({ status: 'error', error }));
  }

  const data = state.data;

  return (
    <div className="ks-root">
      <header className="ks-hero">
        <div>
          <div className="ks-eyebrow">Keystone</div>
          <h1>Knowledge risk radar</h1>
          <p className="ks-hero__sub">
            Where does work depend on one person, and what would it cost if they left?
          </p>
        </div>
        <div className="ks-controls">
          <label className="ks-field ks-field--inline">
            <span>Source</span>
            <select value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="jira">Jira work items</option>
              <option value="confluence">Confluence pages</option>
            </select>
          </label>
          <label className="ks-field ks-field--inline">
            <span>Window</span>
            <select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))}>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 365 days</option>
            </select>
          </label>
          <button className="ks-button" type="button" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      {state.status === 'loading' ? <LoadingState /> : null}
      {state.status === 'error' ? <ErrorState error={state.error} onRetry={load} /> : null}

      {state.status === 'ready' && data ? (
        <>
          <SummaryCards summary={data.summary} windowDays={data.windowDays} />
          <Distribution summary={data.summary} />
          <NotesBanner notes={data.notes} query={data.query} />

          {data.items.length === 0 ? (
            <EmptyState scope={data.scope} windowDays={data.windowDays} />
          ) : (
            <RiskTable items={data.items} onSelect={openPlan} selectedKey={selected?.objectKey} />
          )}

          {selected ? (
            <CoveragePanel
              objectKey={selected.objectKey}
              plan={plan}
              planError={planState.status === 'error' ? planState.error : null}
              loading={planState.status === 'loading'}
              onClose={() => {
                setSelected(null);
                setPlan(null);
              }}
            />
          ) : null}

          <details className="ks-method">
            <summary>How these numbers are produced</summary>
            <p>
              Each object is scored 0–100 from four signals: ownership concentration (32%),
              single-point risk (26%), consequence of loss (24%), and staleness (18%). A critical
              object with one reachable holder is escalated to at least 78; an object with no
              reachable owner to at least 88.
            </p>
            <p>
              Every number covers the objects shown, in the selected window, that your permissions
              allow Keystone to read. Nothing here is organisation-wide unless your access is.
              Bots and departed accounts never count as coverage.
            </p>
            <p className="ks-footnote">
              Source: Atlassian Teamwork Graph, read as you. Generated{' '}
              {new Date(data.generatedAt).toLocaleString()}
              {data.cacheHit ? ' (cached)' : ''}.
            </p>
          </details>
        </>
      ) : null}
    </div>
  );
}
