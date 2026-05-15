import React from 'react';
import { Link } from 'react-router-dom';
import { ChannelBadge } from './ActionVisuals';

// Deep Research Phase 7.5 — Strategic Context Banner.
//
// Sits at the top of My Opportunities when a strategic-context query param
// is present. Read-only display of:
//   - originating insight title + classification
//   - channel breakdown of the contributing opportunities
//   - disclosed value
//   - actions: Return to source, Open Pursuit (if one exists for this
//     anchor), Create Pursuit (if none exists yet)
//
// Never modifies state on its own — every action is a navigation or an
// explicit user click.

function fmtMoney(n) {
  const v = Number(n) || 0;
  if (v === 0) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}

const KIND_META = {
  deepResearch: { label: 'Deep Research', accent: 'border-cyan-400 bg-cyan-50' },
  cluster: { label: 'Cluster', accent: 'border-violet-400 bg-violet-50' },
  pattern: { label: 'Strategic Pattern', accent: 'border-indigo-400 bg-indigo-50' },
  venture: { label: 'Venture', accent: 'border-emerald-400 bg-emerald-50' },
  recommendation: { label: 'Strategic Recommendation', accent: 'border-amber-400 bg-amber-50' },
  intervention: { label: 'Intervention', accent: 'border-amber-400 bg-amber-50' },
  pursuit: { label: 'Pursuit Workspace', accent: 'border-cyan-400 bg-cyan-50' },
  researchRun: { label: 'Research Run', accent: 'border-blue-400 bg-blue-50' },
  agency: { label: 'Recurring Agency', accent: 'border-pink-400 bg-pink-50' },
  technology: { label: 'Recurring Technology', accent: 'border-pink-400 bg-pink-50' },
};

export default function StrategicContextBanner({
  context, onCreatePursuit, busy = false,
}) {
  if (!context) return null;
  const meta = KIND_META[context.kind] || KIND_META.deepResearch;
  const channelSummary = context.channel_summary || {};
  const byType = channelSummary.by_type || {};
  const linkedPursuits = Array.isArray(context.linked_pursuits) ? context.linked_pursuits : [];
  const openPursuit = linkedPursuits.find((p) => ['open', 'in_progress'].includes(p.status));
  return (
    <div
      className={`border rounded-xl p-4 mb-4 ${meta.accent}`}
      data-testid="strategic-context-banner"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {meta.label} Context
            </span>
            {context.classification && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-white text-gray-700 border border-gray-200">
                {context.classification}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">{context.title}</h2>
          {context.description && (
            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{context.description}</p>
          )}
          <div className="flex gap-2 flex-wrap mt-3 text-xs">
            <span className="font-semibold text-gray-700">
              Showing {channelSummary.total || 0} opportunit{channelSummary.total === 1 ? 'y' : 'ies'}
            </span>
            {Object.entries(byType).map(([k, n]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <ChannelBadge channel={k} />
                <span className="font-semibold text-gray-700">{n}</span>
              </span>
            ))}
            {channelSummary.disclosed_value > 0 && (
              <span className="text-emerald-700 font-semibold">
                {fmtMoney(channelSummary.disclosed_value)} disclosed value
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1 min-w-[180px]">
          {context.return_to && (
            <Link
              to={context.return_to.href}
              className="text-xs px-3 py-2 rounded bg-white border border-gray-300 text-gray-700 hover:border-gray-400 text-center"
              data-testid="banner-return-link"
            >
              ← {context.return_to.label}
            </Link>
          )}
          {openPursuit ? (
            <Link
              to={`/admin/deep-research/pursuits/${openPursuit.id}`}
              className="text-xs px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-center font-semibold"
            >
              Open Pursuit: {openPursuit.name}
            </Link>
          ) : onCreatePursuit ? (
            <button
              type="button"
              onClick={onCreatePursuit}
              disabled={busy}
              className="text-xs px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 text-center font-semibold"
              data-testid="banner-create-pursuit"
            >
              + Create Pursuit Workspace
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mt-3 italic">
        Strategic context is additive — every operational action below stays available.
        No auto-submission, no auto-execution.
      </p>
    </div>
  );
}
