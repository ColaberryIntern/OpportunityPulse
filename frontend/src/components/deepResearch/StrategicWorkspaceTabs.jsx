import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getOpportunityExpansion, listSubmissionArtifacts,
  activatePursuit, listResearchRevenue,
} from '../../services/deepResearchService';
import { ChannelBadge } from './ActionVisuals';

// Deep Research Phase 8 — Strategic Workspace Tabs.
//
// Sits INSIDE MyOpportunitiesPage when a strategic-context query param is
// present. Tabs scope adjacent intelligence to the same context, never
// duplicating opportunity data — the active tab pulls from the right
// Phase 1-7 system on demand.

const TABS = [
  { key: 'opportunities', label: 'Opportunities', hint: 'The default — scoped list below.' },
  { key: 'research', label: 'Research Sources', hint: 'Research-channel opportunities that contributed.' },
  { key: 'relationships', label: 'Relationships', hint: 'Recurring agencies / tech / vendors in this context.' },
  { key: 'signals', label: 'Strategic Signals', hint: 'Cross-channel signals from the originating research.' },
  { key: 'assets', label: 'Proposal Assets', hint: 'Reusable past wins + capability blurbs.' },
  { key: 'capture', label: 'Capture Intelligence', hint: 'Capture-plan view (lives on the pursuit page).' },
  { key: 'tools', label: 'Competing Tools', hint: 'AI tools already shipping in this space.' },
  { key: 'pursuits', label: 'Related Pursuits', hint: 'Existing pursuit workspaces anchored to this context.' },
];

function TabButton({ tab, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(tab.key)}
      className={`text-xs px-3 py-1.5 rounded border whitespace-nowrap ${
        active
          ? 'bg-cyan-600 text-white border-cyan-600 font-semibold'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
      }`}
      title={tab.hint}
      data-testid={`workspace-tab-${tab.key}`}
    >
      {tab.label}
    </button>
  );
}

export default function StrategicWorkspaceTabs({
  active, onChange, strategicContext, onActivatePursuit,
}) {
  return (
    <div className="mb-4">
      <div className="flex gap-2 flex-wrap mb-2" data-testid="workspace-tabs">
        {TABS.map((t) => (
          <TabButton key={t.key} tab={t} active={active === t.key} onClick={onChange} />
        ))}
        {strategicContext && onActivatePursuit && (
          <button
            type="button"
            onClick={onActivatePursuit}
            className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 ml-auto whitespace-nowrap"
            data-testid="workspace-activate-pursuit"
            title="Create a new pursuit workspace anchored to this context."
          >
            + Activate Pursuit
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500">
        {TABS.find((t) => t.key === active)?.hint || ''}
      </p>
    </div>
  );
}

// Tab panels — light read-only views over the existing systems.
// Designed to fail soft: if the underlying API returns nothing, the panel
// renders a friendly "no data" state.

export function ResearchTabPanel({ rows }) {
  const research = (rows || []).filter((r) => r.type === 'research');
  if (research.length === 0) {
    return <p className="text-xs text-gray-500 italic">No research-channel opportunities in this context.</p>;
  }
  return (
    <ul className="space-y-2">
      {research.slice(0, 30).map((r) => (
        <li key={r.id} className="rounded border border-gray-200 p-3 text-sm">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <ChannelBadge channel="research" />
            {r.source && <span className="text-xs text-gray-500">{r.source}</span>}
            {r.publishedAt && (
              <span className="text-[11px] text-gray-400">
                {new Date(r.publishedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <h4 className="text-sm font-semibold text-gray-900">{r.title}</h4>
        </li>
      ))}
    </ul>
  );
}

export function RelationshipsTabPanel({ contextKind, contextId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    if (!contextKind || contextId == null) return;
    setLoading(true); setErr(null);
    try {
      // Reuse the Phase 8 expansion endpoint as the "relationships in context" feed.
      setData(await getOpportunityExpansion(contextKind, contextId));
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load relationships');
    } finally { setLoading(false); }
  }, [contextKind, contextId]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <p className="text-xs text-gray-500 italic">Loading relationships…</p>;
  if (err) return <p className="text-xs text-red-700">{err}</p>;
  if (!data) return <p className="text-xs text-gray-500 italic">No relationships available.</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
      {[
        ['Recurring Agencies', data.adjacentAgencies || data.adjacent_agencies || []],
        ['Recurring Technologies', data.adjacentTechnologies || data.adjacent_technologies || []],
        ['Recurring NAICS', data.recurringNaics || data.recurring_naics || []],
      ].map(([title, list]) => (
        <section key={title} className="border border-gray-200 rounded-lg p-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</h4>
          {list.length === 0 ? (
            <p className="text-gray-400 italic">None.</p>
          ) : (
            <ul className="space-y-1">
              {list.slice(0, 8).map((row, i) => (
                <li key={`${row.value}-${i}`} className="flex items-center justify-between">
                  <span className="text-gray-900 truncate flex-1 mr-2">{row.value}</span>
                  <span className="text-gray-700 font-semibold">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

export function SignalsTabPanel({ rows }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-gray-500 italic">No cross-channel signals in this context.</p>;
  }
  // Bucket by channel for a strip.
  const buckets = {};
  for (const r of rows) {
    const k = r.type || 'unknown';
    buckets[k] = (buckets[k] || 0) + 1;
  }
  return (
    <div className="flex gap-2 flex-wrap text-xs">
      {Object.entries(buckets).map(([k, n]) => (
        <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-gray-200">
          <ChannelBadge channel={k} />
          <span className="font-semibold text-gray-700">{n}</span>
        </span>
      ))}
    </div>
  );
}

export function AssetsTabPanel({ rows }) {
  // Pulls the first 5 linked opps and exposes "Manage assets on the pursuit"
  // — assets are anchored to pursuits, not opportunity sets, by design.
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-gray-500 italic">No assets to render in this context.</p>;
  }
  return (
    <p className="text-xs text-gray-600">
      Proposal assets are managed inside a pursuit workspace. Click "+ Activate Pursuit" above
      to spin up a pursuit that pre-loads matched past wins + capability blurbs against these
      opportunities.
    </p>
  );
}

export function CaptureTabPanel({ strategicContext }) {
  return (
    <div className="text-xs text-gray-700 space-y-2">
      <p>
        Capture intelligence (evaluator priorities, agency pain points, differentiators,
        incumbent risks, partnership opportunities, reusable language) lives on the pursuit
        page so it sits next to the proposal-readiness scoring + the linked opportunities.
      </p>
      <p>
        Click <strong>+ Activate Pursuit</strong> above to create a pursuit anchored to
        {strategicContext && strategicContext.kind ? ` this ${strategicContext.kind}` : ' this context'},
        then open the pursuit's "Capture Strategy" panel.
      </p>
    </div>
  );
}

export function ToolsTabPanel({ rows }) {
  // Re-uses the same channel chips — a "tools" tab inside the contextual
  // workspace shows the tech vocabulary the context is centered on; the
  // full per-report competing-tools list lives on the Deep Research report.
  const techCount = (rows || []).filter((r) => Array.isArray(r.tags) && r.tags.length > 0).length;
  return (
    <p className="text-xs text-gray-600">
      {techCount > 0
        ? `${techCount} of the ${rows.length} opportunities carry technology tags. `
        : ''}
      Per-report competing-tool analysis is available on the Deep Research report page
      (see the Competitive Landscape section).
    </p>
  );
}

export function PursuitsTabPanel({ strategicContext }) {
  if (!strategicContext) return null;
  const linked = strategicContext.linked_pursuits || [];
  if (linked.length === 0) {
    return <p className="text-xs text-gray-500 italic">No pursuits anchored to this context yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {linked.map((p) => (
        <li key={p.id}>
          <Link
            to={`/admin/deep-research/pursuits/${p.id}`}
            className="block rounded border border-gray-200 p-3 text-sm hover:border-cyan-400"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-gray-900">{p.name}</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {p.status}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Wrapper component used by MyOpportunitiesPage when in strategic mode.
// Renders the tab strip + the active tab's body.
export function StrategicWorkspaceTabsBody({
  active, rows, strategicContext, contextKind, contextId,
}) {
  switch (active) {
    case 'research': return <ResearchTabPanel rows={rows} />;
    case 'relationships': return <RelationshipsTabPanel contextKind={contextKind} contextId={contextId} />;
    case 'signals': return <SignalsTabPanel rows={rows} />;
    case 'assets': return <AssetsTabPanel rows={rows} />;
    case 'capture': return <CaptureTabPanel strategicContext={strategicContext} />;
    case 'tools': return <ToolsTabPanel rows={rows} />;
    case 'pursuits': return <PursuitsTabPanel strategicContext={strategicContext} />;
    case 'opportunities': default: return null; // default tab = the existing opp list below
  }
}
