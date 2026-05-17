import React, { useCallback, useEffect, useState } from 'react';
import {
  getOperationsIntelligence, snapshotOperationsIntelligence,
  snapshotQualityTrend, listQualityAlertsV15, qaWorkflowWorkload,
  qaWorkflowBottlenecks,
} from '../services/deepResearchService';
import { usePermissions } from '../hooks/usePermissions';
import Permitted from '../components/common/Permitted';

// Phase 15 — Enterprise AI Operations Intelligence Center.
//
// Read-only composite over Phase 14 quality + Phase 13 lineage/replay +
// Phase 12 RBAC + Phase 11 governance health.

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

function trendIcon(direction) {
  if (direction === 'improving') return '↑';
  if (direction === 'declining') return '↓';
  return '→';
}

function OperationsIntelligencePage() {
  const [data, setData] = useState(null);
  const [workloads, setWorkloads] = useState([]);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { role } = usePermissions();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [d, w, b, al] = await Promise.all([
        getOperationsIntelligence(),
        qaWorkflowWorkload().catch(() => []),
        qaWorkflowBottlenecks().catch(() => []),
        listQualityAlertsV15({ limit: 20 }).catch(() => []),
      ]);
      setData(d);
      setWorkloads(Array.isArray(w) ? w : []);
      setBottlenecks(Array.isArray(b) ? b : []);
      setAlerts(Array.isArray(al) ? al : []);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load operations intelligence');
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
    return <div className="p-6 text-center text-gray-500" data-testid="ops-intel-loading">Loading operations intelligence…</div>;
  }
  if (!data) return null;

  const subs = data.sub_scores || {};
  const quality = data.quality || {};
  const automation = data.automation || {};
  const trend = data.trend || null;
  const overall = data.overall_score || 0;
  const status = data.status || 'unknown';

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="ops-intel-page">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Enterprise AI Operations Intelligence Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          Continuously observable enterprise AI ops. Composite trust score
          across quality, lineage, QA workflow, and governance.
          <strong> Recommendation-only</strong> &mdash; never auto-modifies
          proposals or governance state.
        </p>
        <div className="text-[11px] text-gray-400 mt-1">
          Generated at: {data.generated_at} &middot; Your role: <Pill tone="violet">{role || 'observer'}</Pill>
        </div>
      </header>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-5" data-testid="ops-intel-actions">
        <button className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          disabled={busy} onClick={() => withBusy(load, 'refresh failed')}>Refresh</button>
        <Permitted name="governance.view">
          <button className="px-3 py-1.5 text-xs font-semibold border border-cyan-300 text-cyan-700 rounded hover:bg-cyan-50 disabled:opacity-50"
            disabled={busy} onClick={() => withBusy(() => snapshotOperationsIntelligence(), 'snapshot failed')}
          >Snapshot Operations Intelligence</button>
        </Permitted>
        <Permitted name="governance.view">
          <button className="px-3 py-1.5 text-xs font-semibold border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50 disabled:opacity-50"
            disabled={busy} onClick={() => withBusy(() => snapshotQualityTrend({}), 'trend snapshot failed')}
          >Snapshot Quality Trend</button>
        </Permitted>
      </div>

      <Section title="Operations Intelligence Composite"
        subtitle="Weighted across quality, lineage integrity, QA workflow, and governance health"
        right={<Pill tone={status === 'critical' ? 'red' : status === 'elevated' || status === 'watch' ? 'amber' : 'green'}>{status}</Pill>}
        testId="section-composite">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Overall score &middot; trend {trendIcon(data.trend_direction)} {data.trend_direction}</span>
            <span className="text-sm font-bold">{overall} / 100</span>
          </div>
          <ScoreBar score={overall} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Quality', subs.quality],
            ['Lineage integrity', subs.lineage_integrity],
            ['QA workflow', subs.qa_workflow],
            ['Governance health', subs.governance_health],
          ].map(([label, v]) => (
            <div key={label}>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</div>
              <div className="text-xl font-bold mb-1">{v || 0}</div>
              <ScoreBar score={v} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Proposal Quality Pillar" subtitle="Phase 14 4-dimension averages over the last 30 days"
        testId="section-quality">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Avg composite" value={quality.proposal?.avg_composite || 0} tone={(quality.proposal?.avg_composite || 0) >= 70 ? 'good' : 'warn'} />
          <Stat label="Avg groundedness" value={quality.groundedness?.avg_groundedness || 0} />
          <Stat label="Avg coherence" value={quality.coherence?.avg_coherence || 0} />
          <Stat label="Avg alignment" value={quality.alignment?.avg_alignment || 0} />
        </div>
      </Section>

      <Section title="Quality Automation" subtitle="Background-pipeline snapshot stats"
        testId="section-automation">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Stat label="Total snapshots" value={automation.count || 0} />
          <Stat label="Avg composite" value={automation.avg_composite || 0} />
          <Stat label="Avg groundedness" value={automation.avg_groundedness || 0} />
        </div>
        {automation.by_trigger && Object.keys(automation.by_trigger).length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">By trigger</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(automation.by_trigger).map(([k, v]) => <Pill key={k} tone="blue">{k}: {v}</Pill>)}
            </div>
          </div>
        )}
      </Section>

      <Section title="Quality Trend" subtitle="Rolling-window comparison vs prior period"
        right={trend ? <Pill tone={trend.direction === 'declining' ? 'red' : trend.direction === 'improving' ? 'green' : 'gray'}>{trendIcon(trend.direction)} {trend.direction}</Pill> : null}
        testId="section-trend">
        {!trend ? (
          <div className="text-xs text-gray-400">No trend snapshot yet — click &ldquo;Snapshot Quality Trend&rdquo;.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Window (days)" value={trend.windowDays} />
            <Stat label="Avg quality" value={trend.avgQualityScore} />
            <Stat label="Δ vs prior" value={trend.qualityDeltaVsPrior > 0 ? `+${trend.qualityDeltaVsPrior}` : trend.qualityDeltaVsPrior} tone={trend.qualityDeltaVsPrior < 0 ? 'bad' : 'good'} />
            <Stat label="Open alerts (then)" value={trend.openAlerts} />
          </div>
        )}
      </Section>

      <Section title="QA Workflow Workloads" subtitle="Active assignments by reviewer"
        testId="section-workloads">
        {workloads.length === 0 ? (
          <div className="text-xs text-gray-400">No active QA workflows.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">Reviewer</th>
                  <th className="text-right p-2">Open</th>
                  <th className="text-right p-2">Highest severity</th>
                  <th className="text-left p-2">By status</th>
                </tr>
              </thead>
              <tbody>
                {workloads.map((w) => (
                  <tr key={w.assignee} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">{w.assignee}</td>
                    <td className="p-2 text-right">{w.count}</td>
                    <td className="p-2 text-right">{w.highest_severity}</td>
                    <td className="p-2 text-[11px]">{Object.entries(w.by_status).map(([k, v]) => `${k}:${v}`).join(' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="QA Workflow Bottlenecks" subtitle="Slowest workflow kinds"
        testId="section-bottlenecks">
        {bottlenecks.length === 0 ? (
          <div className="text-xs text-gray-400">No bottlenecks detected.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">Workflow kind</th>
                  <th className="text-right p-2">Count</th>
                  <th className="text-right p-2">Avg age (d)</th>
                  <th className="text-right p-2">Max age (d)</th>
                </tr>
              </thead>
              <tbody>
                {bottlenecks.map((b) => (
                  <tr key={b.kind} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">{b.kind}</td>
                    <td className="p-2 text-right">{b.count}</td>
                    <td className="p-2 text-right">{b.avg_age_days}</td>
                    <td className="p-2 text-right">{b.maxAge}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Open Quality Alerts" subtitle="Recommendation-only — operator action required"
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
                  <th className="text-left p-2">Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">{a.alertKind}</td>
                    <td className="p-2 text-right">{a.severity}</td>
                    <td className="p-2 text-[11px]">{a.summary || '—'}</td>
                    <td className="p-2 text-[11px] text-gray-500">{a.recommendation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Lineage Coverage" subtitle="Phase 13 cross-provenance + operational-lineage health"
        testId="section-lineage">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Provenance records" value={data.lineage?.provenance?.total_records || 0} />
          <Stat label="Lineage edges" value={data.lineage?.lineage?.total_edges || 0} />
          <Stat label="Edges (24h)" value={data.lineage?.lineage?.edges_last_24h || 0} />
        </div>
      </Section>

      <Section title="Governance Health" subtitle="Phase 11 governance assurance composite"
        testId="section-governance">
        {data.governance_assurance ? (
          <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
            <Stat label="Assurance score" value={data.governance_assurance.assurance_score || 0} tone={(data.governance_assurance.assurance_score || 0) >= 70 ? 'good' : 'warn'} />
            <Stat label="Status" value={data.governance_assurance.status || 'unknown'} />
          </div>
        ) : (
          <div className="text-xs text-gray-400">Governance assurance signal unavailable.</div>
        )}
      </Section>

      <div className="text-[10px] text-gray-400 mt-8 border-t border-gray-100 pt-3">
        Phase 15 &mdash; Continuously Observable Enterprise AI Operations.
        Read-only composite. Recommendation-only — never auto-modifies
        proposals, never auto-corrects governance state, never auto-submits.
      </div>
    </div>
  );
}

export default OperationsIntelligencePage;
