// v0.4 — RFP attachment locker panel inside the Bonfire detail drawer.
// Lists files downloaded from the Bonfire detail page + offers a one-
// click "Fetch attachments" trigger (admin-only) that runs Playwright
// on the backend.
//
// Once attachments land, they feed the v0.2 AI tailor automatically
// — the next "Refresh AI" run on the readiness panel pulls excerpts
// from these files into the prompt and starts surfacing real bonds /
// EEO / prevailing-wage / etc. requirements with quoted evidence.

import React, { useCallback, useEffect, useState } from 'react';
import {
  listAttachments, fetchAttachments, downloadAttachment,
} from '../../services/bonfireAttachmentsService';

function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}
function fmtRel(iso) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(ms / 3_600_000);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export default function BonfireAttachmentsPanel({ opportunityId, isAdmin }) {
  const [data, setData] = useState({
    attachments: [], count: 0, attachments_fetched_at: null, last_attachment_fetch: null,
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [err, setErr] = useState(null);
  const [lastFetchResult, setLastFetchResult] = useState(null);

  const reload = useCallback(async () => {
    if (!opportunityId) return;
    setLoading(true); setErr(null);
    try {
      const out = await listAttachments(opportunityId);
      setData(out);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => { reload(); }, [reload]);

  async function handleFetch() {
    setFetching(true); setErr(null); setLastFetchResult(null);
    try {
      const out = await fetchAttachments(opportunityId);
      setLastFetchResult(out);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Fetch failed');
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="mb-4 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
            📎 RFP Attachments
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">v0.4</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {data.count} file{data.count === 1 ? '' : 's'}
          </span>
          {isAdmin && (
            <button
              type="button"
              disabled={fetching}
              onClick={handleFetch}
              className="text-[11px] px-2 py-1 rounded border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 hover:bg-blue-100 disabled:opacity-50"
              title="Log into Bonfire, navigate to this opp's detail page, download the Documents tab, extract text. Used by AI tailoring on the next run."
            >
              {fetching ? '⏳ Fetching…' : '⏬ Fetch from Bonfire'}
            </button>
          )}
        </div>
      </div>
      <div className="px-4 py-3">
        {err && (
          <div className="mb-2 px-2 py-1.5 rounded bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/40 text-[11px] text-red-900 dark:text-red-200">
            {err}
          </div>
        )}
        {/* Persistent status banner: shows even on reload, not just right after click. */}
        {data.last_attachment_fetch?.status === 'blocked' && (
          <div className="mb-2 px-2 py-2 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-[12px] text-amber-900 dark:text-amber-100">
            <div><strong>⚠ Cloudflare blocked this portal</strong> on the last attempt ({fmtRel(data.last_attachment_fetch.at)}).</div>
            <div className="mt-1">
              The Submission Readiness checklist above is a <strong>best-effort baseline</strong> from the RFP title + description only — it can't read the actual solicitation PDFs. Open the portal manually + verify nothing's missing before submitting.
            </div>
          </div>
        )}
        {data.last_attachment_fetch?.status === 'no_links' && data.count === 0 && (
          <div className="mb-2 px-2 py-2 rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[12px] text-gray-700 dark:text-gray-300">
            <strong>ℹ No documents listed</strong> on the Bonfire detail page (last checked {fmtRel(data.last_attachment_fetch.at)}). The agency may post attachments later, or this opp is metadata-only.
          </div>
        )}
        {lastFetchResult && lastFetchResult.attachments_saved > 0 && (
          <div className="mb-2 px-2 py-1.5 rounded bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-900/40 text-[11px] text-green-900 dark:text-green-100">
            <strong>Last fetch:</strong> {lastFetchResult.attachments_saved} saved of {lastFetchResult.attachments_found} found. Click <strong>🤖 Refresh AI</strong> on the readiness panel to re-tailor against this content.
          </div>
        )}
        {loading && data.count === 0 ? (
          <div className="text-xs text-gray-500 py-1">Loading…</div>
        ) : data.attachments.length === 0 ? (
          <div className="text-xs text-gray-500 py-1">
            {!data.last_attachment_fetch && (
              <>
                No RFP attachments fetched yet.
                {isAdmin
                  ? <> Click <strong>⏬ Fetch from Bonfire</strong> to try downloading the Documents tab. <span className="text-gray-400">(Cloudflare blocks ~80% of agency portals — don't be surprised if it returns 0.)</span></>
                  : <> Ask an admin to fetch them.</>}
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
            {data.attachments.map((a) => (
              <li key={a.id} className="py-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadAttachment(opportunityId, a.id, a.name)
                    .catch((e) => setErr('Download failed: ' + (e?.response?.data?.message || e.message)))}
                  className="flex-1 text-left text-blue-700 dark:text-blue-300 hover:underline truncate"
                  title={a.name}
                >
                  ⬇ {a.name}
                </button>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">
                  {fmtBytes(a.size_bytes)}
                </span>
                {a.has_parsed_text && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 shrink-0" title="Text extracted; AI tailoring will read this on next run.">
                    parsed
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {data.count > 0 && (
          <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            Newest fetched: {fmtRel(data.attachments[0]?.downloaded_at)}. Click <strong>🤖 Refresh AI</strong> on the Submission Readiness panel above to pull this text into the requirements detector.
          </div>
        )}
      </div>
    </div>
  );
}
