import React from 'react';

function StatCard({ label, value, suffix = '', valueColor = '' }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
      <p className={`text-2xl font-bold ${valueColor || 'text-gray-900 dark:text-gray-100'}`}>
        {value ?? '—'}{suffix}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

export default StatCard;
