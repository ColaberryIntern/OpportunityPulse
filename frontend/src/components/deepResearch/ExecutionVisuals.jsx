import React from 'react';

// Deep Research Phase 3 — execution intelligence visual primitives.
// Executive-clean, high-signal, not cluttered. CSS + inline SVG only.

// ---- shared metadata ------------------------------------------------------

export const LIFECYCLE_STATES = [
  'discovered', 'researching', 'evaluating', 'approved', 'generating_requirements',
  'planning_mvp', 'building', 'validating', 'launching', 'monitoring', 'archived',
];

export const LIFECYCLE_META = {
  discovered: { label: 'Discovered', cls: 'bg-slate-100 text-slate-600' },
  researching: { label: 'Researching', cls: 'bg-sky-100 text-sky-700' },
  evaluating: { label: 'Evaluating', cls: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Approved', cls: 'bg-indigo-100 text-indigo-700' },
  generating_requirements: { label: 'Generating Requirements', cls: 'bg-violet-100 text-violet-700' },
  planning_mvp: { label: 'Planning MVP', cls: 'bg-fuchsia-100 text-fuchsia-700' },
  building: { label: 'Building', cls: 'bg-amber-100 text-amber-700' },
  validating: { label: 'Validating', cls: 'bg-cyan-100 text-cyan-700' },
  launching: { label: 'Launching', cls: 'bg-emerald-100 text-emerald-700' },
  monitoring: { label: 'Monitoring', cls: 'bg-teal-100 text-teal-700' },
  archived: { label: 'Archived', cls: 'bg-gray-100 text-gray-500' },
};

export const DECISION_META = {
  BUILD_NOW: { label: 'Build Now', cls: 'bg-emerald-600 text-white' },
  BUILD_SOON: { label: 'Build Soon', cls: 'bg-emerald-100 text-emerald-800' },
  MONITOR: { label: 'Monitor', cls: 'bg-blue-100 text-blue-700' },
  TOO_EARLY: { label: 'Too Early', cls: 'bg-slate-100 text-slate-600' },
  OVERSATURATED: { label: 'Oversaturated', cls: 'bg-amber-100 text-amber-800' },
  HIGH_RISK: { label: 'High Risk', cls: 'bg-red-100 text-red-700' },
  NEEDS_VALIDATION: { label: 'Needs Validation', cls: 'bg-orange-100 text-orange-700' },
};

export const DEPLOYMENT_META = {
  prototype: { label: 'Prototype', cls: 'bg-slate-100 text-slate-600' },
  mvp: { label: 'MVP-Ready', cls: 'bg-blue-100 text-blue-700' },
  production: { label: 'Production-Ready', cls: 'bg-emerald-100 text-emerald-700' },
  enterprise: { label: 'Enterprise-Ready', cls: 'bg-violet-100 text-violet-700' },
};

// ---- badges ---------------------------------------------------------------

export function LifecycleBadge({ state, size = 'sm' }) {
  const meta = LIFECYCLE_META[state] || LIFECYCLE_META.discovered;
  const pad = size === 'lg' ? 'text-sm px-2.5 py-1' : 'text-xs px-2 py-0.5';
  return <span className={`inline-flex items-center font-semibold rounded ${pad} ${meta.cls}`}>{meta.label}</span>;
}

export function DecisionBadge({ decision }) {
  if (!decision) return null;
  const meta = DECISION_META[decision] || DECISION_META.MONITOR;
  return <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>;
}

export function DeploymentLevelBadge({ level }) {
  if (!level) return null;
  const meta = DEPLOYMENT_META[level] || DEPLOYMENT_META.prototype;
  return <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>;
}

// ---- execution readiness gauge (circular) --------------------------------

export function ReadinessGauge({ value, label = 'Execution Readiness', size = 110 }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = size / 2 - 10;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (v / 100) * circ;
  const color = v >= 70 ? '#059669' : v >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="inline-flex flex-col items-center" data-testid="readiness-gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy(size)} r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
        <circle
          cx={cx} cy={cy(size)} r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${cx} ${cy(size)})`}
        />
        <text x={cx} y={cx + 6} textAnchor="middle" fontSize="24" fontWeight="700" fill="#1f2937">
          {Math.round(v)}
        </text>
      </svg>
      <span className="text-xs text-gray-500 -mt-1">{label}</span>
    </div>
  );
}
function cy(size) { return size / 2; }

// ---- lifecycle tracker (horizontal stepper) ------------------------------

// Compact stepper — every lifecycle stage, the current one highlighted, the
// ones already passed marked done. Archived is shown separately.
export function LifecycleTracker({ currentState }) {
  const flow = LIFECYCLE_STATES.filter((s) => s !== 'archived');
  const currentIdx = flow.indexOf(currentState);
  const isArchived = currentState === 'archived';
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="lifecycle-tracker">
      {flow.map((state, idx) => {
        const done = !isArchived && idx < currentIdx;
        const current = !isArchived && idx === currentIdx;
        const cls = current ? 'bg-indigo-600 text-white'
          : done ? 'bg-emerald-100 text-emerald-700'
            : 'bg-gray-100 text-gray-400';
        return (
          <React.Fragment key={state}>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
              {LIFECYCLE_META[state].label}
            </span>
            {idx < flow.length - 1 && <span className="text-gray-300 text-[10px]">›</span>}
          </React.Fragment>
        );
      })}
      {isArchived && (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 ml-1">
          Archived
        </span>
      )}
    </div>
  );
}

// ---- readiness sub-score bars --------------------------------------------

export function ReadinessSubScores({ scores }) {
  const entries = Object.entries(scores || {}).filter(([k]) => k !== 'weights' && k !== 'decision'
    && k !== 'readiness_average');
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1" data-testid="readiness-subscores">
      {entries.map(([dim, val]) => {
        const v = Math.max(0, Math.min(100, Number(val) || 0));
        const color = v >= 70 ? 'bg-emerald-500' : v >= 45 ? 'bg-amber-500' : 'bg-gray-400';
        return (
          <div key={dim} className="flex items-center gap-2 text-xs">
            <span className="w-40 shrink-0 text-gray-500 capitalize">{dim.replace(/_/g, ' ')}</span>
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right font-medium text-gray-700">{Math.round(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---- timeline + staffing chips -------------------------------------------

export function TimelineChip({ weeks }) {
  if (weeks == null) return null;
  return (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700">
      ~{weeks}wk MVP
    </span>
  );
}

export function StaffingChip({ staffing }) {
  const headcount = staffing && staffing.headcount;
  if (!headcount) return null;
  return (
    <span
      className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded bg-violet-50 text-violet-700"
      title={staffing.roles ? staffing.roles.join(', ') : ''}
    >
      {headcount} people
    </span>
  );
}
