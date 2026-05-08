import React from 'react';
import BonfireSignalBadges from './BonfireSignalBadges';

function fmtUSD(cents) {
  if (cents == null) return '—';
  const n = Number(cents) / 100;
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'k';
  return '$' + n.toFixed(0);
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
  } catch { return '—'; }
}

// v0.1 — small inline progress bar for the Readiness column. Color follows
// the same priority ramp (green ≥80, yellow ≥60, gray below) so the
// "ready to bid" eye-test matches the rest of the table.
function ReadinessCell({ summary }) {
  if (!summary) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const pct = Number(summary.completion_pct) || 0;
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : pct >= 30 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="min-w-[110px]" title={`${summary.satisfied}/${summary.total} required docs on file · ${summary.gaps} gap${summary.gaps === 1 ? '' : 's'}`}>
      <div className="flex items-baseline justify-between text-[11px] mb-0.5">
        <span className="font-semibold text-gray-700 dark:text-gray-200">{pct}%</span>
        <span className="text-gray-500">{summary.satisfied}/{summary.total}</span>
      </div>
      <div className="h-1.5 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

function BonfireTable({ rows, isAdmin, onSelect, onEnrich, onStrategy, readinessSummaries }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
        No Bonfire opportunities yet. {isAdmin && 'Upload a CSV or JSON file to get started.'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            <Th>Title</Th>
            <Th>Agency</Th>
            <Th>Category</Th>
            <Th>Priority</Th>
            <Th>Auto %</Th>
            <Th>Value</Th>
            <Th>Close</Th>
            <Th>Readiness</Th>
            <Th>Signals</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
              <Td>
                <button
                  type="button"
                  onClick={() => onSelect && onSelect(r)}
                  className="text-left font-medium text-accent hover:underline"
                >
                  {r.title}
                </button>
              </Td>
              <Td className="text-gray-700 dark:text-gray-300">{r.agency || '—'}</Td>
              <Td>{r.aiCategory || <span className="text-gray-400 italic">unenriched</span>}</Td>
              <Td>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${scoreColor(r.priorityScore)}`}>
                  {r.priorityScore ?? '—'}
                </span>
              </Td>
              <Td>{r.automationPotential != null ? r.automationPotential + '%' : '—'}</Td>
              <Td>{fmtUSD(r.estimatedValue)}</Td>
              <Td>{fmtDate(r.closeDate)}</Td>
              <Td><ReadinessCell summary={readinessSummaries && readinessSummaries[r.id]} /></Td>
              <Td><BonfireSignalBadges signals={r.signals} /></Td>
              <Td>
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => onSelect && onSelect(r)}
                    className="text-accent hover:underline"
                  >
                    View
                  </button>
                  {isAdmin && (
                    <>
                      <span className="text-gray-300">·</span>
                      <button
                        type="button"
                        onClick={() => onEnrich && onEnrich(r)}
                        className="text-accent hover:underline"
                      >
                        Enrich
                      </button>
                      <span className="text-gray-300">·</span>
                      <button
                        type="button"
                        onClick={() => onStrategy && onStrategy(r)}
                        className="text-accent hover:underline"
                      >
                        Strategy
                      </button>
                      {r.sourceUrl && (
                        <>
                          <span className="text-gray-300">·</span>
                          <a
                            href={r.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline font-medium"
                            title="Open original RFP on Bonfire"
                          >
                            Bonfire ↗
                          </a>
                        </>
                      )}
                    </>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{children}</th>;
}
function Td({ children, className = '' }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function scoreColor(score) {
  if (score == null) return 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-400';
  if (score >= 80) return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  if (score >= 60) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
}

export default BonfireTable;
