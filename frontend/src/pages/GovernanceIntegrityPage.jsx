import React, { useCallback, useEffect, useState } from 'react';
import {
  getGovernanceIntegrity, snapshotGovernanceIntegrity, getRbacCoverage,
  snapshotRbacCoverage, snapshotStreamMetrics, previewSlaDigest,
  planAssetMigration, runAssetMigration,
} from '../services/deepResearchService';
import { usePermissions } from '../hooks/usePermissions';
import Permitted from '../components/common/Permitted';

// Phase 12 — Governance Integrity Operations Center.
//
// Composite trust dashboard over tenant isolation, RBAC coverage, prompt
// provenance, observability streams, audit retention, asset migration,
// and SLA email pipeline. Read-only aggregate + operator-triggered
// snapshots/previews.

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
    default: 'text-gray-800',
    warn: 'text-amber-700',
    bad: 'text-red-700',
    good: 'text-emerald-700',
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
    gray: 'bg-gray-100 text-gray-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-800',
    green: 'bg-emerald-100 text-emerald-800',
    blue: 'bg-blue-100 text-blue-800',
    violet: 'bg-violet-100 text-violet-800',
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

function GovernanceIntegrityPage() {
  const [data, setData] = useState(null);
  const [rbac, setRbac] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const { role } = usePermissions();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [integ, r] = await Promise.all([
        getGovernanceIntegrity(),
        getRbacCoverage().catch(() => null),
      ]);
      setData(integ); setRbac(r);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load integrity dashboard');
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
    return <div className="p-6 text-center text-gray-500" data-testid="integrity-loading">Loading governance integrity…</div>;
  }
  if (!data) return null;

  const integrity = data.integrity || {};
  const subs = integrity.sub_scores || {};
  const migration = data.migration || {};
  const provenance = data.prompt_provenance || {};
  const retention = data.retention || {};
  const slaEmail = data.sla_email || {};
  const sseMetrics = data.sse_metrics || {};

  const overall = integrity.integrity_score || 0;
  const overallStatus = overall >= 85 ? 'healthy' : overall >= 60 ? 'watch' : overall >= 40 ? 'elevated' : 'critical';

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="integrity-page">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Governance Integrity Operations Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          Composite trust score over tenant isolation, RBAC coverage, prompt
          provenance, observability, retention, asset migration, and the SLA
          email pipeline. Read-only aggregate. Backend remains the source of
          truth on every action.
        </p>
        <div className="text-[11px] text-gray-400 mt-1">
          Generated at: {data.generated_at} &middot; Your role: <Pill tone="violet">{role || 'observer'}</Pill>
        </div>
      </header>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{err}</div>}

      <div className="flex flex-wrap gap-2 mb-5" data-testid="integrity-actions">
        <button
          className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => withBusy(load, 'refresh failed')}
        >Refresh</button>
        <Permitted name="governance.view">
          <button
            className="px-3 py-1.5 text-xs font-semibold border border-cyan-300 text-cyan-700 rounded hover:bg-cyan-50 disabled:opacity-50"
            disabled={busy}
            onClick={() => withBusy(() => snapshotGovernanceIntegrity(), 'snapshot failed')}
          >Snapshot Integrity</button>
        </Permitted>
        <Permitted name="governance.view">
          <button
            className="px-3 py-1.5 text-xs font-semibold border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50 disabled:opacity-50"
            disabled={busy}
            onClick={() => withBusy(() => snapshotRbacCoverage(), 'rbac snapshot failed')}
          >Snapshot RBAC Coverage</button>
        </Permitted>
        <Permitted name="governance.view">
          <button
            className="px-3 py-1.5 text-xs font-semibold border border-amber-300 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
            disabled={busy}
            onClick={() => withBusy(() => snapshotStreamMetrics(), 'stream snapshot failed')}
          >Snapshot Stream Metrics</button>
        </Permitted>
        <Permitted name="sla.acknowledge">
          <button
            className="px-3 py-1.5 text-xs font-semibold border border-emerald-300 text-emerald-700 rounded hover:bg-emerald-50 disabled:opacity-50"
            disabled={busy}
            onClick={() => withBusy(() => previewSlaDigest({}), 'preview failed')}
          >Preview SLA Digest</button>
        </Permitted>
        <Permitted name="storage.delete">
          <button
            className="px-3 py-1.5 text-xs font-semibold border border-violet-300 text-violet-700 rounded hover:bg-violet-50 disabled:opacity-50"
            disabled={busy}
            onClick={() => withBusy(() => planAssetMigration().then((p) => p), 'plan failed')}
          >Plan Asset Migration</button>
        </Permitted>
      </div>

      <Section
        title="Integrity Score Composite"
        subtitle="Weighted average of tenant / RBAC / provenance / observability / retention"
        right={<Pill tone={overallStatus === 'critical' ? 'red' : overallStatus === 'elevated' || overallStatus === 'watch' ? 'amber' : 'green'}>{overallStatus}</Pill>}
        testId="section-integrity"
      >
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Overall integrity score</span>
            <span className="text-sm font-bold">{overall} / 100</span>
          </div>
          <ScoreBar score={overall} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Tenant isolation</div>
            <div className="text-xl font-bold mb-1">{subs.tenant_isolation || 0}</div>
            <ScoreBar score={subs.tenant_isolation} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">RBAC coverage</div>
            <div className="text-xl font-bold mb-1">{subs.rbac || 0}</div>
            <ScoreBar score={subs.rbac} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Prompt provenance</div>
            <div className="text-xl font-bold mb-1">{subs.provenance || 0}</div>
            <ScoreBar score={subs.provenance} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Observability</div>
            <div className="text-xl font-bold mb-1">{subs.observability || 0}</div>
            <ScoreBar score={subs.observability} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Retention</div>
            <div className="text-xl font-bold mb-1">{subs.retention || 0}</div>
            <ScoreBar score={subs.retention} />
          </div>
        </div>
      </Section>

      <Section title="RBAC Coverage" subtitle="Route-level migration status from legacy admin → requirePermission" testId="section-rbac">
        {rbac && rbac.live ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Total routes" value={rbac.live.total} />
            <Stat label="Legacy admin" value={rbac.live.legacy_admin} tone={(rbac.live.legacy_admin || 0) > 0 ? 'warn' : 'good'} />
            <Stat label="requirePermission" value={rbac.live.requires_permission} tone="good" />
            <Stat label="Unprotected" value={rbac.live.unprotected} tone={(rbac.live.unprotected || 0) > 0 ? 'bad' : 'good'} />
          </div>
        ) : (
          <div className="text-xs text-gray-400">No coverage snapshot yet.</div>
        )}
      </Section>

      <Section title="Prompt Provenance" subtitle="Every draft traces back to a deterministic, hashed prompt context" testId="section-provenance">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total provenance rows" value={provenance.total_provenance_rows || 0} />
          <Stat label="Linked to outputs" value={provenance.rows_linked_to_outputs || 0} tone="good" />
          <Stat label="Last 24h" value={provenance.rows_last_24h || 0} />
          <Stat label="Link coverage" value={`${provenance.link_coverage_pct || 0}%`} tone={(provenance.link_coverage_pct || 0) >= 80 ? 'good' : 'warn'} />
        </div>
      </Section>

      <Section title="Asset Migration" subtitle="url_only → real storage provider migration progress" testId="section-migration">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Provider" value={migration.target_provider || 'url_only'} />
          <Stat label="Completed" value={migration.completed || 0} tone="good" />
          <Stat label="Failed" value={migration.failed || 0} tone={(migration.failed || 0) > 0 ? 'bad' : 'default'} />
          <Stat label="Pending" value={migration.pending || 0} />
          <Stat label="url_only remaining" value={migration.url_only_remaining || 0} tone={(migration.url_only_remaining || 0) > 0 ? 'warn' : 'good'} />
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Migration completion</span>
            <span className="text-sm font-bold">{migration.completion_pct || 0}%</span>
          </div>
          <ScoreBar score={migration.completion_pct} />
        </div>
      </Section>

      <Section title="Audit Retention" subtitle="Retention pressure + archive recommendations" testId="section-retention">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Total audit events" value={retention?.pressure?.total_audit_events || 0} />
          <Stat label="Eligible for archive" value={retention?.pressure?.archive_eligible || 0} tone={(retention?.pressure?.archive_eligible || 0) > 0 ? 'warn' : 'good'} />
          <Stat label="Archives completed" value={retention?.pressure?.archives_completed || 0} />
          <Stat label="Retention days" value={retention?.pressure?.retention_days || 365} />
          <Stat label="Status" value={retention?.pressure?.status || 'healthy'} tone={retention?.pressure?.status === 'critical' ? 'bad' : retention?.pressure?.status === 'elevated' ? 'warn' : 'good'} />
        </div>
      </Section>

      <Section title="SLA Email Pipeline" subtitle="Daily digest send health over the last 7 days" testId="section-sla-email">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total" value={slaEmail.total || 0} />
          <Stat label="Sent" value={slaEmail.sent || 0} tone="good" />
          <Stat label="Failed" value={slaEmail.failed || 0} tone={(slaEmail.failed || 0) > 0 ? 'bad' : 'default'} />
          <Stat label="Send rate" value={`${slaEmail.send_rate || 0}%`} hint={`${slaEmail.dry_run || 0} dry-run`} />
        </div>
      </Section>

      <Section title="SSE Stream Throughput" subtitle="Per-channel publish counters since last snapshot" testId="section-sse">
        {sseMetrics.in_memory && Object.keys(sseMetrics.in_memory).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr><th className="text-left p-2">Channel</th><th className="text-right p-2">Published</th><th className="text-right p-2">Throttled</th></tr>
              </thead>
              <tbody>
                {Object.entries(sseMetrics.in_memory).map(([ch, v]) => (
                  <tr key={ch} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">{ch}</td>
                    <td className="p-2 text-right">{v.published || 0}</td>
                    <td className="p-2 text-right">{v.throttled || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-gray-400">No SSE events since last snapshot.</div>
        )}
        {sseMetrics.valid_channels && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {sseMetrics.valid_channels.map((c) => <Pill key={c} tone="blue">{c}</Pill>)}
          </div>
        )}
      </Section>

      <div className="text-[10px] text-gray-400 mt-8 border-t border-gray-100 pt-3">
        Phase 12 &mdash; Tenant-Safe Auditable AI Capture Infrastructure. All
        operations are measure-only; no auto-submission, no auto-bid, no
        auto-sign. Frontend permission gating is UX only &mdash; backend
        remains the source of truth.
      </div>
    </div>
  );
}

export default GovernanceIntegrityPage;
