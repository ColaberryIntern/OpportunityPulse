import React, { useCallback, useEffect, useState } from 'react';
import {
  getGovernanceAssurance, runConsistencyScans, runDriftScans,
  snapshotPermissionIntegrity, snapshotStreamIntegrity,
  backfillApprovalProvenance,
} from '../services/deepResearchService';
import { usePermissions } from '../hooks/usePermissions';
import Permitted from '../components/common/Permitted';

// Phase 13 — Enterprise Governance Assurance Center.
//
// Read-only composite over Phase 13 surfaces: provenance integrity, lineage
// coverage, governance consistency, RBAC integrity, stream integrity,
// approval integrity, drift alerts, operational replay, audit completeness,
// explainability coverage.

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

function GovernanceAssurancePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { role } = usePermissions();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await getGovernanceAssurance()); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Failed to load assurance'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function withBusy(fn, label) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || label); }
    finally { setBusy(false); }
  }

  if (loading && !data) {
    return <div className="p-6 text-center text-gray-500" data-testid="assurance-loading">Loading governance assurance…</div>;
  }
  if (!data) return null;

  const subs = data.sub_scores || {};
  const provenance = data.provenance || {};
  const lineage = data.lineage || {};
  const permission = data.permission || {};
  const consistency = data.consistency || {};
  const explain = data.explainability || {};
  const drift = data.drift || {};
  const approvals = data.approvals || {};
  const replay = data.replay || {};
  const stream = data.stream || {};

  const overall = data.assurance_score || 0;
  const overallStatus = data.status || 'unknown';

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="assurance-page">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Enterprise Governance Assurance Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          Composite trust score over cross-system provenance, lineage coverage,
          governance consistency, RBAC integrity, stream integrity, approval
          chains, drift detection, operational replay, audit completeness, and
          explainability coverage. <strong>Recommendation-only</strong> —
          never auto-corrects governance state.
        </p>
        <div className="text-[11px] text-gray-400 mt-1">
          Generated at: {data.generated_at} &middot; Your role: <Pill tone="violet">{role || 'observer'}</Pill>
        </div>
      </header>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-5" data-testid="assurance-actions">
        <button className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          disabled={busy} onClick={() => withBusy(load, 'refresh failed')}>Refresh</button>
        <Permitted name="governance.view">
          <button className="px-3 py-1.5 text-xs font-semibold border border-cyan-300 text-cyan-700 rounded hover:bg-cyan-50 disabled:opacity-50"
            disabled={busy} onClick={() => withBusy(() => runConsistencyScans(), 'consistency scan failed')}
          >Run Consistency Scans</button>
        </Permitted>
        <Permitted name="governance.view">
          <button className="px-3 py-1.5 text-xs font-semibold border border-amber-300 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
            disabled={busy} onClick={() => withBusy(() => runDriftScans(), 'drift scan failed')}
          >Run Drift Scans</button>
        </Permitted>
        <Permitted name="governance.view">
          <button className="px-3 py-1.5 text-xs font-semibold border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50 disabled:opacity-50"
            disabled={busy} onClick={() => withBusy(() => snapshotPermissionIntegrity(), 'permission snapshot failed')}
          >Snapshot Permission Integrity</button>
        </Permitted>
        <Permitted name="governance.view">
          <button className="px-3 py-1.5 text-xs font-semibold border border-violet-300 text-violet-700 rounded hover:bg-violet-50 disabled:opacity-50"
            disabled={busy} onClick={() => withBusy(() => snapshotStreamIntegrity(), 'stream snapshot failed')}
          >Snapshot Stream Integrity</button>
        </Permitted>
        <Permitted name="governance.view">
          <button className="px-3 py-1.5 text-xs font-semibold border border-emerald-300 text-emerald-700 rounded hover:bg-emerald-50 disabled:opacity-50"
            disabled={busy} onClick={() => withBusy(() => backfillApprovalProvenance({ limit: 100 }), 'backfill failed')}
          >Backfill Approval Provenance</button>
        </Permitted>
      </div>

      <Section title="Assurance Composite" subtitle="Weighted explainability / consistency / permission / stream / drift"
        right={<Pill tone={overallStatus === 'critical' ? 'red' : overallStatus === 'elevated' || overallStatus === 'watch' ? 'amber' : 'green'}>{overallStatus}</Pill>}
        testId="section-assurance">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Overall assurance score</span>
            <span className="text-sm font-bold">{overall} / 100</span>
          </div>
          <ScoreBar score={overall} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ['Explainability', subs.explainability_coverage],
            ['Consistency', subs.consistency],
            ['Permissions', subs.permission_integrity],
            ['Stream', subs.stream_integrity],
            ['Drift', subs.drift_pressure],
          ].map(([label, v]) => (
            <div key={label}>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</div>
              <div className="text-xl font-bold mb-1">{v || 0}</div>
              <ScoreBar score={v} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Cross-System Provenance" subtitle="Unified provenance log across every operational object" testId="section-provenance">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Total records" value={provenance.total_records || 0} />
          <Stat label="Records (24h)" value={provenance.records_last_24h || 0} />
          <Stat label="Valid subject kinds" value={(provenance.valid_subject_kinds || []).length} />
        </div>
      </Section>

      <Section title="Operational Lineage Graph" subtitle="Directed-edge graph between domain entities" testId="section-lineage">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Total edges" value={lineage.total_edges || 0} />
          <Stat label="Edges (24h)" value={lineage.edges_last_24h || 0} />
          <Stat label="Relations" value={(lineage.valid_relations || []).length} />
        </div>
      </Section>

      <Section title="Permission Integrity" subtitle="Per-user RBAC audit" testId="section-permission">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Total users" value={permission.total_users || 0} />
          <Stat label="Mapped" value={permission.mapped_users || 0} tone="good" />
          <Stat label="Over-permissioned" value={permission.over_permissioned_users || 0} tone={(permission.over_permissioned_users || 0) > 0 ? 'warn' : 'good'} />
          <Stat label="Orphan grants" value={permission.orphan_grants || 0} tone={(permission.orphan_grants || 0) > 0 ? 'bad' : 'good'} />
          <Stat label="Stale grants" value={permission.stale_grants || 0} tone={(permission.stale_grants || 0) > 0 ? 'warn' : 'good'} />
        </div>
      </Section>

      <Section title="Governance Consistency" subtitle="Detected inconsistencies (recommendation-only)"
        right={<Pill tone={consistency.consistency_score >= 85 ? 'green' : consistency.consistency_score >= 60 ? 'amber' : 'red'}>{consistency.consistency_score || 0}/100</Pill>}
        testId="section-consistency">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Stat label="Open" value={consistency.open || 0} tone={(consistency.open || 0) > 0 ? 'warn' : 'good'} />
          <Stat label="Acknowledged" value={consistency.acknowledged || 0} />
          <Stat label="Resolved" value={consistency.resolved || 0} tone="good" />
          <Stat label="Check kinds" value={(consistency.valid_checks || []).length} />
        </div>
        {consistency.by_kind && Object.keys(consistency.by_kind).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(consistency.by_kind).map(([k, v]) => <Pill key={k} tone="amber">{k}: {v}</Pill>)}
          </div>
        )}
      </Section>

      <Section title="Explainability Coverage" subtitle="Outputs with full provenance vs total" testId="section-explainability">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Stat label="Total outputs" value={explain.total_outputs || 0} />
          <Stat label="With full explainability" value={explain.with_full_explainability || 0} tone="good" />
          <Stat label="Coverage" value={`${explain.coverage_pct || 0}%`} tone={(explain.coverage_pct || 0) >= 80 ? 'good' : 'warn'} />
        </div>
        <ScoreBar score={explain.coverage_pct} />
      </Section>

      <Section title="Governance Drift" subtitle="Detected drift between expected and actual posture"
        right={<Pill tone={(drift.critical || 0) > 0 ? 'red' : (drift.open || 0) > 0 ? 'amber' : 'green'}>{drift.open || 0} open</Pill>}
        testId="section-drift">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Stat label="Open drift" value={drift.open || 0} tone={(drift.open || 0) > 0 ? 'warn' : 'good'} />
          <Stat label="Critical (≥80)" value={drift.critical || 0} tone={(drift.critical || 0) > 0 ? 'bad' : 'good'} />
          <Stat label="Drift kinds" value={(drift.valid_kinds || []).length} />
        </div>
        {drift.by_kind && Object.keys(drift.by_kind).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(drift.by_kind).map(([k, v]) => <Pill key={k} tone="red">{k}: {v}</Pill>)}
          </div>
        )}
      </Section>

      <Section title="Approval Provenance" subtitle="Append-only approval chain history" testId="section-approvals">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Lineage rows" value={approvals.total_lineage_rows || 0} />
          <Stat label="Overrides" value={approvals.overrides || 0} tone={(approvals.overrides || 0) > 0 ? 'warn' : 'good'} />
          <Stat label="Action kinds" value={(approvals.valid_actions || []).length} />
        </div>
      </Section>

      <Section title="Operational Replay" subtitle="Read-only replay event registry" testId="section-replay">
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
          <Stat label="Persisted replay events" value={replay.total_replay_events || 0} />
          <Stat label="Replay scopes" value={(replay.valid_scopes || []).length} />
        </div>
      </Section>

      <Section title="SSE Stream Integrity" subtitle="Reliability metrics over recent snapshots" testId="section-stream">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Snapshots" value={stream.snapshots || 0} />
          <Stat label="Published" value={(stream.totals && stream.totals.published) || 0} tone="good" />
          <Stat label="Dropped" value={(stream.totals && stream.totals.dropped) || 0} tone={((stream.totals && stream.totals.dropped) || 0) > 0 ? 'bad' : 'good'} />
          <Stat label="Drop rate" value={`${stream.drop_rate_pct || 0}%`} tone={(stream.drop_rate_pct || 0) > 1 ? 'warn' : 'good'} />
          <Stat label="Peak concurrent" value={(stream.totals && stream.totals.peak_concurrent) || 0} />
        </div>
      </Section>

      <div className="text-[10px] text-gray-400 mt-8 border-t border-gray-100 pt-3">
        Phase 13 &mdash; Fully Traceable Enterprise AI Operations Infrastructure.
        Read-only assurance composite. Recommendation-only — never auto-corrects
        governance state, never auto-submits, never auto-bids, never auto-signs.
      </div>
    </div>
  );
}

export default GovernanceAssurancePage;
