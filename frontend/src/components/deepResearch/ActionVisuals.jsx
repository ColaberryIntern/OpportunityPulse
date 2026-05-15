import React from 'react';

// Deep Research Phase 7 — visual primitives for action intelligence,
// traceability, justification, cluster drilldown, pursuit workspaces.

export const CHANNEL_META = {
  gov_contract: { label: 'Gov Contract', cls: 'bg-blue-100 text-blue-700' },
  bonfire: { label: 'Bonfire', cls: 'bg-indigo-100 text-indigo-700' },
  bonfire_strategic: { label: 'Bonfire Strategic', cls: 'bg-indigo-100 text-indigo-700' },
  grant: { label: 'Grant', cls: 'bg-emerald-100 text-emerald-700' },
  ai_job: { label: 'Job', cls: 'bg-amber-100 text-amber-800' },
  freelance: { label: 'Freelance', cls: 'bg-yellow-100 text-yellow-700' },
  ai_news: { label: 'News', cls: 'bg-violet-100 text-violet-700' },
  investment: { label: 'Capital', cls: 'bg-pink-100 text-pink-700' },
  research: { label: 'Research', cls: 'bg-cyan-100 text-cyan-700' },
  unknown: { label: 'Unknown', cls: 'bg-gray-100 text-gray-500' },
};

export const CONTRIBUTION_META = {
  direct_link: 'Direct link',
  cluster_classification: 'Cluster classification',
  report_source: 'Report source',
  pattern_match: 'Pattern match',
  graph_edge: 'Graph edge',
  manual: 'Manual',
};

export function ChannelBadge({ channel }) {
  const meta = CHANNEL_META[channel] || CHANNEL_META.unknown;
  return (
    <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export function RelevancePill({ relevance }) {
  const v = Math.round(Number(relevance) || 0);
  const cls = v >= 75 ? 'bg-emerald-100 text-emerald-800'
    : v >= 50 ? 'bg-amber-100 text-amber-800'
      : 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold rounded px-2 py-0.5 ${cls}`}>
      relevance {v}
    </span>
  );
}

export function OpportunityRow({ opp, onOpen, trace }) {
  return (
    <div
      className="rounded border border-gray-200 p-3 text-sm hover:border-gray-400 transition-colors"
      data-testid={`opp-row-${opp.id}`}
    >
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <ChannelBadge channel={opp.type} />
          {opp.source && <span className="text-[11px] text-gray-500">{opp.source}</span>}
          {trace && trace.relevance != null && <RelevancePill relevance={trace.relevance} />}
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={() => onOpen(opp)}
            className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
          >
            Open
          </button>
        )}
      </div>
      <h4 className="text-sm font-semibold text-gray-900 leading-snug">{opp.title}</h4>
      {trace && trace.contribution && (
        <p className="text-[11px] text-gray-500 mt-1">
          <span className="font-medium">{CONTRIBUTION_META[trace.contribution] || trace.contribution}:</span>{' '}
          {trace.reasoning || ''}
        </p>
      )}
      <div className="text-[11px] text-gray-500 mt-1 flex gap-3">
        {opp.publishedAt && <span>{new Date(opp.publishedAt).toLocaleDateString()}</span>}
        {opp.value != null && opp.value !== 0 && <span>${Number(opp.value).toLocaleString()}</span>}
        {opp.aiScore != null && <span>AI score {Number(opp.aiScore).toFixed(0)}</span>}
      </div>
    </div>
  );
}

// Drawer overlay — opens from the right with the supporting opportunities
// for any insight (venture / cluster / pattern / recommendation / etc.).
export function EvidenceDrawer({
  open, onClose, title, subtitle, opportunities = [],
  channels = {}, busy = false, onRebuild,
}) {
  if (!open) return null;
  const grouped = {};
  for (const o of opportunities) {
    const k = o.type || 'unknown';
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(o);
  }
  return (
    <div className="fixed inset-0 z-40" data-testid="evidence-drawer">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl flex flex-col">
        <header className="p-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          </div>
          <div className="flex gap-1">
            {onRebuild && (
              <button
                type="button"
                onClick={onRebuild}
                disabled={busy}
                className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-40"
              >
                Rebuild
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {opportunities.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              No supporting opportunities yet. Try the Rebuild button to derive evidence
              from the underlying analytics.
            </p>
          ) : (
            <>
              <div className="flex gap-2 flex-wrap text-xs">
                {Object.entries(channels).map(([k, n]) => (
                  <span key={k} className="inline-flex items-center gap-1">
                    <ChannelBadge channel={k} />
                    <span className="font-semibold text-gray-700">{n}</span>
                  </span>
                ))}
              </div>
              {Object.entries(grouped).map(([channel, opps]) => (
                <section key={channel}>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                    {(CHANNEL_META[channel] || CHANNEL_META.unknown).label} ({opps.length})
                  </h4>
                  <div className="space-y-2">
                    {opps.map((o) => (
                      <OpportunityRow key={o.id} opp={o} trace={o._trace} />
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function JustificationCard({ justification, onShowEvidence }) {
  if (!justification) return null;
  const factors = Array.isArray(justification.factors) ? justification.factors : [];
  const conf = Number(justification.confidence || 0);
  const confCls = conf >= 70 ? 'bg-emerald-100 text-emerald-800'
    : conf >= 40 ? 'bg-amber-100 text-amber-800'
      : 'bg-gray-100 text-gray-600';
  return (
    <div className="rounded-lg border border-gray-200 p-4 bg-white" data-testid="justification-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{justification.headline}</h3>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed">{justification.narrative}</p>
        </div>
        <span className={`text-xs font-semibold rounded px-2 py-0.5 ${confCls}`}>
          confidence {Math.round(conf)}
        </span>
      </div>
      {factors.length > 0 && (
        <ul className="mt-3 space-y-1">
          {factors.slice(0, 6).map((f, i) => (
            <li key={`${f.label}-${i}`} className="flex items-center justify-between text-xs">
              <span className="text-gray-700">{f.label}</span>
              <span className="text-gray-500 font-mono">{f.weight}</span>
            </li>
          ))}
        </ul>
      )}
      {onShowEvidence && (
        <button
          type="button"
          onClick={onShowEvidence}
          className="mt-3 text-xs px-2 py-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200"
        >
          View Supporting Opportunities
        </button>
      )}
    </div>
  );
}

export function RecurringRow({ row, onSelect }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 border-b border-gray-100 text-xs">
      <div className="flex-1 truncate">
        <span className="text-gray-900 font-medium">{row.value}</span>
      </div>
      <div className="flex items-center gap-3 text-gray-500">
        <span className="font-semibold text-gray-700">{row.occurrenceCount}</span>
        {onSelect && (
          <button
            type="button"
            onClick={() => onSelect(row)}
            className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200"
          >
            Open
          </button>
        )}
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

export function TermChip({ term, count, max }) {
  const ratio = max > 0 ? count / max : 0;
  const opacity = 0.4 + ratio * 0.6;
  return (
    <span
      className="inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 bg-blue-100 text-blue-800"
      style={{ opacity: Math.max(0.5, opacity) }}
    >
      {term} <span className="ml-1 text-blue-600 font-normal">×{count}</span>
    </span>
  );
}

export function PursuitStatusPill({ status }) {
  const meta = {
    open: { label: 'Open', cls: 'bg-blue-100 text-blue-700' },
    in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-800' },
    submitted: { label: 'Submitted', cls: 'bg-violet-100 text-violet-700' },
    won: { label: 'Won', cls: 'bg-emerald-100 text-emerald-800' },
    lost: { label: 'Lost', cls: 'bg-red-100 text-red-700' },
    archived: { label: 'Archived', cls: 'bg-gray-100 text-gray-500' },
  }[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center text-xs font-semibold rounded px-2 py-0.5 ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
