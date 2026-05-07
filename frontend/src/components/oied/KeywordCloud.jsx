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

// Continuous color from a [-1, +1] sentiment score.
// Hue:  0 (red) → 60 (yellow) → 120 (green)
// Sat:  20% (gray, neutral) → 90% (vivid, strong sentiment)
// Light: fixed at 35% so text reads well on a white background.
function colorForSentiment(score) {
  const s = Math.max(-1, Math.min(1, Number(score) || 0));
  const hue = Math.round(60 + 60 * s);
  const sat = Math.round(20 + Math.abs(s) * 70);
  return `hsl(${hue}, ${sat}%, 35%)`;
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getKeywordCloud({ max: 50 })
      .then((d) => { if (!cancelled) setData(d || { words: [] }); })
      .catch((e) => { if (!cancelled) setErr(e.message || 'Failed to load keyword cloud'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const words = data.words || [];
  const maxCount = words.reduce((m, w) => Math.max(m, w.count || 0), 0);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5 mb-8">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          🔭 What's hot — across every channel
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {data.article_count
            ? `${data.article_count.toLocaleString()} articles · ${data.lookback_days || 14}d`
            : ''}
        </span>
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
            const tooltip = `"${w.word}" — ${w.count} mentions · age ${w.avg_age_days}d ` +
              `· sentiment ${w.sentiment_score} (${w.sentiment_label})` +
              (channelHint ? ` · channels: ${channelHint}` : '');
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
                {w.word}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
