import React from 'react';

const SECTOR_EMOJIS = {
  government: '\u{1F3DB}\uFE0F',
  gov_contract: '\u{1F3DB}\uFE0F',
  ai_job: '\u{1F4BC}',
  talent: '\u{1F4BC}',
  investment: '\u{1F4B0}',
  capital: '\u{1F4B0}',
  grant: '\u{1F393}',
  ai_news: '\u{1F4F0}',
  freelance: '\u{1F680}',
  technology: '\u{1F916}',
  healthcare: '\u{1F3E5}',
  defense: '\u{1F6E1}\uFE0F',
  cybersecurity: '\u{1F510}',
  energy: '\u26A1',
};

function getSectorEmoji(sectorName) {
  const lower = (sectorName || '').toLowerCase();
  for (const [key, emoji] of Object.entries(SECTOR_EMOJIS)) {
    if (lower.includes(key)) return emoji;
  }
  return '\u{1F4CA}';
}

function SectorHighlights({ highlights }) {
  if (!highlights || highlights.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Sector Highlights</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {highlights.map((sector, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{getSectorEmoji(sector.sector)} {sector.sector}</h3>
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
