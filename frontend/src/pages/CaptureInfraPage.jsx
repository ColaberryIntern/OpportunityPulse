import React, { useCallback, useEffect, useState } from 'react';
import {
  getCaptureInfra, runSlaScan, runArtifactLifecycleScan,
  snapshotQueueMetrics, drainWorkerOnce, listWorkerJobs,
} from '../services/deepResearchService';

// Deep Research Phase 10 — Capture Infrastructure dashboard.
//
// Read-only composite over all Phase 10 surfaces: durable worker health,
// queue throughput, SLA pressure, artifact lifecycle, execution queue,
// failure breakdown, storage backend. Operator-triggered manual scans for
// SLA + lifecycle + queue snapshots + worker drain.

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
  const toneMap = {
    gray: 'bg-gray-100 text-gray-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-800',
    green: 'bg-emerald-100 text-emerald-800',
    blue: 'bg-blue-100 text-blue-800',
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${toneMap[tone] || toneMap.gray}`}>
      {children}
    </span>
  );
}

function KvList({ obj }) {
  const entries = Object.entries(obj || {});
  if (entries.length === 0) return <div className="text-xs text-gray-400">(none)</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <Pill key={k} tone="blue">{k}: {v}</Pill>
      ))}
    </div>
  );
}

function CaptureInfraPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [infra, jobs] = await Promise.all([
        getCaptureInfra(),
        listWorkerJobs({ limit: 25 }),
      ]);
      setData(infra);
      setRecentJobs(jobs?.jobs || []);
    } catch (e) { setErr(e?.response?.data?.message || e.message || 'Failed to load capture infra'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function withBusy(fn, errLabel) {
    setBusy(true); setErr(null);
    try { await fn(); await load(); }
    catch (e) { setErr(e?.response?.data?.message || e.message || errLabel); }
    finally { setBusy(false); }
  }

  if (loading && !data) {
    return <div className="p-6 text-center text-gray-500" data-testid="capture-infra-loading">Loading capture infrastructure…</div>;
  }
  if (!data) return null;

  const worker = data.worker || {};
  const queue = data.queue || {};
  const sla = data.sla || {};
  const artifacts = data.artifacts || {};
  const exec = data.execution_queue || {};
  const failures = data.failures || {};
  const storage = data.storage || {};

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="capture-infra-page">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Capture Infrastructure</h1>
        <p className="text-sm text-gray-500 mt-1">
          Operational scalability + execution infrastructure across the durable
          capture worker, queues, SLA scanners, artifact lifecycle, and storage.
        </p>
        <div className="text-[11px] text-gray-400 mt-1">
          Generated at: {data.generated_at}
        </div>
      </header>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm" data-testid="capture-infra-error">{err}</div>
      )}

      <div className="flex flex-wrap gap-2 mb-5" data-testid="capture-infra-actions">
        <button
          className="px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => withBusy(load, 'refresh failed')}
        >Refresh</button>
        <button
          className="px-3 py-1.5 text-xs font-semibold border border-cyan-300 text-cyan-700 rounded hover:bg-cyan-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => withBusy(() => runSlaScan(), 'SLA scan failed')}
        >Run SLA Scan</button>
        <button
          className="px-3 py-1.5 text-xs font-semibold border border-amber-300 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => withBusy(() => runArtifactLifecycleScan(), 'lifecycle scan failed')}
        >Run Artifact Lifecycle Scan</button>
        <button
          className="px-3 py-1.5 text-xs font-semibold border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => withBusy(() => snapshotQueueMetrics(), 'queue snapshot failed')}
        >Snapshot Queue Metrics</button>
        <button
          className="px-3 py-1.5 text-xs font-semibold border border-emerald-300 text-emerald-700 rounded hover:bg-emerald-50 disabled:opacity-50"
          disabled={busy}
          onClick={() => withBusy(() => drainWorkerOnce(), 'drain failed')}
        >Drain Worker Once</button>
      </div>

      <Section
        title="Durable Worker"
        subtitle="Polling-based worker for all background capture jobs"
        right={<Pill tone={worker.enabled ? 'green' : 'gray'}>{worker.enabled ? 'enabled' : 'disabled'}</Pill>}
        testId="section-worker"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Poll interval" value={`${(worker.poll_ms || 0) / 1000}s`} />
          <Stat label="Concurrency" value={worker.default_concurrency} hint={`max ${worker.max_concurrency}`} />
          <Stat label="Processing" value={worker.health?.processing ?? 0} />
          <Stat
            label="Stalled jobs"
            value={worker.health?.stalled ?? 0}
            tone={(worker.health?.stalled || 0) > 0 ? 'warn' : 'default'}
            hint="processing > 10 min"
          />
        </div>
      </Section>

      <Section
        title="Queue Throughput (last 60 min)"
        subtitle="Latency + retry rate across all job kinds"
        testId="section-queue"
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <Stat label="Queued" value={queue.queued || 0} />
          <Stat label="Processing" value={queue.processing || 0} />
          <Stat label="Failed (24h)" value={queue.failed_24h || 0} tone={(queue.failed_24h || 0) > 0 ? 'warn' : 'default'} />
          <Stat label="Cancelled (24h)" value={queue.cancelled_24h || 0} />
          <Stat label="Total (window)" value={queue.total || 0} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="p50 latency" value={`${queue.median_ms || 0}ms`} />
          <Stat label="p95 latency" value={`${queue.p95_ms || 0}ms`} />
          <Stat label="Retry rate" value={`${Math.round((queue.retry_rate || 0) * 100)}%`} />
          <Stat label="Success rate" value={`${Math.round((queue.success_rate || 0) * 100)}%`} tone="good" />
        </div>
        {queue.by_kind && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">By job kind</div>
            <KvList obj={queue.by_kind} />
          </div>
        )}
      </Section>

      <Section
        title="SLA Pressure"
        subtitle="Open SLA events across all 6 scanners"
        right={<Pill tone={sla.open_count > 0 ? 'red' : 'green'}>{sla.open_count || 0} open</Pill>}
        testId="section-sla"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Stat label="Open events" value={sla.open_count || 0} tone={sla.open_count > 0 ? 'warn' : 'good'} />
          <Stat label="Top severity" value={sla.top_severity || 0} hint="0=info, 3=critical" />
          <Stat label="Distinct kinds" value={Object.keys(sla.by_kind || {}).length} />
        </div>
        <KvList obj={sla.by_kind} />
      </Section>

      <Section
        title="Artifact Lifecycle"
        subtitle="Renewal recommendations + expiring soon"
        testId="section-artifacts"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Expiring (30d)" value={artifacts.expiring_count || 0} tone={(artifacts.expiring_count || 0) > 0 ? 'warn' : 'default'} />
          <Stat label="Expired" value={artifacts.expired_count || 0} tone={(artifacts.expired_count || 0) > 0 ? 'bad' : 'default'} />
          <Stat label="Events (7d)" value={artifacts.events_last_7d || 0} />
          <Stat label="Renewal recs" value={artifacts.renewal_recommendations || 0} />
        </div>
      </Section>

      <Section
        title="Proposal Execution Queue"
        subtitle="High-level draft batches, package assemblies, compliance parses"
        testId="section-exec-queue"
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(exec.by_status || {}).map(([k, v]) => (
            <Stat key={k} label={k} value={v} tone={k === 'failed' && v > 0 ? 'bad' : 'default'} />
          ))}
        </div>
        {Array.isArray(exec.recent) && exec.recent.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">Kind</th>
                  <th className="text-left p-2">Pursuit</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-right p-2">Jobs</th>
                  <th className="text-right p-2">OK / Fail</th>
                  <th className="text-left p-2">SLA Due</th>
                </tr>
              </thead>
              <tbody>
                {exec.recent.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">{e.queueKind}</td>
                    <td className="p-2">{e.pursuitId || '—'}</td>
                    <td className="p-2"><Pill tone={e.status === 'completed' ? 'green' : e.status === 'failed' ? 'red' : 'gray'}>{e.status}</Pill></td>
                    <td className="p-2 text-right">{e.totalJobs}</td>
                    <td className="p-2 text-right text-[11px]">{e.succeededJobs}/{e.failedJobs}</td>
                    <td className="p-2 text-[11px] text-gray-500">{e.slaDueAt || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Recent Worker Jobs"
        subtitle="Last 25 jobs across all kinds"
        testId="section-recent-jobs"
      >
        {recentJobs.length === 0 ? (
          <div className="text-xs text-gray-400">No worker jobs yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">Kind</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-right p-2">Attempt</th>
                  <th className="text-right p-2">Pursuit</th>
                  <th className="text-left p-2">Created</th>
                  <th className="text-left p-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((j) => (
                  <tr key={j.id} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">{j.jobKind}</td>
                    <td className="p-2"><Pill tone={j.status === 'completed' ? 'green' : j.status === 'failed' ? 'red' : j.status === 'processing' ? 'blue' : 'gray'}>{j.status}</Pill></td>
                    <td className="p-2 text-right">{j.attempt}/{j.maxAttempts}</td>
                    <td className="p-2 text-right">{j.pursuitId || '—'}</td>
                    <td className="p-2 text-[11px] text-gray-500">{j.createdAt}</td>
                    <td className="p-2 text-[11px] text-gray-500">{j.updatedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Execution Failures (last 7 days)"
        subtitle="Typed failure log for root-cause analysis"
        right={<Pill tone={failures.last_7d_total > 0 ? 'amber' : 'green'}>{failures.last_7d_total || 0} total</Pill>}
        testId="section-failures"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">By failure kind</div>
            <KvList obj={failures.by_failure_kind} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">By job kind</div>
            <KvList obj={failures.by_job_kind} />
          </div>
        </div>
      </Section>

      <Section
        title="Storage Backend"
        subtitle="Provider abstraction over file storage assets"
        right={<Pill tone="blue">{storage.provider || 'url_only'}</Pill>}
        testId="section-storage"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total assets" value={storage.total_assets || 0} />
          <Stat label="Total bytes" value={storage.total_bytes || 0} hint="across all assets" />
          <Stat label="Recent (7d)" value={storage.recent_count || 0} />
          <Stat label="Max size (MB)" value={Math.round((storage.max_size_bytes || 0) / 1_000_000)} />
        </div>
      </Section>

      <div className="text-[10px] text-gray-400 mt-8 border-t border-gray-100 pt-3">
        Phase 10 — Operational Scalability + Execution Infrastructure. All
        operations are measure-only; no auto-submission, no auto-bid.
      </div>
    </div>
  );
}

export default CaptureInfraPage;
