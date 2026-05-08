// Submission Readiness Engine v0.1 — per-bid panel rendered inside the
// Bonfire detail drawer. Shows the completion %, the 6–7 required-doc
// checklist, and a deep-link to the Document Vault for any gaps.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBonfireReadiness, tailorBonfireRequirements } from '../../services/documentService';

const STATUS_META = {
  satisfied: { label: '✓ On file',   cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  expiring:  { label: '⚠ Expiring',  cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  expired:   { label: '✗ Expired',   cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  gap:       { label: '✗ Missing',   cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
};

function progressColor(pct) {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 60) return 'bg-yellow-500';
  if (pct >= 30) return 'bg-orange-500';
  return 'bg-red-500';
}

export default function BonfireReadinessPanel({ opportunityId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tailoring, setTailoring] = useState(false);

  const reload = React.useCallback(async () => {
    if (!opportunityId) return;
    setLoading(true); setErr(null);
    try {
      const d = await getBonfireReadiness(opportunityId);
      setData(d);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    if (!opportunityId) return undefined;
    let cancelled = false;
    setLoading(true); setErr(null);
    getBonfireReadiness(opportunityId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setErr(e?.response?.data?.message || e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [opportunityId]);

  async function handleTailor({ force }) {
    setTailoring(true); setErr(null);
    try {
      await tailorBonfireRequirements(opportunityId, { force });
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setTailoring(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="mb-4 p-3 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-500">
        Computing readiness…
      </div>
    );
  }
  if (err) {
    return (
      <div className="mb-4 p-3 rounded bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-200">
        Readiness failed: {err}
      </div>
    );
  }
  if (!data) return null;

  const pct = Number(data.completion_pct) || 0;
  const c = data.counts || {};

  return (
    <div className="mb-4 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
            Submission Readiness
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
            {data.ai && data.ai.generated_at ? 'v0.2 · AI-tailored' : 'v0.1 · baseline'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {c.satisfied || 0} of {c.total || 0} required docs ready
          </span>
          <button
            type="button"
            disabled={tailoring}
            onClick={() => handleTailor({ force: !!(data.ai && data.ai.generated_at) })}
            className="text-[11px] px-2 py-1 rounded border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 hover:bg-blue-100 disabled:opacity-50"
            title={data.ai && data.ai.generated_at
              ? 'Re-run AI to refresh requirements detection'
              : 'Run AI to detect bid-specific requirements (bonds, prevailing wage, EEO, etc.)'}
          >
            {tailoring
              ? '🤖 Analyzing…'
              : (data.ai && data.ai.generated_at ? '🤖 Refresh AI' : '🤖 Tailor with AI')}
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{pct}%</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">complete</span>
          {c.gaps > 0 && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
              {c.gaps} gap{c.gaps === 1 ? '' : 's'}
            </span>
          )}
          {c.expiring > 0 && (
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
              {c.expiring} expiring
            </span>
          )}
          {c.expired > 0 && (
            <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
              {c.expired} expired
            </span>
          )}
        </div>
        <div className="h-2 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden mb-3">
          <div className={`h-full ${progressColor(pct)} transition-all`} style={{ width: pct + '%' }} />
        </div>

        {data.ai && data.ai.summary && (
          <div className="mb-2 px-2 py-1.5 rounded bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-900 dark:text-blue-100">
            <span className="font-semibold">🤖 AI summary:</span> {data.ai.summary}
          </div>
        )}
        {data.ai && data.ai.error && (
          <div className="mb-2 px-2 py-1.5 rounded bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/40 text-[11px] text-red-900 dark:text-red-200">
            AI run failed: {data.ai.error}. Showing baseline only.
          </div>
        )}

        <ul className="text-sm space-y-1.5">
          {data.checklist.map((item, idx) => {
            const meta = STATUS_META[item.status] || STATUS_META.gap;
            const sourceLabel = item.source === 'ai'
              ? '🤖 AI'
              : item.source === 'conditional'
                ? '⚡ rule'
                : null;
            return (
              <li key={`${item.type}-${idx}`} className="flex items-start gap-2">
                <span className={`text-[11px] px-2 py-0.5 rounded font-medium shrink-0 ${meta.cls}`}>{meta.label}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-900 dark:text-gray-100 flex items-center gap-1.5 flex-wrap">
                    <span>{item.type_label}</span>
                    {sourceLabel && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" title={`Source: ${item.source}${item.confidence != null ? ` · confidence ${Math.round(item.confidence * 100)}%` : ''}`}>
                        {sourceLabel}
                      </span>
                    )}
                  </div>
                  {item.reason && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 italic">{item.reason}</div>
                  )}
                  {item.source_quote && (
                    <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 pl-2 border-l-2 border-blue-200 dark:border-blue-800">
                      <span className="text-gray-500">RFP says:</span> &ldquo;{item.source_quote}&rdquo;
                    </div>
                  )}
                  {item.document && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {item.document.name} · v{item.document.version}
                      {item.document.expires_in_days != null && (
                        <span> · {item.document.expires_in_days < 0
                          ? `expired ${-item.document.expires_in_days}d ago`
                          : `expires in ${item.document.expires_in_days}d`}</span>
                      )}
                    </div>
                  )}
                </div>
                {(item.status === 'gap' || item.status === 'expired') && (
                  <Link
                    to="/admin/documents"
                    className="text-[11px] text-blue-700 dark:text-blue-300 hover:underline shrink-0"
                    title="Open the Document Vault to upload"
                  >
                    Upload →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-3 text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between flex-wrap gap-1">
          <span>
            {data.ai && data.ai.generated_at
              ? <>AI run: {new Date(data.ai.generated_at).toLocaleString()} · {data.ai.additional_count || 0} additional flagged</>
              : 'Click "Tailor with AI" to detect bid-specific requirements (bonds, prevailing wage, EEO, etc.)'}
          </span>
          <Link to="/admin/documents" className="text-blue-700 dark:text-blue-300 hover:underline">Manage documents →</Link>
        </div>
      </div>
    </div>
  );
}
