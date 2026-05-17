// Multi-source keyword cloud (news + opp categories + cross-channel
// titles + tool names). Successor to NewsWordCloud.
//
// Per Ali's spec for round-3.6:
//   size  = mention count across all sources
//   color = HSL gradient on continuous sentiment score (-1.0..+1.0)
//           red ↔ yellow ↔ green, with saturation reflecting strength
//   tilt  = age (most-recent = horizontal; older articles tilt more)
//   click = navigate to /admin/opportunities/my?q=<word>
//           cross-channel search (no channel filter — show every match)
//
// Strategic Intelligence Overlay (additive):
//   - mode selector reorders the cloud by strategic axis
//   - tooltip includes strategic + commercialization + procurement scores
//   - click on a strategic-priority keyword offers "Run Deep Research"

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getKeywordCloud } from '../../services/oiedService';

// Strategic modes — keep labels human-readable, values match backend
// STRATEGIC_MODE_SORT keys exactly.
const STRATEGIC_MODES = [
  { value: 'market_heat',           label: 'Market Heat (frequency)' },
  { value: 'strategic',             label: 'Strategic Composite' },
  { value: 'procurement',           label: 'Procurement' },
  { value: 'venture_discovery',     label: 'Venture Discovery' },
  { value: 'operational_pain',      label: 'Operational Pain' },
  { value: 'modernization',         label: 'Modernization' },
  { value: 'ai_infrastructure',     label: 'AI Infrastructure' },
  { value: 'emerging_research',     label: 'Emerging Research' },
  { value: 'commercialization',     label: 'Commercialization' },
  { value: 'regulated_industries',  label: 'Regulated Industries' },
  { value: 'workforce_pressure',    label: 'Workforce Pressure' },
  { value: 'convergence',           label: 'Cross-Channel Convergence' },
];

const PRIORITY_BADGE = {
  critical: { bg: '#fef2f2', fg: '#991b1b', label: 'critical' },
  high:     { bg: '#fff7ed', fg: '#9a3412', label: 'high' },
  standard: { bg: '#f3f4f6', fg: '#374151', label: 'standard' },
  low:      { bg: '#f9fafb', fg: '#6b7280', label: 'low' },
};

const STAGE_LABEL = {
  unknown: 'unknown',
  research_only: 'research-only',
  early_signal: 'early signal',
  commercializing: 'commercializing',
  production_ready: 'production-ready',
  mainstream: 'mainstream',
};

// v9.8: pure red→green gradient. Hue 0 (red) → 120 (green). No olive
// midpoint. Gray for words with no sentiment-bearing source so users
// can see at a glance which words are "uninformative" vs "neutral but
// known." Lightness shifts with magnitude so strong opinions read
// darker/richer than weak ones.
//
//   isKnown=false  → hsl(0, 0%, 60%)   gray
//   score = -1.0   → hsl(0, 80%, 38%)  bright red
//   score = -0.5   → hsl(0, 70%, 46%)  red
//   score =  0.0   → hsl(60, 65%, 42%) gold (between red and green)
//   score = +0.5   → hsl(120, 70%, 32%) green
//   score = +1.0   → hsl(120, 80%, 26%) deep green
function colorForSentiment(score, isKnown = true) {
  if (!isKnown) return 'hsl(0, 0%, 60%)';
  const s = Math.max(-1, Math.min(1, Number(score) || 0));
  // Linear hue from 0 (red) at -1 through 60 (gold) at 0 to 120 (green) at +1.
  const hue = Math.round(60 + 60 * s);
  // Saturation grows with |s| so weak signals look softer.
  const sat = Math.round(55 + Math.abs(s) * 30);
  // Strong polarity = darker; near-neutral = a touch lighter.
  const light = Math.round(46 - Math.abs(s) * 14);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// Age → rotation angle. Maxes at ±25deg for very old articles. Direction
// alternates so the cloud doesn't all lean one way.
function ageToTilt(days, idx) {
  const d = Number(days) || 0;
  const sign = idx % 2 === 0 ? 1 : -1;
  if (d <= 1) return 0;
  if (d <= 3) return sign * 4;
  if (d <= 7) return sign * 9;
  if (d <= 14) return sign * 16;
  return sign * 25;
}

// Count → font-size. Range 14 → 40 px.
function countToFontSize(count, maxCount) {
  if (!maxCount || count <= 0) return 14;
  const ratio = Math.min(1, count / maxCount);
  return Math.round(14 + ratio * 26);
}

function ChannelAttributionTooltip({ channels }) {
  if (!Array.isArray(channels) || channels.length === 0) return '';
  return channels
    .slice(0, 5)
    .map((c) => `${c.key} ${c.count}`)
    .join(', ');
}

export default function KeywordCloud() {
  const [data, setData] = useState({ words: [], article_count: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [industriesOnly, setIndustriesOnly] = useState(false);
  const [mode, setMode] = useState('market_heat');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { max: 50 };
    if (industriesOnly) params.industries_only = true;
    if (mode && mode !== 'market_heat') params.mode = mode;
    getKeywordCloud(params)
      .then((d) => { if (!cancelled) setData(d || { words: [] }); })
      .catch((e) => { if (!cancelled) setErr(e.message || 'Failed to load keyword cloud'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [industriesOnly, mode]);

  const words = data.words || [];
  // In strategic modes, the score-axis drives font size; in market_heat
  // the legacy frequency count drives it. This is the key user-visible
  // behavior change when switching modes.
  function sizingValueFor(w) {
    if (mode === 'market_heat') return w.count || 0;
    if (mode === 'strategic' || mode === 'convergence' || mode === 'venture_discovery') {
      return w.strategic_score || w.count || 0;
    }
    const m = {
      procurement: 'procurement_score',
      operational_pain: 'operational_pain_score',
      modernization: 'modernization_score',
      emerging_research: 'research_velocity_score',
      commercialization: 'commercialization_score',
      ai_infrastructure: 'strategic_score',
      regulated_industries: 'strategic_score',
      workforce_pressure: 'strategic_score',
    };
    return w[m[mode]] || w.count || 0;
  }
  const maxCount = words.reduce((m, w) => Math.max(m, sizingValueFor(w)), 0);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5 mb-8">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          🔭 What's hot — across every channel
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-gray-600 dark:text-gray-300 inline-flex items-center gap-1 cursor-pointer">
            Mode:
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="text-xs border border-gray-200 rounded px-1 py-0.5 dark:bg-gray-700 dark:text-gray-100"
              data-testid="keyword-cloud-mode-selector"
            >
              {STRATEGIC_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300 inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={industriesOnly}
              onChange={(e) => setIndustriesOnly(e.target.checked)}
              className="h-3 w-3"
            />
            Industries only
          </label>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {data.source === 'keyword_trends' && data.last_computed_at
              ? `validated · updated ${new Date(data.last_computed_at).toLocaleString()}`
              : data.article_count
                ? `${data.article_count.toLocaleString()} articles · ${data.lookback_days || 14}d`
                : ''}
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Pulled from news titles, industry categories, AI tools, and titles across all 7 channels.
        Size = how often it appears · Color = sentiment from news mentions: (
        <span style={{ color: colorForSentiment(-1, true) }}>strongly negative</span>
        ,{' '}
        <span style={{ color: colorForSentiment(-0.4, true) }}>negative</span>
        ,{' '}
        <span style={{ color: colorForSentiment(0.4, true) }}>positive</span>
        ,{' '}
        <span style={{ color: colorForSentiment(1, true) }}>strongly positive</span>
        ,{' '}
        <span style={{ color: colorForSentiment(0, false) }}>no news signal</span>
        ) · Tilt = age (level = today, more rotated = older) · Click any word to drill into every
        channel match.
      </p>

      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 p-3">Loading keyword cloud…</div>
      ) : err ? (
        <div className="text-sm text-red-700 bg-red-50 p-3 rounded">{err}</div>
      ) : words.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 p-3">
          No recent activity to summarize. Wait for the ingesters to populate.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 leading-tight">
          {words.map((w, i) => {
            const known = w.sentiment_known !== false && w.sentiment_label !== 'unknown';
            const color = colorForSentiment(w.sentiment_score, known);
            const fontSize = countToFontSize(sizingValueFor(w), maxCount);
            const tilt = ageToTilt(w.avg_age_days, i);
            const channelHint = ChannelAttributionTooltip({ channels: w.channels });
            const matchPart = w.match_count != null
              ? ` · ${w.match_count} opp matches${w.tool_count ? ` + ${w.tool_count} tools` : ''}`
              : '';
            const tagsPart = Array.isArray(w.strategic_tags) && w.strategic_tags.length > 0
              ? ` · tags: ${w.strategic_tags.slice(0, 4).join(', ')}`
              : '';
            const stratPart = (w.strategic_score != null && w.strategic_score > 0)
              ? `\n[strategic ${w.strategic_score}/100 · ${w.strategic_priority || 'standard'}`
                + ` · stage ${STAGE_LABEL[w.commercialization_stage] || w.commercialization_stage}`
                + ` · proc ${w.procurement_score || 0} · pain ${w.operational_pain_score || 0}`
                + ` · mod ${w.modernization_score || 0} · comm ${w.commercialization_score || 0}`
                + ` · conv ${w.convergence_score || 0} · venture ${w.venture_score || 0}`
                + ` · research ${w.research_velocity_score || 0}]`
              : '';
            const tooltip = `"${w.word}" — ${w.count} mentions${matchPart}` +
              ` · age ${w.avg_age_days}d` +
              ` · sentiment ${w.sentiment_score} (${w.sentiment_label})` +
              (channelHint ? ` · channels: ${channelHint}` : '') +
              tagsPart + stratPart;
            const label = w.display_word || w.word;
            const priority = PRIORITY_BADGE[w.strategic_priority] || null;
            const isElevated = w.strategic_priority === 'critical' || w.strategic_priority === 'high';
            // When the user is in a strategic mode AND the word ranks high, the click goes to a Deep Research run
            // seeded with the strategic context. Otherwise legacy click → My Opportunities search.
            const deepResearchTarget = isElevated && mode !== 'market_heat'
              ? `/admin/deep-research?seed=${encodeURIComponent(w.word)}`
              + `&origin=keyword_cloud&mode=${encodeURIComponent(mode)}`
              + `&tags=${encodeURIComponent((w.strategic_tags || []).join(','))}`
              + `&stage=${encodeURIComponent(w.commercialization_stage || 'unknown')}`
              + `&strategic_score=${w.strategic_score || 0}`
              : null;
            const linkTo = deepResearchTarget
              || `/admin/opportunities/my?q=${encodeURIComponent(w.word)}`;
            return (
              <span key={w.word} className="inline-flex items-baseline">
                <Link
                  to={linkTo}
                  title={tooltip}
                  className="inline-block hover:underline transition-all"
                  style={{
                    color,
                    fontSize: `${fontSize}px`,
                    fontWeight: fontSize >= 24 ? 700 : 600,
                    transform: `rotate(${tilt}deg)`,
                    padding: '0 2px',
                    whiteSpace: 'nowrap',
                  }}
                  data-strategic-priority={w.strategic_priority || 'standard'}
                  data-strategic-score={w.strategic_score || 0}
                >
                  {label}
                </Link>
                {priority && (w.strategic_priority === 'critical' || w.strategic_priority === 'high') && (
                  <span
                    className="ml-1 align-baseline rounded px-1 py-px text-[9px] uppercase font-semibold"
                    style={{ background: priority.bg, color: priority.fg }}
                    title={`Strategic priority: ${priority.label}`}
                  >
                    {priority.label}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
