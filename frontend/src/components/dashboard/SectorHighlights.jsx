import React from 'react';

function SectorHighlights({ highlights }) {
  if (!highlights || highlights.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Sector Highlights</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {highlights.map((sector, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sector.sector}</h3>
              <span className="text-xs font-bold text-accent">{sector.count} opps</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{sector.summary}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default SectorHighlights;
