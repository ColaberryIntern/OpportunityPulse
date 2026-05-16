import React, { useCallback, useEffect, useState } from 'react';
import {
  getQualityOps, snapshotQualityMetrics, topProposalQuality,
} from '../services/deepResearchService';
import { usePermissions } from '../hooks/usePermissions';
import Permitted from '../components/common/Permitted';

// Phase 14 — AI Quality Operations Center.
//
// Read-only composite over Phase 14 quality surfaces + Phase 12/13 op
// health: proposal quality, groundedness, evaluator alignment, strategic
// coherence, lineage coverage, RBAC coverage, explainability coverage.

function Section({ title, subtitle, right, children, testId }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6 mb-5" data-testid={testId}>
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

function Stat({ label, value, hint, tone = 'default' }) {
  const toneMap = {
    default: 'text-gray-800', warn: 'text-amber-700', bad: 'text-red-700', good: 'text-emerald-700',
  };
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${toneMap[tone] || toneMap.default}`}>{value}</div>
      {hint && <div className="text-[11px] text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}

function Pill({ children, tone = 'gray' }) {
  const map = {
    gray: 'bg-gray-100 text-gray-700', red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-800', green: 'bg-emerald-100 text-emerald-800',
    blue: 'bg-blue-100 text-blue-800', violet: 'bg-violet-100 text-violet-800',
  };
  return <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${map[tone] || map.gray}`}>{children}</span>;
}

function ScoreBar({ score }) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  const color = v >= 85 ? 'bg-emerald-500' : v >= 60 ? 'bg-yellow-400' : v >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

function QualityOpsPage() {
  const [data, setData] = useState(null);
  const [top, setTop] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { role } = usePermissions();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [d, t] = await Promise.all([
        getQualityOps(),
        topProposalQuality({ limit: 5 }).catch(() => []),
      ]);
      setData(d); setTop(Array.isArray(t) ? t : []);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load quality ops');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function withBusy(fn, label) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || label); }
    finally { setBusy(false); }
  }

  if (loading && !data) {
    return <div className="p-6 text-center text-gray-500" data-testid="quality-loading">Loading AI quality operations…</div>;
  }
  if (!data) return null;

  const pq = data.proposal_quality || {};
  const gr = data.groundedness || {};
  const sc = data.strategic_coherence || {};
  const ea = data.evaluator_alignment || {};
  const lineage = data.lineage_health || {};
  const rbac = data.rbac_coverage || null;
  const explain = data.explainability || {};
  const alerts = Array.isArray(data.open_alerts) ? data.open_alerts : [];

  const overall = data.composite_quality_score || 0;
  const overallStatus = data.status || 'unknown';

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="quality-ops-page">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Quality Operations Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quality-aware AI operations: proposal quality, groundedness,
          evaluator alignment, strategic coherence, lineage coverage,
          explainability coverage. <strong>Recommendation-only</strong> —
          never auto-modifies proposals.
        </p>
        <div className="text-[11px] text-gray-400 mt-1">
          Generated at: {data.generated_at} &middot; Your role: <Pill tone="violet">{role || 'observer'}</Pill>
        </div>
      </header>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-5" data-testid="quality-actions">
        <button className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          disabled={busy} onClick={() => withBusy(load, 'refresh failed')}>Refresh</button>
        <Permitted name="governance.view">
          <button className="px-3 py-1.5 text-xs font-semibold border border-cyan-300 text-cyan-700 rounded hover:bg-cyan-50 disabled:opacity-50"
            disabled={busy} onClick={() => withBusy(() => snapshotQualityMetrics(), 'snapshot failed')}
          >Snapshot Quality Metrics</button>
        </Permitted>
      </div>

      <Section title="Composite Quality Score" subtitle="Weighted across proposal quality / groundedness / coherence / alignment / explainability / RBAC"
        right={<Pill tone={overallStatus === 'critical' ? 'red' : overallStatus === 'elevated' || overallStatus === 'watch' ? 'amber' : 'green'}>{overallStatus}</Pill>}
        testId="section-composite">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Overall quality score</span>
            <span className="text-sm font-bold">{overall} / 100</span>
          </div>
          <ScoreBar score={overall} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['Proposal quality', pq.avg_composite],
            ['Groundedness', gr.avg_groundedness],
            ['Coherence', sc.avg_coherence],
            ['Alignment', ea.avg_alignment],
            ['Explain coverage', explain.coverage_pct],
          ].map(([label, v]) => (
            <div key={label}>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</div>
              <div className="text-xl font-bold mb-1">{v || 0}</div>
              <ScoreBar score={v} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Proposal Quality" subtitle="Deterministic 8-dimension scorer over OpportunityOutputs"
        testId="section-pq">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Stat label="Scored" value={pq.count || 0} />
          <Stat label="Avg composite" value={pq.avg_composite || 0} tone={(pq.avg_composite || 0) >= 70 ? 'good' : 'warn'} />
          <Stat label="Classifications" value={Object.keys(pq.by_classification || {}).length} />
          <Stat label="Weight dims" value={Object.keys(pq.weights || {}).length} />
        </div>
        {pq.by_classification && Object.keys(pq.by_classification).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(pq.by_classification).map(([k, v]) => (
              <Pill key={k} tone={k === 'excellent' ? 'green' : k === 'strong' ? 'blue' : k === 'adequate' ? 'amber' : 'red'}>{k}: {v}</Pill>
            ))}
          </div>
        )}
      </Section>

      <Section title="Groundedness + Citation" subtitle="Per-claim supported/weak/unsupported classification"
        testId="section-gr">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Analyzed outputs" value={gr.count || 0} />
          <Stat label="Avg groundedness" value={gr.avg_groundedness || 0} tone={(gr.avg_groundedness || 0) >= 70 ? 'good' : 'warn'} />
          <Stat label="Avg unsupported / output" value={gr.avg_unsupported_per_output || 0} tone={(gr.avg_unsupported_per_output || 0) > 3 ? 'warn' : 'good'} />
        </div>
      </Section>

      <Section title="Strategic Coherence" subtitle="Pursuit/positioning/readiness alignment + contradiction detection"
        testId="section-sc">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Analyzed outputs" value={sc.count || 0} />
          <Stat label="Avg coherence" value={sc.avg_coherence || 0} tone={(sc.avg_coherence || 0) >= 70 ? 'good' : 'warn'} />
          <Stat label="With conflicts" value={sc.outputs_with_conflicts || 0} tone={(sc.outputs_with_conflicts || 0) > 0 ? 'bad' : 'good'} />
        </div>
      </Section>

      <Section title="Evaluator Alignment" subtitle="Against capture-strategy evaluator priorities"
        testId="section-ea">
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
          <Stat label="Analyzed outputs" value={ea.count || 0} />
          <Stat label="Avg alignment" value={ea.avg_alignment || 0} tone={(ea.avg_alignment || 0) >= 70 ? 'good' : 'warn'} />
        </div>
      </Section>

      <Section title="Lineage Coverage" subtitle="Cross-provenance + operational-lineage edge counts"
        testId="section-lineage">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Provenance rows" value={lineage.provenance?.total_records || 0} />
          <Stat label="Lineage edges" value={lineage.lineage?.total_edges || 0} />
          <Stat label="Edges (24h)" value={lineage.lineage?.edges_last_24h || 0} />
        </div>
        {Array.isArray(lineage.helpers_available) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {lineage.helpers_available.map((h) => <Pill key={h} tone="blue">{h}</Pill>)}
          </div>
        )}
      </Section>

      <Section title="RBAC Coverage" subtitle="Phase 12 reporter snapshot"
        testId="section-rbac">
        {rbac ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total routes" value={rbac.totalRoutes || rbac.total_routes || 0} />
            <Stat label="requirePermission" value={rbac.requiresPermissionRoutes || rbac.requires_permission_routes || 0} tone="good" />
            <Stat label="Legacy admin" value={rbac.legacyAdminRoutes || rbac.legacy_admin_routes || 0} tone="warn" />
            <Stat label="Coverage %" value={Number(rbac.coveragePct || rbac.coverage_pct || 0)} />
          </div>
        ) : (
          <div className="text-xs text-gray-400">No RBAC snapshot yet — trigger one from the Governance Integrity dashboard.</div>
        )}
      </Section>

      <Section title="Explainability Coverage" subtitle="OpportunityOutputs with a prompt_provenance row"
        testId="section-explainability">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Stat label="Total outputs" value={explain.total_outputs || 0} />
          <Stat label="With provenance" value={explain.with_full_explainability || 0} tone="good" />
          <Stat label="Coverage" value={`${explain.coverage_pct || 0}%`} tone={(explain.coverage_pct || 0) >= 80 ? 'good' : 'warn'} />
        </div>
        <ScoreBar score={explain.coverage_pct} />
      </Section>

      <Section title="Top-scoring Proposals" subtitle="Highest composite quality scores in the window"
        testId="section-top">
        {top.length === 0 ? (
          <div className="text-xs text-gray-400">No scored proposals yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">Output ID</th>
                  <th className="text-right p-2">Composite</th>
                  <th className="text-left p-2">Classification</th>
                  <th className="text-right p-2">Groundedness</th>
                  <th className="text-right p-2">Coherence</th>
                  <th className="text-right p-2">Alignment</th>
                </tr>
              </thead>
              <tbody>
                {top.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">#{r.opportunityOutputId}</td>
                    <td className="p-2 text-right font-bold">{r.compositeScore}</td>
                    <td className="p-2"><Pill tone={r.classification === 'excellent' ? 'green' : r.classification === 'strong' ? 'blue' : r.classification === 'adequate' ? 'amber' : 'red'}>{r.classification}</Pill></td>
                    <td className="p-2 text-right">{r.groundednessScore}</td>
                    <td className="p-2 text-right">{r.operationalCoherenceScore}</td>
                    <td className="p-2 text-right">{r.evaluatorAlignmentScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Open Quality Alerts" subtitle="Recommendation-only — never auto-corrects proposals"
        right={<Pill tone={alerts.length > 0 ? 'amber' : 'green'}>{alerts.length} open</Pill>}
        testId="section-alerts">
        {alerts.length === 0 ? (
          <div className="text-xs text-gray-400">No open quality alerts.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">Kind</th>
                  <th className="text-right p-2">Severity</th>
                  <th className="text-left p-2">Summary</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">{a.alertKind}</td>
                    <td className="p-2 text-right">{a.severity}</td>
                    <td className="p-2 text-[11px]">{a.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="text-[10px] text-gray-400 mt-8 border-t border-gray-100 pt-3">
        Phase 14 &mdash; Quality-Aware Explainable Enterprise AI Infrastructure.
        Read-only quality composite. Recommendation-only — never auto-modifies
        proposals. Every score is deterministic and reproducible from
        OpportunityOutput rows + capture strategy.
      </div>
    </div>
  );
}

export default QualityOpsPage;
