import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getActionIntelligence, getEvidence,
  refreshRelationships, refreshGraph, refreshAccelerationAssets,
  myOpportunitiesContextUrl,
  activatePursuit, getGraphNeighborhood,
} from '../services/deepResearchService';
import {
  StatCard, ChannelBadge, RecurringRow, OpportunityRow,
  EvidenceDrawer, RelevancePill, PursuitStatusPill,
} from '../components/deepResearch/ActionVisuals';
import OpportunityGraphCanvas from '../components/deepResearch/OpportunityGraphCanvas';

// Deep Research Phase 7 — Action Intelligence Dashboard.
// Top-level surface for evidence-backed venture execution intelligence.

function Section({ title, subtitle, right, children, testId }) {
  return (
    <section
      className="bg-white border border-gray-200 rounded-xl p-6 mb-5"
      data-testid={testId}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function ActionIntelligencePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [drawer, setDrawer] = useState(null);
  // Phase 8 — graph state.
  const [graphCenter, setGraphCenter] = useState(null);
  const [graph, setGraph] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await getActionIntelligence()); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Failed to load action intelligence'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function withBusy(fn, errLabel) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || errLabel); }
    finally { setBusy(false); }
  }

  async function openOpportunityEvidence(oppId) {
    setBusy(true); setErr(null);
    try {
      const data = await getEvidence('cluster', oppId, { limit: 50 }).catch(() => null);
      setDrawer({
        title: `Insights for opportunity #${oppId}`,
        subtitle: 'Where this opportunity has surfaced across the system.',
        opportunities: (data && data.opportunities) || [],
      });
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  // Phase 8 — graph + activation helpers.
  async function loadGraphCenter(kind, value) {
    setBusy(true); setErr(null);
    try {
      const out = await getGraphNeighborhood({ kind, value, depth: 1, maxEdges: 60 });
      setGraphCenter({ kind, value });
      setGraph(out);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load graph');
    } finally { setBusy(false); }
  }
  async function handleActivateAgency(agencyValue) {
    setBusy(true); setErr(null);
    try {
      const out = await activatePursuit({ sourceKind: 'agency', sourceId: agencyValue });
      if (out && out.pursuit && out.pursuit.id) {
        window.location.assign(`/admin/deep-research/pursuits/${out.pursuit.id}`);
      }
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }
  async function handleActivateCluster(clusterId) {
    setBusy(true); setErr(null);
    try {
      const out = await activatePursuit({ sourceKind: 'cluster', sourceId: clusterId });
      if (out && out.pursuit && out.pursuit.id) {
        window.location.assign(`/admin/deep-research/pursuits/${out.pursuit.id}`);
      }
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }

  if (loading && !data) {
    return <div className="p-6 text-center text-gray-500">Loading action intelligence…</div>;
  }

  const clusters = data?.top_actionable_clusters || [];
  const evidenceOpps = data?.strongest_evidence_opportunities || [];
  const candidates = data?.proposal_acceleration_candidates || [];
  const agencies = data?.recurring_agency_ecosystems || [];
  const graphSummary = data?.opportunity_graph || {};
  const runs = data?.recent_research_runs || [];
  const pursuits = data?.pursuit_readiness || [];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              🎯 Action Intelligence
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 font-medium">
                Evidence-Backed Venture Execution
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Every recommendation links to the underlying contracts, jobs, grants, and research.
              No autonomous bidding — humans approve every move.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => withBusy(() => refreshRelationships(), 'Refresh failed')}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-40"
            >
              Refresh Relationships
            </button>
            <button
              type="button"
              onClick={() => withBusy(() => refreshGraph(), 'Refresh failed')}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-40"
            >
              Refresh Graph
            </button>
            <button
              type="button"
              onClick={() => withBusy(() => refreshAccelerationAssets(), 'Refresh failed')}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-40"
            >
              Refresh All
            </button>
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5" data-testid="ai-kpis">
          <StatCard label="Top Clusters" value={clusters.length} sub="actionable today" />
          <StatCard label="Evidence-Backed Opps" value={evidenceOpps.length} sub="strongest signals" />
          <StatCard label="Recurring Agencies" value={agencies.length} sub="ecosystem signal" />
          <StatCard label="Graph Edges" value={graphSummary.total_edges || 0} sub="across all entities" />
        </div>

        <Section
          title="Top Actionable Clusters"
          subtitle="Click into any cluster to drill down to its underlying opportunities."
          testId="section-clusters"
        >
          {clusters.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No active clusters yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {clusters.map((c) => (
                <div
                  key={c.id}
                  className="block rounded-lg border border-gray-200 p-4 hover:border-cyan-400 transition-colors"
                  data-testid={`cluster-${c.id}`}
                >
                  <Link to={`/admin/deep-research/clusters/${c.id}`} className="block">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900">{c.name}</h3>
                      <span className="text-xs font-semibold text-gray-500">
                        {c.opportunityCount || 0} opps
                      </span>
                    </div>
                    {c.description && <p className="text-xs text-gray-600">{c.description}</p>}
                  </Link>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    <Link
                      to={myOpportunitiesContextUrl('cluster', c.id)}
                      className="text-[11px] px-2 py-1 rounded bg-cyan-100 text-cyan-700 hover:bg-cyan-200"
                    >
                      Open in My Opps →
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); handleActivateCluster(c.id); }}
                      disabled={busy}
                      className="text-[11px] px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-40"
                      data-testid={`activate-cluster-${c.id}`}
                    >
                      + Activate Pursuit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Strongest Evidence-Backed Opportunities"
          subtitle="Opportunities referenced by the most insights, weighted by mean relevance."
          testId="section-evidence-opps"
        >
          {evidenceOpps.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No traced opportunities yet.</div>
          ) : (
            <div className="grid gap-2">
              {evidenceOpps.map((row) => (
                <div key={row.opportunity_id} className="rounded border border-gray-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ChannelBadge channel={row.opportunity.type} />
                      <span className="text-xs text-gray-500">{row.opportunity.source}</span>
                      <RelevancePill relevance={row.mean_relevance} />
                      <span className="text-[11px] text-gray-500">
                        × {row.insight_count} insight{row.insight_count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openOpportunityEvidence(row.opportunity_id)}
                      className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    >
                      Where used?
                    </button>
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900 leading-snug">
                    {row.opportunity.title}
                  </h4>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Proposal Acceleration Candidates"
          subtitle="Live opportunities where we have multiple reusable proposal assets to leverage."
          testId="section-acceleration"
        >
          {candidates.length === 0 ? (
            <div className="text-xs text-gray-400 italic">
              No matching candidates — refresh acceleration assets or wait until past wins land.
            </div>
          ) : (
            <div className="grid gap-2">
              {candidates.map((c) => (
                <div key={c.opportunity.id} className="rounded border border-gray-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ChannelBadge channel={c.opportunity.type} />
                      <span className="text-xs font-semibold text-gray-700">
                        {c.asset_count} matching asset{c.asset_count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <Link
                      to={`/admin/deep-research/pursuits/new?opportunity=${c.opportunity.id}`}
                      className="text-[11px] px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    >
                      Create Pursuit
                    </Link>
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900 leading-snug">
                    {c.opportunity.title}
                  </h4>
                  <ul className="mt-2 space-y-0.5 text-[11px] text-gray-500">
                    {c.top_assets.map((a) => (
                      <li key={a.id}>• {a.kind} — {a.label}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Recurring Agency Ecosystems"
          subtitle="Agencies that appear across multiple opportunities — high-leverage proposal targets."
          testId="section-agencies"
        >
          {agencies.length === 0 ? (
            <div className="text-xs text-gray-400 italic">
              No recurring agencies yet — refresh relationships to compute.
            </div>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {agencies.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2 px-3 border-b border-gray-100 text-xs"
                >
                  <div className="flex-1 truncate">
                    <span className="text-gray-900 font-medium">{a.value}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <span className="font-semibold text-gray-700">{a.occurrenceCount}</span>
                    <Link
                      to={myOpportunitiesContextUrl('agency', a.value)}
                      className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-700 hover:bg-cyan-200"
                    >
                      Open in My Opps →
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleActivateAgency(a.value)}
                      disabled={busy}
                      className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-40"
                      data-testid={`activate-agency-${a.id}`}
                    >
                      + Activate
                    </button>
                    <button
                      type="button"
                      onClick={() => loadGraphCenter('agency', a.value)}
                      disabled={busy}
                      className="px-2 py-0.5 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-40"
                    >
                      Graph
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Pursuit Readiness"
          subtitle="Open and in-progress proposal pursuit workspaces."
          testId="section-pursuits"
          right={
            <Link
              to="/admin/deep-research/pursuits/new"
              className="text-xs px-2 py-1 rounded bg-cyan-600 text-white hover:bg-cyan-700"
            >
              + New Pursuit
            </Link>
          }
        >
          {pursuits.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No active pursuits.</div>
          ) : (
            <div className="grid gap-2">
              {pursuits.map((p) => (
                <Link
                  key={p.id}
                  to={`/admin/deep-research/pursuits/${p.id}`}
                  className="rounded border border-gray-200 p-3 text-sm hover:border-cyan-400 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-gray-900">{p.name}</h4>
                    <PursuitStatusPill status={p.status} />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {p.anchorKind} #{p.anchorId} · {(p.linkedOpportunityIds || []).length} opportunities linked
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Section>

        {/* Phase 8 — Force-directed opportunity graph. */}
        <Section
          title="Opportunity Graph"
          subtitle={graphCenter
            ? `Centered on ${graphCenter.kind} "${graphCenter.value}". Click any node to recenter or open evidence.`
            : 'Click the "Graph" button next to any recurring agency above to render the neighborhood.'}
          testId="section-graph"
          right={graphCenter && (
            <button
              type="button"
              onClick={() => { setGraphCenter(null); setGraph(null); }}
              className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
            >
              Clear
            </button>
          )}
        >
          {graphCenter && graph ? (
            <OpportunityGraphCanvas
              nodes={graph.nodes || []}
              edges={graph.edges || []}
              width={900}
              height={500}
              onNodeClick={(n) => {
                if (n.kind === 'opportunity') {
                  openOpportunityEvidence(Number(n.value));
                } else {
                  loadGraphCenter(n.kind, n.value);
                }
              }}
            />
          ) : (
            <p className="text-xs text-gray-500 italic">No graph rendered yet.</p>
          )}
        </Section>

        <Section
          title="Custom Strategic Research Runs"
          subtitle="Saved searches across all channels. Click to rerun and diff over time."
          testId="section-runs"
          right={
            <Link
              to="/admin/deep-research/research-runs"
              className="text-xs px-2 py-1 rounded bg-cyan-600 text-white hover:bg-cyan-700"
            >
              Manage Runs
            </Link>
          }
        >
          {runs.length === 0 ? (
            <div className="text-xs text-gray-400 italic">No saved runs yet.</div>
          ) : (
            <div className="grid gap-2">
              {runs.map((r) => (
                <Link
                  key={r.id}
                  to={`/admin/deep-research/research-runs?focus=${r.id}`}
                  className="rounded border border-gray-200 p-3 text-sm hover:border-cyan-400 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-gray-900">{r.name}</h4>
                    <span className="text-xs text-gray-500">{r.lastMatchCount || 0} matches</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 italic">{r.query}</p>
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>

      <EvidenceDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        title={drawer?.title || ''}
        subtitle={drawer?.subtitle || ''}
        opportunities={drawer?.opportunities || []}
      />
    </div>
  );
}

export default ActionIntelligencePage;
