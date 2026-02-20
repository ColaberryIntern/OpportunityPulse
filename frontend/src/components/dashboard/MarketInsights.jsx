import React from 'react';

function MarketInsights({ marketPulse, riskFlags, trendSignals }) {
  const hasContent = marketPulse || (riskFlags && riskFlags.length > 0) || (trendSignals && trendSignals.length > 0);
  if (!hasContent) return null;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Market Intelligence</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Market Pulse */}
        {marketPulse && (
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Market Pulse</h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{marketPulse}</p>
          </div>
        )}

        {/* Risk Flags */}
        {riskFlags && riskFlags.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/10 shadow rounded-lg p-4 border border-red-100 dark:border-red-900/30">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Risk Flags</h3>
            </div>
            <ul className="space-y-1.5">
              {riskFlags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                  <span className="mt-0.5 shrink-0">&#9888;</span>
                  <span>{typeof flag === 'string' ? flag : flag.text || flag.description || JSON.stringify(flag)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Trend Signals */}
        {trendSignals && trendSignals.length > 0 && (
          <div className="bg-green-50 dark:bg-green-900/10 shadow rounded-lg p-4 border border-green-100 dark:border-green-900/30">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
              <h3 className="text-sm font-semibold text-green-700 dark:text-green-400">Trend Signals</h3>
            </div>
            <ul className="space-y-1.5">
              {trendSignals.map((signal, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-green-600 dark:text-green-400">
                  <span className="mt-0.5 shrink-0">&#8599;</span>
                  <span>{typeof signal === 'string' ? signal : signal.text || signal.description || JSON.stringify(signal)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export default MarketInsights;
