import React from 'react';

// Deep Research Phase 6 — planning workspace visual primitives.

export const HEALTH_META = {
  healthy: { label: 'Healthy', cls: 'bg-emerald-100 text-emerald-800' },
  strengthening: { label: 'Strengthening', cls: 'bg-emerald-600 text-white' },
  at_risk: { label: 'At Risk', cls: 'bg-amber-100 text-amber-800' },
  overloaded: { label: 'Overloaded', cls: 'bg-orange-100 text-orange-800' },
  stagnating: { label: 'Stagnating', cls: 'bg-gray-100 text-gray-600' },
  declining: { label: 'Declining', cls: 'bg-red-100 text-red-700' },
};

export const ACCURACY_META = {
  accurate: { label: 'Accurate', cls: 'bg-emerald-100 text-emerald-800' },
  optimistic: { label: 'Optimistic', cls: 'bg-amber-100 text-amber-800' },
  pessimistic: { label: 'Pessimistic', cls: 'bg-blue-100 text-blue-700' },
  unknown: { label: 'Unknown', cls: 'bg-gray-100 text-gray-500' },
};

export const REFRESH_STATUS_META = {
  success: { label: 'Success', cls: 'bg-emerald-100 text-emerald-800' },
  partial: { label: 'Partial', cls: 'bg-amber-100 text-amber-800' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-700' },
  running: { label: 'Running', cls: 'bg-blue-100 text-blue-700' },
};

export function HealthBadge({ classification }) {
  const meta = HEALTH_META[classification] || HEALTH_META.healthy;
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}
      data-testid="health-badge"
    >
      {meta.label}
    </span>
  );
}

export function AccuracyBadge({ classification }) {
  const meta = ACCURACY_META[classification] || ACCURACY_META.unknown;
  return (
    <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export function RefreshStatusBadge({ status }) {
  const meta = REFRESH_STATUS_META[status] || REFRESH_STATUS_META.running;
  return (
    <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export function SeverityPill({ severity, label }) {
  const sev = Math.round(Number(severity) || 0);
  const cls = sev >= 75 ? 'bg-red-100 text-red-700'
    : sev >= 50 ? 'bg-amber-100 text-amber-800'
      : 'bg-blue-100 text-blue-700';
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold rounded px-2 py-0.5 ${cls}`}>
      {label || 'severity'} {sev}
    </span>
  );
}

export function RecommendationRow({ item, onAck, onDismiss, busy, typeLabel, type }) {
  const sev = Number(item.severity) || 0;
  const color = sev >= 75 ? 'border-red-300 bg-red-50'
    : sev >= 50 ? 'border-amber-300 bg-amber-50' : 'border-gray-200';
  return (
    <div
      className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${color}`}
      data-testid={`rec-${type}-${item.id}`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">
            {typeLabel || item.interventionType || item.recommendationType || item.driftType}
          </span>
          <SeverityPill severity={sev} />
        </div>
        <h4 className="text-sm font-semibold text-gray-900">{item.title || item.description}</h4>
        {item.rationale && (
          <p className="text-xs text-gray-700 mt-1">{item.rationale}</p>
        )}
        {item.mitigation && (
          <p className="text-xs text-gray-500 italic mt-1">→ {item.mitigation}</p>
        )}
        {Array.isArray(item.relatedVentureIds) && item.relatedVentureIds.length > 0 && (
          <p className="text-[11px] text-gray-500 mt-1">
            Ventures: {item.relatedVentureIds.slice(0, 6).join(', ')}
            {item.relatedVentureIds.length > 6 ? ` +${item.relatedVentureIds.length - 6} more` : ''}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          type="button"
          onClick={onAck}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-40"
        >
          Acknowledge
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function HealthBucketStrip({ buckets }) {
  if (!buckets) return null;
  const entries = Object.entries(HEALTH_META).map(([key, meta]) => [
    key, meta, Number(buckets[key] || 0),
  ]);
  const total = entries.reduce((acc, [, , n]) => acc + n, 0) || 0;
  return (
    <div data-testid="health-bucket-strip">
      <div className="flex h-2 rounded-full overflow-hidden">
        {entries.map(([key, meta, n]) => {
          if (n === 0) return null;
          const pct = total > 0 ? (n / total) * 100 : 0;
          return (
            <div
              key={key}
              className={meta.cls}
              style={{ width: `${pct}%` }}
              title={`${meta.label}: ${n}`}
            />
          );
        })}
      </div>
      <div className="flex gap-3 flex-wrap mt-2 text-[11px] text-gray-600">
        {entries.map(([key, meta, n]) => (
          <div key={key} className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded ${meta.cls}`} />
            <span>{meta.label}</span>
            <span className="font-semibold text-gray-800">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AccuracyBar({ summary }) {
  if (!summary || !summary.summary || summary.summary.length === 0) {
    return <div className="text-xs text-gray-500 italic">No forecast comparisons yet.</div>;
  }
  return (
    <div className="space-y-2" data-testid="accuracy-bar">
      {summary.summary.map((row) => {
        const total = Number(row.total) || 0;
        const acc = total > 0 ? Math.round((row.accurate / total) * 100) : 0;
        return (
          <div key={row.forecast_kind}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-gray-700 capitalize">{row.forecast_kind}</span>
              <span className="text-gray-500">{row.accurate}/{total} accurate ({acc}%)</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
              <div className="bg-emerald-500" style={{ width: `${total > 0 ? (row.accurate / total) * 100 : 0}%` }} />
              <div className="bg-amber-400" style={{ width: `${total > 0 ? (row.optimistic / total) * 100 : 0}%` }} />
              <div className="bg-blue-400" style={{ width: `${total > 0 ? (row.pessimistic / total) * 100 : 0}%` }} />
              <div className="bg-gray-300" style={{ width: `${total > 0 ? (row.unknown / total) * 100 : 0}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RefreshRunRow({ run }) {
  const status = REFRESH_STATUS_META[run.status] || REFRESH_STATUS_META.running;
  return (
    <div className="flex items-center justify-between py-2 px-3 border-b border-gray-100 text-xs" data-testid={`run-${run.id}`}>
      <div className="flex items-center gap-3">
        <span className="font-mono text-gray-500">#{run.id}</span>
        <span className="font-medium text-gray-700 capitalize">{run.runType}</span>
        <span className="text-gray-400">{run.trigger}</span>
        <RefreshStatusBadge status={run.status} />
      </div>
      <div className="flex items-center gap-3 text-gray-500">
        <span>{run.stepCount || 0} steps</span>
        {run.errorCount > 0 && <span className="text-red-600">{run.errorCount} errors</span>}
        <span>{run.durationMs != null ? `${Math.round(run.durationMs)}ms` : '—'}</span>
        <span>{run.startedAt ? new Date(run.startedAt).toLocaleString() : ''}</span>
      </div>
    </div>
  );
}

export function VentureHealthRow({ row }) {
  return (
    <tr className="border-b border-gray-100" data-testid={`health-row-${row.ventureIdeaId}`}>
      <td className="py-2 px-2 text-xs font-mono text-gray-500">{row.ventureIdeaId}</td>
      <td className="py-2 px-2 text-xs">
        <HealthBadge classification={row.healthClassification} />
      </td>
      <td className="py-2 px-2 text-xs text-right font-semibold">{Number(row.healthScore).toFixed(1)}</td>
      <td className="py-2 px-2 text-xs text-gray-600">{row.rationale}</td>
      <td className="py-2 px-2 text-xs text-gray-500 italic">{row.suggestedIntervention || '—'}</td>
    </tr>
  );
}

export function DependencyReviewRow({ edge, onAction, busy }) {
  const [note, setNote] = React.useState('');
  const [owner, setOwner] = React.useState(edge?.metadata?.owner || '');
  return (
    <div className="rounded border border-gray-200 p-3 text-xs" data-testid={`dep-${edge.id}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <span className="font-semibold">{edge.blocker_title || `Venture ${edge.blockerVentureId}`}</span>
          <span className="text-gray-400 mx-2">blocks</span>
          <span className="font-semibold">{edge.blocked_title || `Venture ${edge.blockedVentureId}`}</span>
        </div>
        <SeverityPill severity={Number(edge.cascadeRisk) || 0} label="cascade" />
      </div>
      {edge.prerequisite && (
        <p className="text-gray-600 mb-2">{edge.prerequisite}</p>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="border rounded px-2 py-1 text-xs flex-1 min-w-[120px]"
          placeholder="Owner (optional)"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        />
        <input
          className="border rounded px-2 py-1 text-xs flex-1 min-w-[160px]"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(edge.id, 'approve', { owner, note })}
            className="px-2 py-1 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-40"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(edge.id, 'reject', { owner, note })}
            className="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-40"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(edge.id, 'annotate', { owner, note })}
            className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-40"
          >
            Annotate
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(edge.id, 'assign_owner', { owner, note })}
            className="px-2 py-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-40"
          >
            Assign
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(edge.id, 'resolve', { owner, note })}
            className="px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
          >
            Resolve
          </button>
        </div>
      </div>
    </div>
  );
}
