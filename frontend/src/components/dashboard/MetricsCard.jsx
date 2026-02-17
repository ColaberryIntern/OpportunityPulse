import React from 'react';

function MetricsCard({ title, value, description }) {
  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">{title}</h3>
      <p className="mt-2 text-3xl font-bold text-primary">
        {value !== null && value !== undefined ? value : '—'}
      </p>
      {description && (
        <p className="mt-1 text-sm text-gray-400">{description}</p>
      )}
    </div>
  );
}

export default MetricsCard;
