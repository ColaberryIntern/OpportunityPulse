import React from 'react';

// Deep Research Phase 4 — portfolio intelligence visual primitives.

export const SEQUENCING_META = {
  execute_now: { label: 'Execute Now', cls: 'bg-emerald-600 text-white' },
  queue: { label: 'Queue', cls: 'bg-emerald-100 text-emerald-800' },
  defer: { label: 'Defer', cls: 'bg-amber-100 text-amber-800' },
  monitor: { label: 'Monitor', cls: 'bg-blue-100 text-blue-700' },
  pass: { label: 'Pass', cls: 'bg-gray-100 text-gray-500' },
};

export function SequencingBadge({ rec }) {
  if (!rec) return null;
  const meta = SEQUENCING_META[rec] || SEQUENCING_META.monitor;
  return <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>;
}

// Horizontal pressure bar with color bands. 0-100.
export function PressureGauge({ label, value, max = 100 }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const pct = (v / max) * 100;
  const color = pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : pct >= 35 ? 'bg-blue-400' : 'bg-emerald-500';
  return (
    <div data-testid="pressure-gauge">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-800">{Math.round(v)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Stat tile (label + big number).
export function StatTile({ label, value, hint }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

// ROI scenario chip group (optimistic / realistic / conservative).
export function RoiScenarios({ portfolio }) {
  if (!portfolio) return null;
  const scenarios = ['optimistic', 'realistic', 'conservative'];
  const meta = {
    optimistic: { label: 'Optimistic', cls: 'border-emerald-300 bg-emerald-50' },
    realistic: { label: 'Realistic', cls: 'border-blue-300 bg-blue-50' },
    conservative: { label: 'Conservative', cls: 'border-amber-300 bg-amber-50' },
  };
  const fmt = (n) => (n == null ? '—' : `$${Math.round(Number(n) / 1000).toLocaleString()}k`);
  const fmtMrr = (n) => (n == null ? '—' : `$${Math.round(Number(n)).toLocaleString()}/mo`);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="roi-scenarios">
      {scenarios.map((s) => {
        const row = portfolio[s] || {};
        return (
          <div key={s} className={`rounded-lg border p-3 ${meta[s].cls}`}>
            <div className="text-xs font-semibold text-gray-700">{meta[s].label}</div>
            <div className="text-sm text-gray-700 mt-1">
              MRR: <strong>{fmtMrr(row.projectedMrr || row.projected_mrr)}</strong>
            </div>
            <div className="text-xs text-gray-600">
              Implementation: {fmt(row.implementationCost || row.implementation_cost)}
            </div>
            <div className="text-xs text-gray-600">
              Break-even: <strong>
                {row.breakevenMonths || row.breakeven_months
                  ? `${Math.round(Number(row.breakevenMonths || row.breakeven_months))} mo` : '—'}
              </strong>
              {' · '}
              12mo ROI: <strong>
                {row.projectedRoi12mo || row.projected_roi_12mo
                  ? `${Math.round(Number(row.projectedRoi12mo || row.projected_roi_12mo) * 100)}%` : '—'}
              </strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Bottleneck list — colored by severity.
export function BottleneckList({ bottlenecks }) {
  if (!Array.isArray(bottlenecks) || bottlenecks.length === 0) {
    return <p className="text-xs text-gray-400">No bottlenecks detected.</p>;
  }
  return (
    <ul className="space-y-1" data-testid="bottleneck-list">
      {bottlenecks.map((b, i) => {
        const sev = Number(b.severity) || 0;
        const color = sev >= 80 ? 'text-red-700' : sev >= 60 ? 'text-amber-700' : 'text-gray-700';
        return (
          <li key={`${b.type}-${i}`} className={`text-xs ${color}`}>
            <span className="font-medium">[{b.type}]</span> {b.label}
          </li>
        );
      })}
    </ul>
  );
}

// Dependency edge list — color-coded by risk.
export function DependencyEdgeList({ edges, nodes }) {
  if (!Array.isArray(edges) || edges.length === 0) {
    return <p className="text-xs text-gray-400">No cross-venture dependencies detected.</p>;
  }
  const titleByVenture = new Map((nodes || []).map((n) => [n.venture_idea_id, n.title]));
  return (
    <ul className="space-y-1 text-xs" data-testid="dependency-edges">
      {edges.slice(0, 12).map((e) => {
        const risk = Number(e.riskScore || e.risk_score) || 0;
        const color = risk >= 70 ? 'text-red-700' : risk >= 45 ? 'text-amber-700' : 'text-gray-700';
        return (
          <li key={e.id || `${e.ventureIdeaId}-${e.relatedVentureIdeaId}-${e.dependencyType}`} className={color}>
            <span className="font-medium">[{e.dependencyType || e.dependency_type} · risk {Math.round(risk)}]</span>{' '}
            <span className="text-gray-700">
              {titleByVenture.get(e.ventureIdeaId) || `#${e.ventureIdeaId}`}
              {' ↔ '}
              {titleByVenture.get(e.relatedVentureIdeaId) || `#${e.relatedVentureIdeaId}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Quarter plan — small grid showing quarters with venture cells.
export function QuarterPlanGrid({ plan }) {
  if (!plan || !plan.by_quarter) return null;
  const quarters = Object.keys(plan.by_quarter).filter((k) => k !== 'beyond');
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3" data-testid="quarter-plan">
      {quarters.map((q) => {
        const list = plan.by_quarter[q] || [];
        return (
          <div key={q} className="bg-gray-50 border border-gray-200 rounded-lg p-2">
            <div className="text-xs font-semibold text-gray-700 mb-1.5">{q}</div>
            {list.length === 0 && <div className="text-[11px] text-gray-300 italic">empty</div>}
            {list.map((v) => (
              <div key={v.venture_idea_id} className="bg-white border border-gray-200 rounded p-1.5 mb-1">
                <div className="text-[11px] font-medium text-gray-800 line-clamp-2">{v.title}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  rank #{v.portfolio_rank} · {v.mvp_timeline_weeks}wk
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Severity-colored recommendation row.
export function RecommendationRow({ rec, onAck, onDismiss, busy }) {
  const sev = Number(rec.severity) || 0;
  const color = sev >= 70 ? 'text-red-700' : sev >= 45 ? 'text-amber-700' : 'text-gray-700';
  return (
    <div className="border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3" data-testid={`recommendation-${rec.id}`}>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-semibold uppercase tracking-wide ${color}`}>
            {rec.recommendationType || rec.recommendation_type}
          </span>
          <span className="text-[11px] text-gray-400">severity {Math.round(sev)}</span>
        </div>
        <p className="text-xs text-gray-700">{rec.reason}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button type="button" onClick={onAck} disabled={busy}
          className="text-[11px] px-2 py-1 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-40">
          Acknowledge
        </button>
        <button type="button" onClick={onDismiss} disabled={busy}
          className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40">
          Dismiss
        </button>
      </div>
    </div>
  );
}
