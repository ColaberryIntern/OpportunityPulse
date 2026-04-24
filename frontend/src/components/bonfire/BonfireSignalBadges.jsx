import React from 'react';
import { SIGNAL_META } from '../../services/bonfireService';

function BonfireSignalBadges({ signals = [], size = 'sm' }) {
  if (!signals || signals.length === 0) return <span className="text-xs text-gray-400">—</span>;
  const cls = size === 'lg' ? 'text-base px-2 py-1' : 'text-xs px-1.5 py-0.5';
  return (
    <div className="flex gap-1 flex-wrap">
      {signals.map((code) => {
        const meta = SIGNAL_META[code] || { emoji: '•', label: code };
        return (
          <span
            key={code}
            title={meta.label}
            className={`inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 ${cls}`}
          >
            <span aria-hidden="true">{meta.emoji}</span>
            <span className="sr-only">{meta.label}</span>
          </span>
        );
      })}
    </div>
  );
}

export default BonfireSignalBadges;
