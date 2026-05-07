// v9.8: Drill-down sub-cloud rendered on the keyword search results
// page. Calls /api/v1/oied/keywords/drill?q=<word>(,<word>...) and shows
// the words that frequently co-occur with the parent keyword(s) in
// matching opportunities. Click a sub-word → URL becomes ?q=parent,sub.
//
// Re-uses the same red→green color function as the main KeywordCloud.

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDrillDownCloud } from '../../services/oiedService';

function colorForSentiment(score, isKnown = true) {
  if (!isKnown) return 'hsl(0, 0%, 60%)';
  const s = Math.max(-1, Math.min(1, Number(score) || 0));
  const hue = Math.round(60 + 60 * s);
  const sat = Math.round(55 + Math.abs(s) * 30);
  const light = Math.round(46 - Math.abs(s) * 14);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function fontSizeForCount(count, maxCount) {
  if (!maxCount || count <= 0) return 12;
  const ratio = Math.min(1, count / maxCount);
  return Math.round(12 + ratio * 16);
}

export default function KeywordDrillCloud({ q }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState({ words: [], article_count: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) return undefined;
    let cancelled = false;
    setLoading(true);
    getDrillDownCloud(q, 30)
      .then((d) => { if (!cancelled) setData(d || { words: [], article_count: 0 }); })
      .catch(() => { if (!cancelled) setData({ words: [], article_count: 0 }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [q]);

  if (!q) return null;
  const words = data.words || [];

  function refineWith(subWord) {
    // Append subWord to the existing q (comma-separated, AND semantics on
    // the backend). If the parent already includes subWord, no-op.
    const parents = q.split(',').map((s) => s.trim()).filter(Boolean);
    if (parents.includes(subWord)) return;
    parents.push(subWord);
    const next = new URLSearchParams(searchParams);
    next.set('q', parents.join(','));
    setSearchParams(next);
  }

  const maxCount = words.reduce((m, w) => Math.max(m, w.count || 0), 0);
  const parents = q.split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-900 dark:text-blue-200">
          🔎 Refine &quot;{parents.join(' + ')}&quot;
        </h3>
        <span className="text-[10px] text-blue-700 dark:text-blue-300">
          {data.article_count
            ? `${data.article_count.toLocaleString()} matching opps · click any word to narrow`
            : ''}
        </span>
      </div>
      {loading ? (
        <div className="text-xs text-blue-700 dark:text-blue-300 py-1">Computing sub-topics…</div>
      ) : words.length === 0 ? (
        <div className="text-xs text-blue-700 dark:text-blue-300 py-1">
          No co-occurring sub-topics. Try a different parent keyword.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 leading-tight">
          {words.map((w) => {
            const known = w.sentiment_known !== false && w.sentiment_label !== 'unknown';
            const color = colorForSentiment(w.sentiment_score, known);
            const fs = fontSizeForCount(w.count, maxCount);
            return (
              <button
                key={w.word}
                type="button"
                onClick={() => refineWith(w.word)}
                title={`${w.count} co-mentions${known ? ` · sentiment ${w.sentiment_score}` : ' · no sentiment signal'} · click to narrow`}
                className="inline-block hover:underline focus:outline-none focus:ring-2 focus:ring-blue-400 rounded px-0.5"
                style={{
                  color,
                  fontSize: `${fs}px`,
                  fontWeight: fs >= 18 ? 700 : 500,
                  whiteSpace: 'nowrap',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {w.display_word || w.word}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
