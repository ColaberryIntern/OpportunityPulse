import React, { useCallback, useEffect, useState } from 'react';
import {
  getGovernance, getSlaDigest, listAuditEvents, getOperatorWorkloads,
  getStorageProviderHealth, describeMyPermissions,
} from '../services/deepResearchService';

// Deep Research Phase 11 — Enterprise Capture Governance Center.
//
// Read-only single pane over multi-tenant governance + operational
// auditability: tenant health, SLA escalations, operator workloads, audit
// events, workflow bottlenecks, queue governance, approval timelines,
// storage health, observability streams, operational lineage.

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
    violet: 'bg-violet-100 text-violet-800',
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${toneMap[tone] || toneMap.gray}`}>
      {children}
    </span>
  );
}

function PressureBar({ score }) {
  const v = Math.max(0, Math.min(100, Number(score) || 0));
  const color = v >= 70 ? 'bg-red-500' : v >= 40 ? 'bg-amber-500' : v >= 20 ? 'bg-yellow-400' : 'bg-emerald-500';
  return (
    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

function GovernancePage() {
  const [data, setData] = useState(null);
  const [perms, setPerms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [gov, p] = await Promise.all([
        getGovernance(),
        describeMyPermissions().catch(() => null),
      ]);
      setData(gov);
      setPerms(p);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load governance dashboard');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div className="p-6 text-center text-gray-500" data-testid="governance-loading">Loading governance dashboard…</div>;
  }
  if (!data) return null;

  const t = data.tenant || {};
  const pressure = data.pressure || {};
  const sla = data.sla || {};
  const workloads = Array.isArray(data.workloads) ? data.workloads : [];
  const audit = Array.isArray(data.audit_recent) ? data.audit_recent : [];
  const bottlenecks = Array.isArray(data.bottlenecks) ? data.bottlenecks : [];
  const aging = Array.isArray(data.approval_aging) ? data.approval_aging : [];
  const queue = data.queue || {};
  const storage = data.storage || {};
  const streams = data.streams || {};
  const lineage = data.lineage || {};
  const govEvents = Array.isArray(data.governance_events) ? data.governance_events : [];

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="governance-page">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Enterprise Capture Governance Center</h1>
        <p className="text-sm text-gray-500 mt-1">
          Multi-tenant governance + operational auditability across every Phase
          7&ndash;10 surface. Read-only composite. All operator actions are
          measure-only &mdash; no auto-submit, no auto-bid, no auto-sign.
        </p>
        <div className="text-[11px] text-gray-400 mt-1">
          Generated at: {data.generated_at} &middot; Tenant: <span className="font-mono">{t.display_name || `org ${t.organization_id}`}</span>
          {perms && perms.role && <span className="ml-3">Your role: <Pill tone="violet">{perms.role}</Pill></span>}
        </div>
      </header>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm" data-testid="governance-error">{err}</div>
      )}

      <Section
        title="Tenant Health + Pressure"
        subtitle="Composite indicator of governance load + acknowledgement state"
        right={<Pill tone={pressure.status === 'critical' ? 'red' : pressure.status === 'elevated' ? 'amber' : pressure.status === 'watch' ? 'amber' : 'green'}>{pressure.status || 'unknown'}</Pill>}
        testId="section-pressure"
      >
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Pressure score</span>
            <span className="text-sm font-bold">{pressure.pressure_score ?? 0} / 100</span>
          </div>
          <PressureBar score={pressure.pressure_score} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Governance mode" value={t.governance_mode || 'standard'} hint={t.strict_isolation ? 'strict isolation' : 'loose isolation'} />
          <Stat label="Open SLA" value={pressure.breakdown?.open_sla ?? 0} tone={(pressure.breakdown?.open_sla || 0) > 0 ? 'warn' : 'good'} />
          <Stat label="Escalated SLA" value={pressure.breakdown?.escalated_sla ?? 0} tone={(pressure.breakdown?.escalated_sla || 0) > 0 ? 'bad' : 'default'} />
          <Stat label="Overdue workflows" value={pressure.breakdown?.overdue_workflow ?? 0} tone={(pressure.breakdown?.overdue_workflow || 0) > 0 ? 'warn' : 'good'} />
        </div>
      </Section>

      <Section
        title="SLA Escalations"
        subtitle="Open events ranked by severity, including escalation candidates"
        right={<Pill tone={sla.escalated > 0 ? 'red' : sla.open > 0 ? 'amber' : 'green'}>{sla.escalated || 0} escalated</Pill>}
        testId="section-sla"
      >
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Stat label="Open" value={sla.open || 0} />
          <Stat label="Acknowledged" value={sla.acknowledged || 0} />
          <Stat label="Escalated (severity ≥ 80)" value={sla.escalated || 0} tone={(sla.escalated || 0) > 0 ? 'bad' : 'default'} />
        </div>
        {Array.isArray(sla.top_severity_sample) && sla.top_severity_sample.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">Kind</th>
                  <th className="text-right p-2">Severity</th>
                  <th className="text-left p-2">Subject</th>
                  <th className="text-right p-2">Age (d)</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {sla.top_severity_sample.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">{e.slaKind}</td>
                    <td className="p-2 text-right font-semibold">{e.severity}</td>
                    <td className="p-2 text-[11px]">{e.scopeKind}#{e.scopeId}</td>
                    <td className="p-2 text-right">{e.ageDays ?? '—'}</td>
                    <td className="p-2"><Pill tone={e.status === 'open' ? 'red' : e.status === 'acknowledged' ? 'amber' : 'green'}>{e.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Operator Workloads"
        subtitle="Active assignments by operator"
        testId="section-workloads"
      >
        {workloads.length === 0 ? (
          <div className="text-xs text-gray-400">No active assignments.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">Operator</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-right p-2">Highest priority</th>
                  <th className="text-left p-2">Oldest assigned</th>
                </tr>
              </thead>
              <tbody>
                {workloads.map((w) => (
                  <tr key={w.assignee} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">{w.assignee}</td>
                    <td className="p-2 text-right">{w.count}</td>
                    <td className="p-2 text-right">{w.highest_priority}</td>
                    <td className="p-2 text-[11px] text-gray-500">{w.oldest_assigned_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Workflow Bottlenecks"
        subtitle="Workflow kinds where median age exceeds expectations"
        testId="section-bottlenecks"
      >
        {bottlenecks.length === 0 ? (
          <div className="text-xs text-gray-400">No bottlenecks detected.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">Workflow kind</th>
                  <th className="text-right p-2">Open</th>
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

      <Section
        title="Approval Aging"
        subtitle="Assignments open for more than 2 days"
        testId="section-approval-aging"
      >
        {aging.length === 0 ? (
          <div className="text-xs text-gray-400">No aging approvals.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">Workflow</th>
                  <th className="text-left p-2">Assignee</th>
                  <th className="text-right p-2">Priority</th>
                  <th className="text-right p-2">Age (d)</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {aging.map((a) => (
                  <tr key={a.id} className="border-b border-gray-100">
                    <td className="p-2 font-mono text-[11px]">{a.workflowKind}</td>
                    <td className="p-2 text-[11px]">{a.assigneeEmail || a.assigneeUserId || '—'}</td>
                    <td className="p-2 text-right">{a.priority}</td>
                    <td className="p-2 text-right">{a.age_days}</td>
                    <td className="p-2"><Pill tone={a.status === 'open' ? 'red' : 'amber'}>{a.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Audit Trail"
        subtitle="Recent operator + system actions"
        right={<a className="text-xs text-indigo-600 hover:underline" href={`/api/v1/deep-research/governance/audit/export.csv`}>Export CSV</a>}
        testId="section-audit"
      >
        {audit.length === 0 ? (
          <div className="text-xs text-gray-400">No recent audit events.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">When</th>
                  <th className="text-left p-2">Actor</th>
                  <th className="text-left p-2">Action</th>
                  <th className="text-left p-2">Subject</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="p-2 text-[11px] text-gray-500">{e.createdAt}</td>
                    <td className="p-2 text-[11px]">{e.actorEmail || '—'}</td>
                    <td className="p-2 font-mono text-[11px]">{e.actionKind}.{e.actionVerb}</td>
                    <td className="p-2 text-[11px]">{e.subjectKind ? `${e.subjectKind}#${e.subjectId}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Queue Governance"
        subtitle="Workflow assignment rollup across pursuit operations"
        testId="section-queue"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Open" value={queue.open || 0} />
          <Stat label="Acknowledged" value={queue.acknowledged || 0} />
          <Stat label="In progress" value={queue.in_progress || 0} />
          <Stat label="Overdue" value={queue.overdue || 0} tone={(queue.overdue || 0) > 0 ? 'warn' : 'good'} />
        </div>
      </Section>

      <Section
        title="Storage Backend"
        subtitle="Provider health + migration status"
        right={<Pill tone={storage.health?.healthy ? 'green' : 'amber'}>{storage.health?.provider || 'url_only'}</Pill>}
        testId="section-storage"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Provider" value={storage.health?.provider || 'url_only'} />
          <Stat label="Healthy" value={storage.health?.healthy ? 'yes' : 'no'} tone={storage.health?.healthy ? 'good' : 'warn'} />
          <Stat label="Total assets" value={storage.migration?.total_assets || 0} />
          <Stat label="url_only assets" value={storage.migration?.url_only_assets || 0} hint={storage.migration?.needs_migration ? 'needs migration' : 'all migrated'} />
        </div>
      </Section>

      <Section
        title="Real-Time Observability Streams (SSE)"
        subtitle="Active subscribers + channel registry"
        right={<Pill tone="violet">{streams.active || 0} / {streams.max || 0}</Pill>}
        testId="section-streams"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Stat label="Active streams" value={streams.active || 0} />
          <Stat label="Max" value={streams.max || 0} />
          <Stat label="Heartbeat" value={`${(streams.heartbeat_ms || 0) / 1000}s`} />
          <Stat label="Ring buffer" value={`${streams.ring_buffer_size || 0} / ${streams.ring_buffer_max || 0}`} />
        </div>
        {streams.valid_channels && (
          <div className="flex flex-wrap gap-1.5">
            {streams.valid_channels.map((c) => <Pill key={c} tone="blue">{c}</Pill>)}
          </div>
        )}
      </Section>

      <Section
        title="Operational Lineage"
        subtitle="Directed edges between domain entities for traceability"
        testId="section-lineage"
      >
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
          <Stat label="Total edges" value={lineage.total_edges || 0} />
          <Stat label="Edges (last 24h)" value={lineage.edges_last_24h || 0} />
        </div>
      </Section>

      <Section
        title="Governance Events"
        subtitle="Recent operator decisions over workflow + approvals"
        testId="section-governance-events"
      >
        {govEvents.length === 0 ? (
          <div className="text-xs text-gray-400">No governance events yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-y border-gray-200 text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-2">When</th>
                  <th className="text-left p-2">Kind</th>
                  <th className="text-right p-2">Severity</th>
                  <th className="text-left p-2">Summary</th>
                </tr>
              </thead>
              <tbody>
                {govEvents.map((e) => (
                  <tr key={e.id} className="border-b border-gray-100">
                    <td className="p-2 text-[11px] text-gray-500">{e.createdAt}</td>
                    <td className="p-2 font-mono text-[11px]">{e.eventKind}</td>
                    <td className="p-2 text-right">{e.severity}</td>
                    <td className="p-2 text-[11px]">{e.summary || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="text-[10px] text-gray-400 mt-8 border-t border-gray-100 pt-3">
        Phase 11 &mdash; Multi-Tenant Governance + Operational Auditability. All
        operator actions are measure-only; no auto-submission, no auto-bid,
        no auto-sign. RBAC + tenant isolation enforced at the route layer.
      </div>
    </div>
  );
}

export default GovernancePage;
