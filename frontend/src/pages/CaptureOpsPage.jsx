import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCaptureOps, refreshArtifactExpirations,
} from '../services/deepResearchService';
import { StatCard, PursuitStatusPill } from '../components/deepResearch/ActionVisuals';

// Deep Research Phase 9 — Capture Operations Dashboard.
//
// Read-only operational overview of every active pursuit: readiness
// composite distribution, top compliance gaps, artifact health, package
// completeness, timeline overdue/blocked rollup, draft queue in-flight.

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

function ClassificationPill({ classification }) {
  const map = {
    ready: 'bg-emerald-100 text-emerald-800',
    needs_prep: 'bg-amber-100 text-amber-800',
    blocked: 'bg-red-100 text-red-700',
    unknown: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${map[classification] || map.unknown}`}>
      {classification || 'unknown'}
    </span>
  );
}

function PercentBar({ value, color = 'bg-cyan-500' }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

function CaptureOpsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await getCaptureOps()); }
    catch (e) { setErr(e?.response?.data?.message || e.message || 'Failed to load capture ops'); }
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
    return <div className="p-6 text-center text-gray-500">Loading capture operations…</div>;
  }
  if (!data) return null;

  const active = data.active_pursuits || [];
  const readiness = data.readiness_summary || {};
  const buckets = readiness.by_classification || {};
  const gapsByPursuit = data.compliance_gaps_by_pursuit || [];
  const artifacts = data.artifact_health || {};
  const packages = data.package_snapshot || {};
  const timeline = data.timeline || {};
  const draftQueue = data.draft_queue || { in_flight: 0, sample: [] };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              🛰 Capture Operations Center
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 font-medium">
                Submission Readiness Intelligence
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Operational overview of every active pursuit — readiness, compliance gaps, artifact
              health, package completeness, timeline status, draft queue. No auto-submission.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => withBusy(() => refreshArtifactExpirations(), 'Refresh failed')}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-40"
            >
              Refresh artifact expirations
            </button>
            <button
              type="button"
              onClick={load}
              disabled={busy}
              className="px-3 py-2 rounded-md bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 disabled:opacity-40"
            >
              {busy ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5" data-testid="capture-ops-kpis">
          <StatCard label="Active Pursuits" value={active.length} />
          <StatCard
            label="Mean Readiness"
            value={readiness.mean_composite != null ? Number(readiness.mean_composite).toFixed(0) : '—'}
            sub={`${buckets.ready || 0} ready · ${buckets.needs_prep || 0} prep · ${buckets.blocked || 0} blocked`}
          />
          <StatCard label="Open Compliance Gaps" value={gapsByPursuit.reduce((s, g) => s + (g.gap_count || 0), 0)} sub={`${gapsByPursuit.length} pursuits with gaps`} />
          <StatCard label="Drafts In-Flight" value={draftQueue.in_flight || 0} sub="parallel queue" />
        </div>

        <Section
          title="Active Pursuits"
          subtitle="Open + in-progress pursuits — click any to open the workspace."
          testId="section-active-pursuits"
        >
          {active.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No active pursuits.</p>
          ) : (
            <div className="grid gap-2">
              {active.map((p) => (
                <Link
                  key={p.id}
                  to={`/admin/deep-research/pursuits/${p.id}`}
                  className="rounded border border-gray-200 p-3 text-sm hover:border-cyan-400 transition-colors block"
                  data-testid={`active-pursuit-${p.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    <PursuitStatusPill status={p.status} />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {p.anchorKind} #{p.anchorId} · {(p.linkedOpportunityIds || []).length} linked opportunities
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Compliance Gaps by Pursuit"
          subtitle="Top open gaps per pursuit (severity-ranked). Address blockers before submission."
          testId="section-compliance-gaps"
        >
          {gapsByPursuit.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No open compliance gaps across active pursuits.</p>
          ) : (
            <ul className="space-y-2">
              {gapsByPursuit.slice(0, 12).map((g) => (
                <li key={g.pursuit_id} className="rounded border border-gray-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      to={`/admin/deep-research/pursuits/${g.pursuit_id}`}
                      className="font-semibold text-gray-900 hover:underline"
                    >
                      Pursuit #{g.pursuit_id}
                    </Link>
                    <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${
                      g.top_severity >= 75 ? 'bg-red-100 text-red-700'
                        : g.top_severity >= 50 ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-600'
                    }`}>
                      {g.gap_count} gap{g.gap_count === 1 ? '' : 's'} · top severity {Math.round(g.top_severity)}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-[11px] text-gray-600">
                    {(g.sample || []).slice(0, 3).map((s) => (
                      <li key={s.id}>• [{s.gapKind}] {s.label}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <Section title="Artifact Vault Health" testId="section-artifact-health">
            <div className="text-sm text-gray-700">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-bold text-gray-900">{artifacts.health_pct || 0}%</span>
                <span className="text-xs text-gray-500">{artifacts.total || 0} artifacts total</span>
              </div>
              <PercentBar value={artifacts.health_pct || 0} color="bg-emerald-500" />
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><span className="font-semibold text-emerald-700">{artifacts.active || 0}</span> active</div>
                <div><span className="font-semibold text-amber-700">{artifacts.expiring || 0}</span> expiring</div>
                <div><span className="font-semibold text-red-700">{artifacts.expired || 0}</span> expired</div>
              </div>
            </div>
          </Section>

          <Section title="Submission Package Snapshot" testId="section-packages">
            <div className="text-sm text-gray-700">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-2xl font-bold text-gray-900">{packages.mean_completeness || 0}%</span>
                <span className="text-xs text-gray-500">{packages.count || 0} package{packages.count === 1 ? '' : 's'}</span>
              </div>
              <PercentBar value={packages.mean_completeness || 0} color="bg-violet-500" />
              <div className="mt-3 flex gap-3 text-xs">
                {Object.entries(packages.by_status || {}).map(([s, n]) => (
                  <span key={s} className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                    {s}: <span className="font-semibold">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          </Section>
        </div>

        <Section
          title="Timeline Rollup"
          subtitle="Overdue + blocked + next-due across all active pursuits."
          testId="section-timeline-rollup"
        >
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded border border-gray-200 p-3">
              <div className="text-[11px] uppercase text-gray-400">Overdue</div>
              <div className={`text-2xl font-bold ${timeline.overdue > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                {timeline.overdue || 0}
              </div>
            </div>
            <div className="rounded border border-gray-200 p-3">
              <div className="text-[11px] uppercase text-gray-400">Blocked</div>
              <div className={`text-2xl font-bold ${timeline.blocked > 0 ? 'text-amber-700' : 'text-gray-700'}`}>
                {timeline.blocked || 0}
              </div>
            </div>
            <div className="rounded border border-gray-200 p-3">
              <div className="text-[11px] uppercase text-gray-400">Next Due</div>
              {timeline.due_next ? (
                <Link
                  to={`/admin/deep-research/pursuits/${timeline.due_next.pursuit_id}`}
                  className="text-sm font-semibold text-cyan-700 hover:underline block leading-snug"
                  title={timeline.due_next.label}
                >
                  {new Date(timeline.due_next.due_at).toLocaleDateString()}
                  <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {timeline.due_next.label}
                  </div>
                </Link>
              ) : (
                <div className="text-sm text-gray-400 italic">No upcoming due dates.</div>
              )}
            </div>
          </div>
        </Section>

        <Section
          title="Draft Generation Queue"
          subtitle="Parallel draft jobs currently queued/running in the Review Queue handoff."
          testId="section-draft-queue"
        >
          {draftQueue.in_flight === 0 ? (
            <p className="text-xs text-gray-400 italic">No drafts currently queued or running.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="text-left py-1 px-2">Pursuit</th>
                  <th className="text-left py-1 px-2">Opportunity</th>
                  <th className="text-left py-1 px-2">Type</th>
                  <th className="text-left py-1 px-2">Status</th>
                  <th className="text-left py-1 px-2">Batch</th>
                </tr>
              </thead>
              <tbody>
                {(draftQueue.sample || []).map((j) => (
                  <tr key={j.id} className="border-b border-gray-100">
                    <td className="py-1 px-2">
                      <Link to={`/admin/deep-research/pursuits/${j.pursuitId}`} className="text-cyan-700 hover:underline">
                        #{j.pursuitId}
                      </Link>
                    </td>
                    <td className="py-1 px-2">#{j.opportunityId}</td>
                    <td className="py-1 px-2">{j.outputType}</td>
                    <td className="py-1 px-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        j.status === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>{j.status}</span>
                    </td>
                    <td className="py-1 px-2 text-[11px] text-gray-500 font-mono">{j.batchId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}

export default CaptureOpsPage;
