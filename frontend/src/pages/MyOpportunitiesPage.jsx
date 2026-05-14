import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { listMyOpportunities, recordEvent } from '../services/oiedService';
import OpportunityActionButtons from '../components/oied/OpportunityActionButtons';
import OpportunityDetailModal from '../components/oied/OpportunityDetailModal';
import ChannelChip from '../components/oied/ChannelChip';
import RelatedToolsRow from '../components/oied/RelatedToolsRow';
import KeywordDrillCloud from '../components/oied/KeywordDrillCloud';
import { emojiForTitle } from '../components/oied/titleEmoji';

// Mirrors backend channels.service.CHANNELS — used by the filter
// dropdown and the page header. Order is canonical.
const CHANNEL_OPTIONS = [
  { key: '',               label: 'All channels' },
  { key: 'strategic',      label: '🎯 Strategic Patterns' },
  { key: 'bonfire',        label: '🔥 Bonfire' },
  { key: 'government',     label: '🏛 Government' },
  { key: 'talent',         label: '👥 Talent' },
  { key: 'private-sector', label: '🧠 News' },
  { key: 'freelance',      label: '💼 Freelance' },
  { key: 'capital',        label: '💰 Capital' },
  { key: 'research',       label: '🔬 Research' },
];

// Mirrors backend SORT_OPTIONS in myOpportunities.service.
const SORT_OPTIONS = [
  { key: 'priority', label: 'Score (high to low)' },
  { key: 'newest',   label: 'Newest added first' },
  { key: 'oldest',   label: 'Oldest added first' },
];

function fmtUSD(n) {
  if (n == null || n === 0) return '—';
  const v = Number(n);
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

// Big badge = priorityScore (the actual sort key). Smaller "fit" suffix
// shows the profile-match score so Ali still sees both signals without
// the visual confusion that came from showing fit alone (which doesn't
// drive sort and made the list look unsorted).
function ScoreBadge({ priority, fit }) {
  const p = Number(priority) || 0;
  let bg = 'bg-gray-100 text-gray-700';
  if (p >= 80) bg = 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  else if (p >= 60) bg = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
  else if (p >= 40) bg = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
  return (
    <span
      className={`inline-flex items-baseline gap-1 px-2 py-0.5 rounded text-xs font-semibold ${bg}`}
      title={`priority ${p}, fit ${Number(fit) || 0}`}
    >
      <span>{p}</span>
      {fit != null && Number(fit) > 0 && (
        <span className="text-[10px] opacity-70 font-normal">/ fit {Number(fit)}</span>
      )}
    </span>
  );
}

function OppRow({ opp, onGenerated, onOpenDetail }) {
  useEffect(() => {
    // 'viewed' event — best-effort. Fires once per row mount.
    recordEvent(opp.id, 'viewed', { source: 'my_opportunities_list' });
  }, [opp.id]);

  return (
    <li
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3 hover:border-blue-300 transition"
      data-testid="my-opportunity-row"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <ScoreBadge priority={opp.priorityScore} fit={opp.fitScore} />
            {opp.context && opp.context.channel && (
              <ChannelChip channel={opp.context.channel} />
            )}
            <span className="text-xs text-gray-500 uppercase tracking-wide">{opp.type}</span>
            {opp.category && (
              <span className="text-xs text-gray-500">· {opp.category}</span>
            )}
            <span className="text-xs text-gray-500" data-testid="opportunity-value">· {fmtUSD(opp.value)}</span>
            {opp.createdAt && (
              <span
                className="text-xs text-gray-400"
                title={`Added to OIED ${new Date(opp.createdAt).toLocaleString()}`}
              >
                · added {new Date(opp.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenDetail(opp.id)}
            className="text-left font-semibold text-gray-900 dark:text-gray-100 mb-0.5 hover:text-blue-600 hover:underline cursor-pointer"
            data-testid="opp-row-title-btn"
          >
            {opp.title}
          </button>
          {opp.location && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{opp.location}</p>
          )}
          {opp.fitBreakdown && (
            <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-3">
              <span>service:{opp.fitBreakdown.service_match}/25</span>
              <span>revenue:{opp.fitBreakdown.revenue_weight}/20</span>
              <span>auto:{opp.fitBreakdown.automation_score}/15</span>
              <span>repeat:{opp.fitBreakdown.repeatability_score}/15</span>
              <span>ease:{opp.fitBreakdown.ease_of_entry}/10</span>
              <span>strat:{opp.fitBreakdown.strategic_alignment}/15</span>
            </div>
          )}
          <OpportunityActionButtons
            opportunityId={opp.id}
            oppType={opp.type}
            compact
            onGenerated={onGenerated}
            recommendedAction={opp.context && opp.context.recommended_action}
          />
        </div>
        {opp.sourceUrl && (
          <a
            href={opp.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm whitespace-nowrap"
          >
            Source ↗
          </a>
        )}
      </div>
    </li>
  );
}

// One of the priority sections at the top of the page (Act Now / High Value
// / Quick Wins). Collapses gracefully when it has zero matching rows so the
// admin doesn't see empty placeholders.
function BucketSection({ title, hint, rows, tone = 'blue', testId, onOpenDetail }) {
  if (!rows || rows.length === 0) return null;
  const toneMap = {
    red: 'border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/40 text-red-700 dark:text-red-300',
    green: 'border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-900/40 text-green-700 dark:text-green-300',
    amber: 'border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/40 text-amber-700 dark:text-amber-300',
    blue: 'border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-900/40 text-blue-700 dark:text-blue-300',
  };
  return (
    <section className="mb-6" data-testid={testId}>
      <div className={`px-3 py-2 mb-3 border rounded-md flex items-center justify-between ${toneMap[tone]}`}>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="text-xs opacity-80">{hint}</p>}
        </div>
        <span className="text-xs font-mono">{rows.length}</span>
      </div>
      <ul className="list-none p-0">
        {rows.slice(0, 8).map((opp) => <OppRow key={opp.id} opp={opp} onOpenDetail={onOpenDetail} />)}
      </ul>
    </section>
  );
}

// v9.8: per-channel breakdown shown above the priority list when a
// keyword search is active. Solves the "news matches buried 18 pages
// down" problem — every channel that has matches gets its own card with
// the top 5 rows so users can drill into a specific channel without
// paginating through a unified priority-sorted blob.
function ChannelBucketStrip({ buckets, qFromUrl, sortFromUrl, onOpenDetail }) {
  const order = ['private-sector', 'talent', 'government', 'bonfire', 'capital', 'freelance', 'research', 'strategic'];
  const orderedKeys = order.filter((k) => buckets && buckets[k] && buckets[k].rows && buckets[k].rows.length > 0);
  if (orderedKeys.length === 0) return null;
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">
        Breakdown by channel for &quot;{qFromUrl}&quot; — top {orderedKeys.length === 1 ? '5' : '5 per channel'}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {orderedKeys.map((key) => {
          const b = buckets[key];
          const linkParams = new URLSearchParams();
          linkParams.set('q', qFromUrl);
          linkParams.set('channel', key);
          if (sortFromUrl && sortFromUrl !== 'priority') linkParams.set('sort', sortFromUrl);
          return (
            <div
              key={key}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-col"
              data-testid={`channel-bucket-${key}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
                  {b.label}
                </span>
                <span className="text-[10px] text-gray-500 ml-2 shrink-0">
                  {b.total} match{b.total === 1 ? '' : 'es'}
                </span>
              </div>
              <ul className="space-y-1 flex-1 list-none p-0 m-0">
                {b.rows.map((r) => {
                  const emoji = emojiForTitle(r.title, '•');
                  return (
                    <li key={r.id} className="flex items-start gap-1.5">
                      <span aria-hidden="true" className="text-sm leading-snug shrink-0 mt-px">
                        {emoji}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenDetail(r.id)}
                        className="text-left flex-1 text-xs text-gray-800 dark:text-gray-100 hover:text-blue-700 dark:hover:text-blue-300 hover:underline line-clamp-2 leading-snug"
                        title={r.title}
                      >
                        {r.title}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {b.total > b.rows.length && (
                <a
                  href={`/admin/opportunities/my?${linkParams.toString()}`}
                  className="mt-2 text-[11px] text-blue-700 dark:text-blue-300 hover:underline self-end"
                >
                  View all {b.total} →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyOpportunitiesPage() {
  const { user } = useSelector((s) => s.auth);
  const [searchParams, setSearchParams] = useSearchParams();
  const channelFromUrl = searchParams.get('channel') || '';
  const sortFromUrl = searchParams.get('sort') || 'priority';
  const qFromUrl = searchParams.get('q') || '';
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [channelBuckets, setChannelBuckets] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [minScore, setMinScore] = useState('');
  const [detailOppId, setDetailOppId] = useState(null);

  // Always request ONE page at a time (pageSize rows). The backend
  // pulls a wider candidate pool internally for channel-filtered
  // queries, scores them, sorts, and returns only the page slice.
  // Bumping fetchSize on the client made the controller call
  // attachContextToOpportunity 500 times per request — 1000 parallel
  // DB lookups, blew past nginx 60s timeout on every channel filter.
  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = { limit: pageSize, offset: (page - 1) * pageSize };
      if (minScore) params.minScore = minScore;
      if (channelFromUrl) params.channel = channelFromUrl;
      if (sortFromUrl && sortFromUrl !== 'priority') params.sort = sortFromUrl;
      if (qFromUrl) params.q = qFromUrl;
      const res = await listMyOpportunities(params);
      setRows(res.data || []);
      setTotal(res.pagination?.total ?? (res.data || []).length);
      setChannelBuckets(res.pagination?.channelBuckets || null);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, minScore, channelFromUrl, sortFromUrl, qFromUrl]);

  useEffect(() => { load(); }, [load]);

  // Server now does the channel filtering, but keep a client-side guard
  // against any rows that might slip through (e.g. cross-channel mixing
  // when type maps to multiple channels in some future taxonomy update).
  const channelFiltered = useMemo(() => {
    if (!channelFromUrl) return rows;
    return rows.filter(
      (r) => (r.context && r.context.channel && r.context.channel.key) === channelFromUrl,
    );
  }, [rows, channelFromUrl]);

  function setChannel(key) {
    const next = {};
    if (key) next.channel = key;
    if (sortFromUrl && sortFromUrl !== 'priority') next.sort = sortFromUrl;
    setSearchParams(next);
    setPage(1);
  }
  function setSort(key) {
    const next = {};
    if (channelFromUrl) next.channel = channelFromUrl;
    if (key && key !== 'priority') next.sort = key;
    if (qFromUrl) next.q = qFromUrl;
    setSearchParams(next);
    setPage(1);
  }
  function submitSearch(value) {
    const next = {};
    if (channelFromUrl) next.channel = channelFromUrl;
    if (sortFromUrl && sortFromUrl !== 'priority') next.sort = sortFromUrl;
    if (value && String(value).trim()) next.q = String(value).trim();
    setSearchParams(next);
    setPage(1);
  }

  const displayRows = channelFiltered;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!user || user.role !== 'admin') {
    return (
      <div className="p-6 text-center text-gray-500">
        Admin access required.
      </div>
    );
  }

  // Group by bucket — OIED v2 surfaces "Act Now / High Value / Quick Wins"
  // sections at the top so admins triage the most important rows first.
  // v9.2 added strategic_pattern for synthesized Bonfire clusters: they
  // get their own strip so they don't crowd out high_value individuals.
  // Channel filter applies BEFORE bucket grouping.
  const grouped = {
    act_now:           displayRows.filter((r) => r.bucket === 'act_now'),
    high_value:        displayRows.filter((r) => r.bucket === 'high_value'),
    quick_win:         displayRows.filter((r) => r.bucket === 'quick_win'),
    strategic_pattern: displayRows.filter((r) => r.bucket === 'strategic_pattern'),
    standard:          displayRows.filter((r) => !r.bucket || r.bucket === 'standard'),
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            🎯 My Opportunities
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-medium">
              OIED
            </span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Active opportunities ≥ $1,000, scored against your business profile
            and ranked by priority. Top sections surface the rows that matter most;
            full list below.
          </p>
        </header>

        {/* Cross-channel keyword search box. Submitting sets ?q= and triggers
            the search across all channels (or scoped to the active channel). */}
        <form
          onSubmit={(e) => { e.preventDefault(); submitSearch(e.currentTarget.elements.q.value); }}
          className="flex items-center gap-2 mb-3"
          data-testid="my-opps-search-form"
        >
          <input
            type="search"
            name="q"
            defaultValue={qFromUrl}
            key={qFromUrl}
            placeholder="Search across all channels (industry, tool, topic)…"
            className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="my-opps-search-input"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            🔍 Search
          </button>
        </form>

        {/* Related AI Tools — shows when a keyword is active. Hidden silently
            when no tools match. */}
        {qFromUrl && <RelatedToolsRow q={qFromUrl} />}

        <div className="flex items-center gap-3 mb-4 text-sm flex-wrap">
          <label className="flex items-center gap-1.5">
            Channel:
            <select
              value={channelFromUrl}
              onChange={(e) => setChannel(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-1"
              data-testid="channel-filter"
            >
              {CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Sort:
            <select
              value={sortFromUrl}
              onChange={(e) => setSort(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-1"
              data-testid="sort-filter"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Min score:
            <input
              type="number"
              value={minScore}
              onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
              placeholder="0"
              min="0"
              max="100"
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-1 w-24"
              data-testid="min-score-input"
            />
          </label>
          <span className="text-gray-500" data-testid="total-count">
            {channelFromUrl
              ? `${displayRows.length} in this channel`
              : `${total} matching`}
          </span>
          {qFromUrl && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 text-xs">
              keyword: <strong>{qFromUrl}</strong>
              <button
                type="button"
                onClick={() => {
                  const next = {};
                  if (channelFromUrl) next.channel = channelFromUrl;
                  if (sortFromUrl && sortFromUrl !== 'priority') next.sort = sortFromUrl;
                  setSearchParams(next);
                  setPage(1);
                }}
                className="ml-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded px-1"
                title="Clear keyword filter"
                aria-label="Clear keyword filter"
              >
                ×
              </button>
            </span>
          )}
          <div className="flex-1" />
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Page {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"
          >
            Next →
          </button>
        </div>

        {err && (
          <div className="p-3 rounded bg-red-50 text-sm text-red-700 mb-3">{err}</div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : displayRows.length === 0 ? (
          <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border rounded">
            {channelFromUrl
              ? 'No opportunities in this channel match the current filters.'
              : 'No opportunities match the filters.'}
          </div>
        ) : (
          <>
            {/* v9.8 drill-down: sub-cloud of sub-topics co-occurring with
                the parent keyword. Click a sub-word → URL appends it. */}
            {qFromUrl && <KeywordDrillCloud q={qFromUrl} />}
            {/* Channel-bucket strip — only on keyword searches that are
                NOT already filtered to a single channel. */}
            {qFromUrl && !channelFromUrl && channelBuckets && (
              <ChannelBucketStrip
                buckets={channelBuckets}
                qFromUrl={qFromUrl}
                sortFromUrl={sortFromUrl}
                onOpenDetail={setDetailOppId}
              />
            )}
            {/* Hide priority-bucket strips on the keyword-search path — for
                a topic search the user wants every channel mixed in, not
                bucketed by act_now / high_value / etc. */}
            {sortFromUrl === 'priority' && !qFromUrl && (
              <>
            <BucketSection
              title="🔥 Act Now"
              tone="red"
              hint="Priority ≥ 80 or close date is days away."
              rows={grouped.act_now}
              testId="bucket-act-now"
              onOpenDetail={setDetailOppId}
            />
            <BucketSection
              title="💰 High Value"
              tone="green"
              hint="Revenue weight ≥ 16 (≥ $500k) and meaningful fit."
              rows={grouped.high_value}
              testId="bucket-high-value"
              onOpenDetail={setDetailOppId}
            />
            <BucketSection
              title="⚡ Quick Wins"
              tone="amber"
              hint="High ease + automation, closes within 30 days."
              rows={grouped.quick_win}
              testId="bucket-quick-wins"
              onOpenDetail={setDetailOppId}
            />
            <BucketSection
              title="🎯 Strategic Patterns"
              tone="blue"
              hint="Synthesized Bonfire clusters — productize across opps, not bid as one."
              rows={grouped.strategic_pattern}
              testId="bucket-strategic-pattern"
              onOpenDetail={setDetailOppId}
            />
              </>
            )}

            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mt-8 mb-2">
              {qFromUrl
                ? `Cross-channel results for "${qFromUrl}" (${displayRows.length})`
                : sortFromUrl === 'newest'
                  ? `Newest first (${displayRows.length})`
                  : sortFromUrl === 'oldest'
                    ? `Oldest first (${displayRows.length})`
                    : `All matching (${displayRows.length})`}
            </h2>
            <ul className="list-none p-0" data-testid="my-opportunities-list">
              {displayRows.map((opp) => <OppRow key={opp.id} opp={opp} onOpenDetail={setDetailOppId} />)}
            </ul>
          </>
        )}
        {detailOppId && (
          <OpportunityDetailModal
            opportunityId={detailOppId}
            onClose={() => setDetailOppId(null)}
          />
        )}
      </div>
    </div>
  );
}

export default MyOpportunitiesPage;
