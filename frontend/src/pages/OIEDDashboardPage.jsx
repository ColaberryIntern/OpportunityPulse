// OIED Dashboard — single-page mission control.
//
// Pulls top recommendations, revenue, velocity, and pending-outcome
// counts and lays them out as: Day Counters → Top 3 Next Moves →
// Pipeline Pulse → Quick Nav (Discover / Pursue / Operate).
//
// All data sources already exist; no new endpoints required.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  getRecommendations,
  getRevenueDashboard,
  getVelocity,
  listOutputs,
  getPendingOutcomes,
  getChannelsSummary,
} from '../services/oiedService';
import ChannelOverview from '../components/oied/ChannelOverview';
import ChannelChip from '../components/oied/ChannelChip';
import KeywordCloud from '../components/oied/KeywordCloud';
import StrategicDiscoveryPanel from '../components/oied/StrategicDiscoveryPanel';
// Round-3 merge: bring the legacy /dashboard widgets into Mission
// Control so this is the single landing page Ali asked for.
import BriefHeroBanner from '../components/dashboard/BriefHeroBanner';
import ForYouSection from '../components/dashboard/ForYouSection';
import OpportunityChart from '../components/dashboard/OpportunityChart';
import TrendCard from '../components/dashboard/TrendCard';
import AiToolTrendingWidget from '../components/aiTools/AiToolTrendingWidget';
import ToolMomentumBoard from '../components/dashboard/ToolMomentumBoard';
import dashboardService from '../services/dashboardService';
import { fetchExecutiveBrief } from '../store/slices/actionEngineSlice';

function fmtUSD(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function fmtDays(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Math.round(Number(n) * 10) / 10 + 'd';
}

function modeBadge(mode) {
  if (mode === 'partner_required') return { text: 'Partner', cls: 'bg-purple-100 text-purple-800' };
  if (mode === 'direct_submit')    return { text: 'Direct',  cls: 'bg-green-100 text-green-800' };
  if (mode === 'ignore')           return { text: 'Skip',    cls: 'bg-gray-100 text-gray-800' };
  return null;
}

function CounterCard({ count, label, helper, to, color = 'navy' }) {
  const colorClass = {
    navy:   'border-blue-700 text-blue-700',
    amber:  'border-amber-600 text-amber-700',
    green:  'border-green-600 text-green-700',
    purple: 'border-purple-700 text-purple-700',
  }[color] || 'border-blue-700 text-blue-700';
  return (
    <Link
      to={to}
      className={`block bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 ${colorClass} p-5 hover:shadow-md transition`}
      data-testid={`oied-counter-${label.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <div className={`text-4xl font-bold ${colorClass.split(' ')[1]}`}>{count}</div>
      <div className="text-base font-semibold mt-1 text-gray-900 dark:text-gray-100">{label}</div>
      {helper && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{helper}</div>}
    </Link>
  );
}

function QuickNavTile({ to, label, sub, kpi }) {
  return (
    <Link
      to={to}
      className="block px-4 py-3 rounded-md border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-700/40 transition"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-gray-900 dark:text-gray-100">{label}</div>
        {kpi != null && kpi !== '' && (
          <span className="text-base font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">
            {kpi}
          </span>
        )}
      </div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</div>}
    </Link>
  );
}

// Live-computed Market Trends block for Bonfire + Strategic Patterns.
// The legacy TrendCard reads from AnalysisRun (a background trend-detection
// cron). Bonfire/Strategic don't have that pipeline yet, so cards render
// empty. This block uses the live channel summary instead.
function ChannelTrendBlock({ channel }) {
  if (!channel) return null;
  const fmtUSD = (v) => {
    if (v == null) return '—';
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B';
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'k';
    return '$' + n;
  };
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {channel.icon} {channel.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Active</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{channel.active_count}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Total value</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtUSD(channel.total_value)}</div>
        </div>
      </div>
      {channel.top_opp && (
        <div className="text-xs text-gray-600 dark:text-gray-400 truncate" title={channel.top_opp.title}>
          Top: {channel.top_opp.title}
        </div>
      )}
      <Link
        to={`/admin/opportunities/my?channel=${encodeURIComponent(channel.key)}`}
        className="text-xs text-blue-600 hover:underline mt-2 inline-block"
      >
        View {channel.label} →
      </Link>
    </div>
  );
}

function NextMoveRow({ rec }) {
  const oid = rec.opportunity_id;
  const ctx = rec.context || {};
  const action = ctx.recommended_action;
  const mode = ctx.execution_mode;
  const badge = modeBadge(mode);
  const actionLabel = {
    generate_proposal: 'Generate proposal',
    review_draft: 'Review draft',
    mark_submitted: 'Mark submitted',
    await_response: 'Awaiting response',
    mark_outcome: 'Log outcome',
    archive_won: 'Archive — won',
    archive_lost: 'Archive — lost',
    skip: 'Skip',
    monitor: 'Monitor',
    find_partner: 'Find partner',
    send_outreach: 'Send outreach',
  }[action] || action || '—';

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex-1 min-w-0">
        <Link
          to={`/admin/opportunities/${oid}`}
          className="block font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 truncate"
        >
          {rec.title || `Opportunity ${oid}`}
        </Link>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
          {ctx.channel && <ChannelChip channel={ctx.channel} />}
          <span>{actionLabel}</span>
          {badge && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>
              {badge.text}
            </span>
          )}
          <span>·</span>
          <span>{fmtUSD(rec.expected_value || ctx.value)} expected</span>
          <span>·</span>
          <span>{fmtUSD(ctx.roi_per_hour)}/hr ROI</span>
        </div>
        {ctx.reason && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{ctx.reason}</div>
        )}
      </div>
      <Link
        to={`/admin/opportunities/${oid}`}
        className="px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 whitespace-nowrap"
      >
        Open →
      </Link>
    </div>
  );
}

export default function OIEDDashboardPage() {
  const [recommendations, setRecommendations] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [velocity, setVelocity] = useState(null);
  const [draftCount, setDraftCount] = useState(0);
  const [pendingOutcomeCount, setPendingOutcomeCount] = useState(0);
  const [partnerOpps, setPartnerOpps] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  // Round-3 merge: legacy dashboard data sources.
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState('30d');
  const [trends, setTrends] = useState(null);
  const [channelsSummary, setChannelsSummary] = useState([]);

  // Executive brief — drives the BriefHeroBanner at the top of the page.
  const dispatch = useDispatch();
  const executiveBrief = useSelector((s) => s.actionEngine && s.actionEngine.executiveBrief);
  const briefLoading   = useSelector((s) => s.actionEngine && s.actionEngine.briefLoading);
  useEffect(() => {
    if (dispatch && fetchExecutiveBrief) dispatch(fetchExecutiveBrief());
  }, [dispatch]);

  // Channel summary — used both for the Channel Overview cards and to
  // power the per-channel KPI numbers in Quick Navigation.
  useEffect(() => {
    let cancelled = false;
    getChannelsSummary()
      .then((data) => { if (!cancelled) setChannelsSummary(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setChannelsSummary([]); });
    return () => { cancelled = true; };
  }, []);

  const loadChart = useCallback(async (period) => {
    setChartLoading(true);
    try {
      const res = await dashboardService.getChartData({ period });
      setChartData(res?.data?.data?.chartData || null);
    } catch {
      setChartData(null);
    } finally {
      setChartLoading(false);
    }
  }, []);

  useEffect(() => { loadChart(chartPeriod); }, [chartPeriod, loadChart]);

  useEffect(() => {
    let cancelled = false;
    dashboardService.getTrendSummary()
      .then((r) => { if (!cancelled) setTrends((r?.data?.data?.trends) || null); })
      .catch(() => { if (!cancelled) setTrends(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // Top 10 recommendations: drives both the "next moves" list and
        // the partner-required pre-draft counter (counted client-side).
        const [recs, rev, vel, drafts, pending] = await Promise.all([
          getRecommendations(10).catch(() => []),
          getRevenueDashboard().catch(() => null),
          getVelocity().catch(() => null),
          listOutputs({ status: 'draft', limit: 100 }).catch(() => ({ data: [] })),
          getPendingOutcomes().catch(() => ({ pending: [] })),
        ]);
        if (cancelled) return;
        setRecommendations(Array.isArray(recs) ? recs : []);
        setRevenue(rev);
        setVelocity(vel);
        const draftRows = (drafts && (drafts.data || drafts)) || [];
        setDraftCount(Array.isArray(draftRows) ? draftRows.length : 0);
        const pendingRows = (pending && pending.pending) || [];
        setPendingOutcomeCount(Array.isArray(pendingRows) ? pendingRows.length : 0);
        // Count partner-required pre-draft opps (find_partner | send_outreach).
        const partnerCount = (Array.isArray(recs) ? recs : []).filter((r) => {
          const a = r.context && r.context.recommended_action;
          return a === 'find_partner' || a === 'send_outreach';
        }).length;
        setPartnerOpps(partnerCount);
      } catch (e) {
        if (!cancelled) setErr(e.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const top3 = (recommendations || []).slice(0, 3);
  const responseMedian = velocity && velocity.response && velocity.response.median_days;

  // Resolve a channel summary entry by key (used to build per-channel KPIs).
  const ch = (key) => (channelsSummary || []).find((c) => c.key === key) || {};
  const bonfireCh = ch('bonfire');
  const strategicCh = ch('strategic');
  const govCh = ch('government');
  const talentCh = ch('talent');
  const psCh = ch('private-sector');
  const flCh = ch('freelance');
  const capCh = ch('capital');

  // KPI bag for Quick Nav tiles. Falls back to '—' when data not loaded.
  const fmt = (n) => (n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString());
  const fmtUSDShort = (v) => {
    if (v == null) return '—';
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'k';
    return '$' + n;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">OIED Mission Control</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Today's actions, pipeline health, and one-click navigation. All data live from prod.
        </p>
      </div>

      {/* TOP — Multi-source keyword cloud (news + categories + tools + cross-channel titles) */}
      <KeywordCloud />

      {/* Strategic Intelligence Overlay — discovery panel sits directly below the cloud */}
      <StrategicDiscoveryPanel />

      {/* TOP — Executive brief banner (from legacy /dashboard) */}
      <BriefHeroBanner brief={executiveBrief} loading={briefLoading} />

      {/* TOP — AI matches across channels (talent, gov, bonfire, strategic, etc.) */}
      <section className="mb-8">
        <ForYouSection />
      </section>

      {err && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {err}
        </div>
      )}

      {/* DAY COUNTERS */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Your day
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <CounterCard
          count={loading ? '…' : draftCount}
          label="Drafts to review"
          helper="Awaiting your approval in Review Queue"
          to="/admin/opportunities/review"
          color="amber"
        />
        <CounterCard
          count={loading ? '…' : partnerOpps}
          label="Partner outreach pending"
          helper="Pre-draft opps where Colaberry teams (not primes)"
          to="/admin/opportunities/recommendations"
          color="purple"
        />
        <CounterCard
          count={loading ? '…' : pendingOutcomeCount}
          label="Outcomes to log"
          helper="Submitted / responded but no win/loss recorded"
          to="/admin/opportunities/my"
          color="green"
        />
      </div>

      {/* TOP 3 NEXT MOVES */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Top 3 next moves
      </h2>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-2 mb-8">
        {loading && <div className="p-4 text-gray-500 text-sm">Loading recommendations…</div>}
        {!loading && top3.length === 0 && (
          <div className="p-4 text-gray-500 text-sm">No recommendations available right now.</div>
        )}
        {!loading && top3.map((rec) => (
          <NextMoveRow key={rec.opportunity_id} rec={rec} />
        ))}
        {!loading && top3.length > 0 && (
          <div className="px-3 pt-2 text-right">
            <Link
              to="/admin/opportunities/recommendations"
              className="text-xs text-blue-600 hover:underline"
            >
              View all top actions →
            </Link>
          </div>
        )}
      </div>

      {/* PIPELINE PULSE */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Pipeline pulse
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Link
          to="/admin/revenue"
          className="block bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition"
          data-testid="oied-pulse-pipeline-value"
        >
          <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Pipeline value
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {loading ? '…' : fmtUSD(revenue && revenue.pipeline_value)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Σ value of opps with a draft output
          </div>
        </Link>
        <Link
          to="/admin/revenue"
          className="block bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition"
          data-testid="oied-pulse-velocity"
        >
          <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Velocity (median submit→response)
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {loading ? '…' : fmtDays(responseMedian)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            How long buyers take to acknowledge after we submit
          </div>
        </Link>
      </div>

      {/* CHANNEL OVERVIEW */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Channels
      </h2>
      <div className="mb-8">
        <ChannelOverview />
      </div>

      {/* OPPORTUNITY TRENDS CHART */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Opportunity Trends
      </h2>
      <div className="mb-8">
        <OpportunityChart
          chartData={chartData}
          loading={chartLoading}
          onPeriodChange={setChartPeriod}
        />
      </div>

      {/* AI TOOLS / MOMENTUM */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Trending tools &amp; momentum
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <AiToolTrendingWidget />
        <ToolMomentumBoard />
      </div>

      {/* MARKET TRENDS */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Market Trends
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <TrendCard type="gov_contract" trendData={trends?.gov_contract} />
        <TrendCard type="ai_job"       trendData={trends?.ai_job} />
        <TrendCard type="investment"   trendData={trends?.investment} />
        <TrendCard type="grant"        trendData={trends?.grant} />
        <TrendCard type="ai_news"      trendData={trends?.ai_news} />
        <TrendCard type="freelance"    trendData={trends?.freelance} />
        <ChannelTrendBlock channel={bonfireCh.key ? bonfireCh : null} />
        <ChannelTrendBlock channel={strategicCh.key ? strategicCh : null} />
      </div>

      {/* QUICK NAV */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        Quick navigation
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Discover</h3>
          <div className="space-y-2">
            <QuickNavTile
              to="/admin/opportunities/my"
              label="My Opportunities"
              sub="Personalized scored list across all channels"
              kpi={fmt((channelsSummary || []).reduce((s, c) => s + (c.active_count || 0), 0))}
            />
            <QuickNavTile
              to="/admin/opportunities/recommendations"
              label="Top Actions"
              sub="Today's highest-ROI moves"
              kpi={fmt(top3.length)}
            />
            <QuickNavTile
              to="/admin/opportunities/bundles"
              label="Bundles"
              sub="Grouped opportunities → reusable products"
            />
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Pursue</h3>
          <div className="space-y-2">
            <QuickNavTile
              to="/admin/opportunities/review"
              label="Review Queue"
              sub="Approve / edit drafts"
              kpi={loading ? '…' : fmt(draftCount)}
            />
            <QuickNavTile
              to="/admin/opportunities/execution"
              label="Execution Queue"
              sub="Drafts ready to ship, by ROI/hr"
              kpi={loading ? '…' : fmt(draftCount)}
            />
            <QuickNavTile
              to="/admin/briefing"
              label="Daily Briefing"
              sub="Composed summary, emailable"
            />
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-2">Operate</h3>
          <div className="space-y-2">
            <QuickNavTile
              to="/admin/revenue"
              label="Revenue Dashboard"
              sub="Pipeline value · win-rate · velocity"
              kpi={fmtUSDShort(revenue && revenue.pipeline_value)}
            />
            <QuickNavTile
              to="/admin/triggers"
              label="Trigger Logs"
              sub="Scheduled engine runs"
            />
            <QuickNavTile
              to="/admin/profile"
              label="Business Profile"
              sub="Services, industries, past wins"
            />
          </div>
        </div>
      </div>

      {/* PER-CHANNEL KPI GRID — quick scan of how each area is doing */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mt-8 mb-3">
        Channel KPIs at a glance
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        {[
          { c: strategicCh, label: 'Strategic' },
          { c: bonfireCh,   label: 'Bonfire' },
          { c: govCh,       label: 'Government' },
          { c: talentCh,    label: 'Talent' },
          { c: psCh,        label: 'News' },
          { c: flCh,        label: 'Freelance' },
          { c: capCh,       label: 'Capital' },
        ].map((row, i) => (
          <Link
            key={i}
            to={row.c.key ? `/admin/opportunities/my?channel=${encodeURIComponent(row.c.key)}` : '/admin/opportunities/my'}
            className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md p-3 hover:border-blue-500 transition"
          >
            <div className="text-xs text-gray-500 dark:text-gray-400">{row.c.icon || ''} {row.label}</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">{fmt(row.c.active_count || 0)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{fmtUSDShort(row.c.total_value || 0)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
