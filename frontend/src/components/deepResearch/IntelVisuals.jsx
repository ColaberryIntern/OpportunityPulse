import React from 'react';

// Deep Research Phase 2 — visual intelligence primitives.
//
// Small, executive-readable, premium. No clutter. CSS + inline SVG only —
// the one real chart (signal acceleration) uses recharts inline on the
// report page. Everything here is a pure presentational component.

// ---- shared metadata ------------------------------------------------------

export const STAGE_META = {
  emerging: { label: 'Emerging', cls: 'bg-slate-100 text-slate-700', dot: '#64748b' },
  acceleration: { label: 'Acceleration', cls: 'bg-blue-100 text-blue-700', dot: '#2563eb' },
  breakout: { label: 'Breakout', cls: 'bg-violet-100 text-violet-700', dot: '#7c3aed' },
  mainstream: { label: 'Mainstream', cls: 'bg-emerald-100 text-emerald-700', dot: '#059669' },
  saturated: { label: 'Saturated', cls: 'bg-amber-100 text-amber-700', dot: '#d97706' },
  declining: { label: 'Declining', cls: 'bg-red-100 text-red-700', dot: '#dc2626' },
  unknown: { label: 'Unknown', cls: 'bg-gray-100 text-gray-500', dot: '#9ca3af' },
};

export const RECOMMENDATION_META = {
  strong_build: { label: 'Strong Build', cls: 'bg-emerald-600 text-white' },
  build: { label: 'Build', cls: 'bg-emerald-100 text-emerald-800' },
  watch: { label: 'Watch', cls: 'bg-amber-100 text-amber-800' },
  pass: { label: 'Pass', cls: 'bg-gray-100 text-gray-600' },
};

const CONVERGENCE_META = {
  commercial_acceleration: { label: 'Commercial Acceleration', cls: 'bg-violet-100 text-violet-700' },
  procurement_pull: { label: 'Procurement Pull', cls: 'bg-blue-100 text-blue-700' },
  capital_convergence: { label: 'Capital Convergence', cls: 'bg-emerald-100 text-emerald-700' },
  talent_convergence: { label: 'Talent Convergence', cls: 'bg-cyan-100 text-cyan-700' },
  research_only: { label: 'Research Only', cls: 'bg-slate-100 text-slate-600' },
  diffuse: { label: 'Diffuse Signal', cls: 'bg-gray-100 text-gray-600' },
  emerging_single: { label: 'Single-Channel', cls: 'bg-gray-100 text-gray-600' },
  none: { label: 'No Convergence', cls: 'bg-gray-100 text-gray-500' },
};

// ---- badges ---------------------------------------------------------------

export function MarketStageBadge({ stage, size = 'sm' }) {
  const meta = STAGE_META[stage] || STAGE_META.unknown;
  const pad = size === 'lg' ? 'text-sm px-2.5 py-1' : 'text-xs px-2 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold rounded ${pad} ${meta.cls}`}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
}

export function RecommendationBadge({ level }) {
  const meta = RECOMMENDATION_META[level] || RECOMMENDATION_META.watch;
  return (
    <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export function ConvergenceBadge({ type }) {
  const meta = CONVERGENCE_META[type] || CONVERGENCE_META.none;
  return (
    <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// ---- confidence gauge (semicircle) ---------------------------------------

// A compact semicircular gauge for a 0-1 confidence / strength value.
export function ConfidenceGauge({ value, label = 'Confidence', size = 96 }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  // Semicircle arc from 180° → 0°.
  const angle = Math.PI * (1 - v);
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const large = 0; // always < 180°
  const color = v >= 0.66 ? '#059669' : v >= 0.4 ? '#d97706' : '#dc2626';
  return (
    <div className="inline-flex flex-col items-center" data-testid="confidence-gauge">
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`}>
        <path
          d={`M 8 ${cy} A ${r} ${r} 0 0 1 ${size - 8} ${cy}`}
          fill="none" stroke="#e5e7eb" strokeWidth="8" strokeLinecap="round"
        />
        <path
          d={`M 8 ${cy} A ${r} ${r} 0 ${large} 1 ${x} ${y}`}
          fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="18" fontWeight="700" fill="#1f2937">
          {Math.round(v * 100)}
        </text>
      </svg>
      <span className="text-xs text-gray-500 -mt-1">{label}</span>
    </div>
  );
}

// ---- horizontal score bar -------------------------------------------------

// A labeled 0-100 score bar — used for the 8 venture scoring dimensions.
export function ScoreBar({ label, value, max = 100 }) {
  const v = Math.max(0, Math.min(max, Number(value) || 0));
  const pct = (v / max) * 100;
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 45 ? 'bg-amber-500' : 'bg-gray-400';
  return (
    <div className="flex items-center gap-2 text-xs" data-testid="score-bar">
      <span className="w-36 shrink-0 text-gray-500 capitalize">{String(label).replace(/_/g, ' ')}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right font-medium text-gray-700">{Math.round(v)}</span>
    </div>
  );
}

// ---- correlation strength bar --------------------------------------------

export function CorrelationStrengthBar({ strength, acceleration }) {
  const s = Math.max(0, Math.min(1, Number(strength) || 0));
  const accel = Number(acceleration) || 1;
  const accelLabel = accel >= 1.3 ? `↑ ${accel.toFixed(2)}× accelerating`
    : accel <= 0.8 ? `↓ ${accel.toFixed(2)}× cooling`
      : `→ ${accel.toFixed(2)}× steady`;
  const accelColor = accel >= 1.3 ? 'text-emerald-600' : accel <= 0.8 ? 'text-red-600' : 'text-gray-500';
  return (
    <div data-testid="correlation-strength">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500">Cross-channel correlation strength</span>
        <span className="font-semibold text-gray-800">{Math.round(s * 100)}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-400 to-violet-500"
          style={{ width: `${s * 100}%` }}
        />
      </div>
      <div className={`text-xs mt-1 font-medium ${accelColor}`}>{accelLabel}</div>
    </div>
  );
}

// ---- signal heat strip ----------------------------------------------------

// A per-channel heat strip — each channel a cell shaded by its signal score.
export function SignalHeatStrip({ signals }) {
  const list = Array.isArray(signals) ? signals : [];
  if (list.length === 0) return null;
  const heat = (score) => {
    const v = Math.max(0, Math.min(1, Number(score) || 0));
    if (v >= 0.5) return 'bg-violet-500 text-white';
    if (v >= 0.3) return 'bg-blue-400 text-white';
    if (v >= 0.15) return 'bg-blue-200 text-blue-900';
    return 'bg-gray-100 text-gray-500';
  };
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="signal-heat-strip">
      {list.map((s) => (
        <div
          key={s.channel}
          className={`px-2 py-1 rounded text-xs font-medium ${heat(s.signal_score)}`}
          title={`${s.label}: ${s.volume} opps · recency ${s.recency} · accel ${s.acceleration}`}
        >
          {s.label} · {Math.round((Number(s.signal_score) || 0) * 100)}
        </div>
      ))}
    </div>
  );
}

// ---- composite score chip -------------------------------------------------

export function CompositeScoreChip({ score }) {
  const v = Number(score) || 0;
  const color = v >= 75 ? 'bg-emerald-600' : v >= 60 ? 'bg-emerald-500'
    : v >= 42 ? 'bg-amber-500' : 'bg-gray-400';
  return (
    <span
      className={`inline-flex items-center justify-center text-white text-sm font-bold rounded-md px-2 py-1 ${color}`}
      data-testid="composite-score-chip"
      title="Venture composite score (0-100)"
    >
      {Math.round(v)}
    </span>
  );
}
