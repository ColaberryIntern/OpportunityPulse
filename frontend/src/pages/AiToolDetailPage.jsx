import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAiToolBySlug, fetchAiToolMentions, clearCurrentTool } from '../store/slices/aiToolSlice';
import TrendBadge from '../components/aiTools/TrendBadge';
import ToolMentionTimeline from '../components/aiTools/ToolMentionTimeline';
import SEOHead from '../components/common/SEOHead';

function AiToolDetailPage() {
  const { slug } = useParams();
  const dispatch = useDispatch();
  const { currentTool: tool, mentions, detailLoading, error } = useSelector((state) => state.aiTools);

  useEffect(() => {
    dispatch(fetchAiToolBySlug(slug));
    dispatch(fetchAiToolMentions({ slug, page: 1, limit: 20 }));
    return () => dispatch(clearCurrentTool());
  }, [dispatch, slug]);

  if (detailLoading) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !tool) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {error || 'Tool not found'}
          </h2>
          <Link to="/ai-tools" className="text-accent hover:underline">Back to AI Tools</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <SEOHead title={`${tool.name} - AI Tools`} path={`/ai-tools/${slug}`} />
      <div className="max-w-4xl mx-auto">
        {/* Back link */}
        <Link to="/ai-tools" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-accent mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to AI Tools
        </Link>

        {/* Header card */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-accent to-blue-600 flex items-center justify-center text-white text-xl font-bold">
                {tool.name?.charAt(0) || '?'}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{tool.name}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {tool.vendor && <span>{tool.vendor}</span>}
                  {tool.vendor && tool.category && <span> &middot; </span>}
                  {tool.category && <span>{tool.category}</span>}
                  {tool.subcategory && <span> &middot; {tool.subcategory}</span>}
                </p>
              </div>
            </div>
            <TrendBadge score={Math.round(tool.trendingScore || 0)} direction={tool.trendDirection} />
          </div>

          {tool.description && (
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{tool.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {tool.website && (
              <a
                href={tool.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-accent text-white text-sm hover:opacity-90 transition"
              >
                Visit Website
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
            {tool.pricingTier && (
              <span className="px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm capitalize">
                {tool.pricingTier}
                {tool.pricingDetails && ` \u2014 ${tool.pricingDetails}`}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* AI Analysis */}
            {tool.aiAnalysis?.whyTrending && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Why It's Trending</h2>
                <p className="text-sm text-gray-700 dark:text-gray-300">{tool.aiAnalysis.whyTrending}</p>
              </div>
            )}

            {/* Latest update */}
            {tool.lastMajorUpdateSummary && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Latest Major Update</h2>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {tool.lastMajorUpdate && (
                    <span className="text-gray-500 dark:text-gray-400 mr-2">
                      {new Date(tool.lastMajorUpdate).toLocaleDateString()}:
                    </span>
                  )}
                  {tool.lastMajorUpdateSummary}
                </p>
              </div>
            )}

            {/* Update history */}
            {tool.updateHistory && tool.updateHistory.length > 0 && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Update History</h2>
                <div className="space-y-3">
                  {tool.updateHistory.map((update, i) => (
                    <div key={i} className="border-l-2 border-accent pl-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{update.date}</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{update.title}</p>
                      {update.summary && <p className="text-xs text-gray-600 dark:text-gray-400">{update.summary}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mentions timeline */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Recent Mentions</h2>
              <ToolMentionTimeline mentions={mentions} loading={detailLoading} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Stats card */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Stats</h3>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Trending Score</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">{Math.round(tool.trendingScore || 0)}/100</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-xs text-gray-500 dark:text-gray-400">7-Day Mentions</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100">{tool.mentionCount7d || 0}</dd>
                </div>
                {tool.sentimentScore != null && (
                  <div className="flex justify-between">
                    <dt className="text-xs text-gray-500 dark:text-gray-400">Sentiment</dt>
                    <dd className={`text-sm font-medium ${tool.sentimentScore > 0 ? 'text-green-600 dark:text-green-400' : tool.sentimentScore < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      {tool.sentimentScore > 0 ? '+' : ''}{Number(tool.sentimentScore).toFixed(1)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-xs text-gray-500 dark:text-gray-400">Direction</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">{tool.trendDirection || 'stable'}</dd>
                </div>
              </dl>
            </div>

            {/* Features */}
            {tool.features && tool.features.length > 0 && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Features</h3>
                <ul className="space-y-1">
                  {tool.features.map((feature, i) => (
                    <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex items-start gap-1.5">
                      <svg className="w-3 h-3 text-accent mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Industries */}
            {tool.industries && tool.industries.length > 0 && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Industries</h3>
                <div className="flex flex-wrap gap-1.5">
                  {tool.industries.map((ind) => (
                    <Link
                      key={ind}
                      to={`/ai-tools?industry=${encodeURIComponent(ind)}`}
                      className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                    >
                      {ind}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {tool.tags && tool.tags.length > 0 && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {tool.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AiToolDetailPage;
