import React from 'react';

// Deep Research Phase 5 — temporal + ecosystem visual primitives.

export const TRAJECTORY_META = {
  strengthening: { label: 'Strengthening', cls: 'bg-emerald-100 text-emerald-800', icon: '↑' },
  accelerating: { label: 'Accelerating', cls: 'bg-emerald-600 text-white', icon: '↑↑' },
  stable: { label: 'Stable', cls: 'bg-blue-100 text-blue-700', icon: '→' },
  weakening: { label: 'Weakening', cls: 'bg-amber-100 text-amber-800', icon: '↓' },
  stagnating: { label: 'Stagnating', cls: 'bg-gray-100 text-gray-600', icon: '–' },
  unknown: { label: 'Unknown', cls: 'bg-gray-100 text-gray-400', icon: '?' },
};
export const ECOSYSTEM_META = {
  emerging: { label: 'Emerging', cls: 'bg-blue-100 text-blue-700' },
  accelerating: { label: 'Accelerating', cls: 'bg-emerald-600 text-white' },
  saturated: { label: 'Saturated', cls: 'bg-amber-100 text-amber-800' },
  declining: { label: 'Declining', cls: 'bg-red-100 text-red-700' },
  dying: { label: 'Dying', cls: 'bg-gray-100 text-gray-500' },
  converging: { label: 'Converging', cls: 'bg-violet-100 text-violet-700' },
};
export const MOVEMENT_META = {
  accelerating: { label: 'Accelerating', cls: 'bg-emerald-600 text-white' },
  strengthening: { label: 'Strengthening', cls: 'bg-emerald-100 text-emerald-800' },
  stable: { label: 'Stable', cls: 'bg-blue-100 text-blue-700' },
  weakening: { label: 'Weakening', cls: 'bg-amber-100 text-amber-800' },
  decelerating: { label: 'Decelerating', cls: 'bg-red-100 text-red-700' },
  insufficient_data: { label: 'Insufficient Data', cls: 'bg-gray-100 text-gray-500' },
};

export function TrajectoryBadge({ classification }) {
  const meta = TRAJECTORY_META[classification] || TRAJECTORY_META.unknown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>
      <span>{meta.icon}</span>{meta.label}
    </span>
  );
}
export function EcosystemBadge({ classification }) {
  const meta = ECOSYSTEM_META[classification] || ECOSYSTEM_META.emerging;
  return <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>;
}
export function MovementBadge({ classification }) {
  const meta = MOVEMENT_META[classification] || MOVEMENT_META.insufficient_data;
  return <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>;
}

// Inline SVG sparkline — small time series, no chart library needed.
export function Sparkline({ values, width = 180, height = 36, color = '#2563eb' }) {
  if (!Array.isArray(values) || values.length === 0) {
    return <div className="text-[11px] text-gray-300 italic">no data</div>;
  }
  if (values.length === 1) {
    return <div className="text-[11px] text-gray-500">{Math.round(Number(values[0]) * 100) / 100}</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((Number(v) - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="block" data-testid="sparkline">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(values.length - 1) * stepX} cy={height - ((Number(values[values.length - 1]) - min) / range) * height} r="2.5" fill={color} />
    </svg>
  );
}

// Severity-colored drift alert row.
export function DriftAlertRow({ alert, onAck, onDismiss, busy }) {
  const sev = Number(alert.severity) || 0;
  const color = sev >= 75 ? 'border-red-300 bg-red-50' : sev >= 50 ? 'border-amber-300 bg-amber-50' : 'border-gray-200';
  return (
    <div className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${color}`} data-testid={`drift-${alert.id}`}>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">{alert.driftType}</span>
          <span className="text-[11px] text-gray-500">severity {Math.round(sev)}</span>
        </div>
        <p className="text-xs text-gray-700">{alert.description}</p>
        {alert.recommendation && (
          <p className="text-xs text-gray-500 mt-1 italic">→ {alert.recommendation}</p>
        )}
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

// 3-bar mini gauge for ecosystem health/maturity/momentum.
export function EcosystemBars({ healthScore, maturityScore, momentumScore }) {
  const bar = (label, value, color) => {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-16 shrink-0 text-gray-500">{label}</span>
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
        </div>
        <span className="w-8 shrink-0 text-right font-medium text-gray-700">{Math.round(v)}</span>
      </div>
    );
  };
  return (
    <div className="space-y-1">
      {bar('Health', healthScore, 'bg-emerald-500')}
      {bar('Maturity', maturityScore, 'bg-blue-500')}
      {bar('Momentum', momentumScore, 'bg-violet-500')}
    </div>
  );
}
