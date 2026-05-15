import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getClusterDrilldown, refreshClusterDrilldown, getJustification,
  rebuildEvidence, createPursuit,
} from '../services/deepResearchService';
import {
  StatCard, OpportunityRow, EvidenceDrawer, JustificationCard,
  TermChip, RecurringRow,
} from '../components/deepResearch/ActionVisuals';

// Deep Research Phase 7 — Cluster drilldown workspace.

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

function ClusterDrilldownPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [justification, setJustification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [d, j] = await Promise.all([
        getClusterDrilldown(id),
        getJustification('cluster', id, { rebuild: false }).catch(() => null),
      ]);
      setData(d); setJustification(j);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load cluster drilldown');
    } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function withBusy(fn, errLabel) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || errLabel); }
    finally { setBusy(false); }
  }

  async function handleCreatePursuit() {
    if (!data || !data.cluster) return;
    setBusy(true); setErr(null);
    try {
      const oppIds = (data.opportunities || []).slice(0, 25).map((o) => o.id);
      const created = await createPursuit({
        name: `${data.cluster.name} pursuit`,
        anchorKind: 'cluster', anchorId: data.cluster.id,
        summary: data.cluster.description, linkedOpportunityIds: oppIds,
      });
      window.location.assign(`/admin/deep-research/pursuits/${created.id}`);
    } catch (e) { setErr(e?.response?.data?.message || e.message); setBusy(false); }
  }

  async function openEvidence() {
    setBusy(true); setErr(null);
    try {
      setDrawer({
        title: `Supporting opportunities for ${data.cluster.name}`,
        subtitle: `${(data.opportunities || []).length} opportunities classified into this cluster.`,
        opportunities: data.opportunities || [],
      });
    } finally { setBusy(false); }
  }

  if (loading && !data) {
    return <div className="p-6 text-center text-gray-500">Loading cluster drilldown…</div>;
  }
  if (!data || !data.cluster) {
    return <div className="p-6 text-center text-gray-500">Cluster not found.</div>;
  }

  const cluster = data.cluster;
  const drilldown = data.drilldown || {};
  const opportunities = data.opportunities || [];
  const filtered = search.trim()
    ? opportunities.filter((o) =>
      ((o.title || '') + ' ' + (o.description || '')).toLowerCase()
        .includes(search.toLowerCase()))
    : opportunities;
  const themes = drilldown.themes || [];
  const maxTheme = themes.reduce((m, t) => Math.max(m, t.count || 0), 0);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <Link
              to="/admin/deep-research/action-intelligence"
              className="text-xs text-cyan-700 hover:underline"
            >
              ← Action Intelligence
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">{cluster.name}</h1>
            {cluster.description && (
              <p className="text-sm text-gray-600 mt-1">{cluster.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => withBusy(() => refreshClusterDrilldown(id), 'Refresh failed')}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-40"
            >
              Refresh Drilldown
            </button>
            <button
              type="button"
              onClick={() => withBusy(() => rebuildEvidence('cluster', id), 'Refresh failed')}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-40"
            >
              Rebuild Evidence
            </button>
            <button
              type="button"
              onClick={handleCreatePursuit}
              disabled={busy || opportunities.length === 0}
              className="px-3 py-2 rounded-md bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-40"
            >
              Create Pursuit Workspace
            </button>
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard label="Opportunities" value={opportunities.length} sub="in this cluster" />
          <StatCard label="Agencies" value={(drilldown.agencies || []).length} sub="recurring" />
          <StatCard label="Technologies" value={(drilldown.technologies || []).length} sub="recurring" />
          <StatCard label="NAICS Codes" value={(drilldown.naics || []).length} sub="recurring" />
        </div>

        {justification && (
          <Section title="Strategic Justification" testId="section-justification">
            <JustificationCard justification={justification} onShowEvidence={openEvidence} />
          </Section>
        )}

        {themes.length > 0 && (
          <Section title="Recurring Themes" testId="section-themes">
            <div className="flex flex-wrap gap-1.5">
              {themes.map((t) => <TermChip key={t.term} term={t.term} count={t.count} max={maxTheme} />)}
            </div>
          </Section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          {[
            ['Recurring Agencies', drilldown.agencies, 'section-agencies'],
            ['Recurring Technologies', drilldown.technologies, 'section-tech'],
            ['Recurring Vendors', drilldown.vendors, 'section-vendors'],
            ['NAICS Codes', drilldown.naics, 'section-naics'],
          ].map(([title, list, testId]) => (
            <section
              key={title}
              className="bg-white border border-gray-200 rounded-xl p-5"
              data-testid={testId}
            >
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{title}</h2>
              {(!list || list.length === 0) ? (
                <p className="text-xs text-gray-400 italic">None detected yet.</p>
              ) : (
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  {list.slice(0, 8).map((row, i) => (
                    <div key={`${row.value}-${i}`} className="flex items-center justify-between py-2 px-3 border-b border-gray-100 text-xs last:border-b-0">
                      <span className="text-gray-900 truncate flex-1 mr-2">{row.value}</span>
                      <span className="text-gray-700 font-semibold">{row.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>

        <Section
          title="Underlying Opportunities"
          subtitle="Searchable + filterable. Click any row to inspect the source record."
          testId="section-opportunities"
          right={
            <input
              type="text"
              placeholder="Search opportunities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-gray-300"
            />
          }
        >
          {filtered.length === 0 ? (
            <div className="text-xs text-gray-400 italic">
              {opportunities.length === 0
                ? 'No classified opportunities yet.'
                : 'No opportunities match the current search.'}
            </div>
          ) : (
            <div className="grid gap-2 max-h-[600px] overflow-y-auto">
              {filtered.map((o) => <OpportunityRow key={o.id} opp={o} />)}
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

export default ClusterDrilldownPage;
