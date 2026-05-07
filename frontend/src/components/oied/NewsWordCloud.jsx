// News Word Cloud — what's hot in the AI/private-sector news stream.
//
// Per Ali's spec for round-3.5:
//   size  = how many articles mention the word (count)
//   color = sentiment (green positive / red negative / gray neutral)
//   tilt  = age (most-recent = horizontal; older articles tilt more)
//   click = navigate to /admin/opportunities/my?channel=private-sector&q=<word>
//          so Ali can read every article that mentioned the keyword.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNewsWordCloud } from '../../services/oiedService';

const SENTIMENT_COLOR = {
  positive: '#16a34a', // green-600
  negative: '#dc2626', // red-600
  neutral:  '#475569', // slate-600
};

// Age → rotation angle. Maxes out at ±25deg for very old.
function ageToTilt(days, idx) {
  const d = Number(days) || 0;
  const sign = idx % 2 === 0 ? 1 : -1; // alternate direction so the cloud doesn't all lean one way
  if (d <= 1) return 0;
  if (d <= 3) return sign * 4;
  if (d <= 7) return sign * 9;
  if (d <= 14) return sign * 16;
  return sign * 25;
}

// Count → font size (px). Range 12 → 38.
function countToFontSize(count, maxCount) {
  if (!maxCount || count <= 0) return 14;
  const ratio = Math.min(1, count / maxCount);
  return Math.round(14 + ratio * 26); // 14 to 40
}

export default function NewsWordCloud() {
  const [data, setData] = useState({ words: [], article_count: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getNewsWordCloud({ max: 40 })
      .then((d) => { if (!cancelled) setData(d || { words: [] }); })
      .catch((e) => { if (!cancelled) setErr(e.message || 'Failed to load word cloud'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const words = data.words || [];
  const maxCount = words.reduce((m, w) => Math.max(m, w.count || 0), 0);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-5 mb-8">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          📰 News word cloud
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {data.article_count
            ? `${data.article_count} articles · last ${data.lookback_days || 14}d`
            : ''}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Size = how often it's mentioned · Color = sentiment (
        <span style={{ color: SENTIMENT_COLOR.positive }}>green positive</span>
        ,{' '}
        <span style={{ color: SENTIMENT_COLOR.negative }}>red negative</span>
        ,{' '}
        <span style={{ color: SENTIMENT_COLOR.neutral }}>gray neutral</span>
        ) · Tilt = age (level = today, more rotated = older) · Click a word to
        see every article that mentions it.
      </p>

      {loading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 p-3">Loading word cloud…</div>
      ) : err ? (
        <div className="text-sm text-red-700 bg-red-50 p-3 rounded">{err}</div>
      ) : words.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 p-3">
          No recent news to summarize. Wait for the news ingester to run.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 leading-tight">
          {words.map((w, i) => {
            const color = SENTIMENT_COLOR[w.sentiment] || SENTIMENT_COLOR.neutral;
            const fontSize = countToFontSize(w.count, maxCount);
            const tilt = ageToTilt(w.avg_age_days, i);
            return (
              <Link
                key={w.word}
                to={`/admin/opportunities/my?channel=private-sector&q=${encodeURIComponent(w.word)}`}
                title={`"${w.word}" — ${w.count} mentions, avg age ${w.avg_age_days}d, sentiment ${w.sentiment}`}
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
