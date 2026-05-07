// RelatedToolsRow — surfaces AI tools whose name / description / category
// / tags match the active keyword. Sits ABOVE the cross-channel results
// on My Opportunities so Ali sees "tools designed for healthcare" right
// next to the healthcare opportunities for that keyword.
//
// Tools live in their own AiTool table; we don't migrate them into
// opportunities. This component is the cross-channel-search surface that
// joins them visually for the user.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRelatedTools } from '../../services/oiedService';

function ToolChip({ tool }) {
  return (
    <Link
      to={tool.slug ? `/ai-tools/${tool.slug}` : '/ai-tools'}
      className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-500 rounded-md p-3 transition min-w-[200px] max-w-[260px]"
      title={tool.summary || tool.name}
    >
      <div className="flex items-center gap-2 mb-1">
        {tool.logo_url ? (
          <img src={tool.logo_url} alt="" className="w-5 h-5 rounded" loading="lazy" />
        ) : (
          <span className="w-5 h-5 inline-flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded text-xs">🛠</span>
        )}
        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
          {tool.name}
        </span>
      </div>
      {tool.category && (
        <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {tool.category}{tool.subcategory ? ` · ${tool.subcategory}` : ''}
        </span>
      )}
      {tool.summary && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
          {tool.summary}
        </p>
      )}
      {(tool.trending_score != null || tool.mention_count_7d != null) && (
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          {tool.trending_score != null && (
            <span title="Trending score">📈 {Number(tool.trending_score).toFixed(0)}</span>
          )}
          {tool.mention_count_7d != null && tool.mention_count_7d > 0 && (
            <span title="Mentions in last 7 days">💬 {tool.mention_count_7d}</span>
          )}
        </div>
      )}
    </Link>
  );
}

export default function RelatedToolsRow({ q }) {
  const [data, setData] = useState({ tools: [], count: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) { setData({ tools: [], count: 0 }); return undefined; }
    let cancelled = false;
    setLoading(true);
    getRelatedTools(q, 8)
      .then((d) => { if (!cancelled) setData(d || { tools: [] }); })
      .catch(() => { if (!cancelled) setData({ tools: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [q]);

  // Hide entirely when no tools match — keeps the page clean for keywords
  // that don't intersect any tool catalog entries.
  if (!q) return null;
  if (loading) {
    return (
      <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
        Looking for related AI tools…
      </div>
    );
  }
  if (data.tools.length === 0) return null;

  return (
    <section className="mb-6" data-testid="related-tools-row">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
        🛠 Related AI tools ({data.tools.length})
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {data.tools.map((tool) => <ToolChip key={tool.id} tool={tool} />)}
      </div>
    </section>
  );
}
