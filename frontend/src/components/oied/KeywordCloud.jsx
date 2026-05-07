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

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getKeywordCloud } from '../../services/oiedService';

// Continuous color from a [-1, +1] sentiment score, with dramatic
// separation between bands so weak vs strong is unmistakable at a glance.
//
//   score | swatch
//   -1.0  | bright red       hsl(  0, 95%, 46%)
//   -0.5  | orange-red       hsl( 35, 82%, 42%)
//    0.0  | mustard / olive  hsl( 70, 70%, 38%)
//   +0.5  | deep green       hsl(105, 82%, 28%)
//   +1.0  | forest green     hsl(140, 95%, 24%)
//
// Hue spans 0→140 (red through forest green). Lightness shifts WITH the
// score so positives are visibly darker/richer than neutrals (and
// neutrals are mid-tone, not blending into the page). Saturation is
// always high so colors read crisply.
function colorForSentiment(score) {
  const s = Math.max(-1, Math.min(1, Number(score) || 0));
  const hue = Math.round(70 + 70 * s);
  const sat = Math.round(70 + Math.abs(s) * 25);
  // Positives darken (24–32%); negatives lighten (38–46%) — opposite
  // ends of the lightness scale to maximize visual separation.
  const light = s > 0
    ? Math.round(32 - 8 * s)
    : Math.round(38 + 8 * Math.abs(s));
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { max: 50 };
    if (industriesOnly) params.industries_only = true;
    getKeywordCloud(params)
      .then((d) => { if (!cancelled) setData(d || { words: [] }); })
      .catch((e) => { if (!cancelled) setErr(e.message || 'Failed to load keyword cloud'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [industriesOnly]);

  const words = data.words || [];
  const maxCount = words.reduce((m, w) => Math.max(m, w.count || 0), 0);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5 mb-8">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          🔭 What's hot — across every channel
        </h3>
        <div className="flex items-center gap-3">
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
        Size = how often it appears · Color = sentiment gradient (
        <span style={{ color: colorForSentiment(-0.7) }}>strongly negative</span>
        ,{' '}
        <span style={{ color: colorForSentiment(-0.2) }}>negative</span>
        ,{' '}
        <span style={{ color: colorForSentiment(0) }}>neutral</span>
        ,{' '}
        <span style={{ color: colorForSentiment(0.2) }}>positive</span>
        ,{' '}
        <span style={{ color: colorForSentiment(0.7) }}>strongly positive</span>
        ) · Tilt = age (level = today, more rotated = older) · Click any word to see every channel
        match for it.
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
            const color = colorForSentiment(w.sentiment_score);
            const fontSize = countToFontSize(w.count, maxCount);
            const tilt = ageToTilt(w.avg_age_days, i);
            const channelHint = ChannelAttributionTooltip({ channels: w.channels });
            const matchPart = w.match_count != null
              ? ` · ${w.match_count} opp matches${w.tool_count ? ` + ${w.tool_count} tools` : ''}`
              : '';
            const tooltip = `"${w.word}" — ${w.count} mentions${matchPart}` +
              ` · age ${w.avg_age_days}d` +
              ` · sentiment ${w.sentiment_score} (${w.sentiment_label})` +
              (channelHint ? ` · channels: ${channelHint}` : '');
            const label = w.display_word || w.word;
            return (
              <Link
                key={w.word}
                to={`/admin/opportunities/my?q=${encodeURIComponent(w.word)}`}
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
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
