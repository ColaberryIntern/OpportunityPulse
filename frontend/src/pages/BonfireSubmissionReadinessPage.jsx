// v0.7 (Phase 5 polish) — dedicated full-page Submission Readiness view
// for one Bonfire opportunity. Linkable URL, more breathing room than
// the inline drawer, and the canonical surface for "what's left before
// I hit Submit?"
//
// URL pattern: /admin/bonfire/:id/submission-readiness
//
// Sections:
//   - Header: opp title / agency / close date / readiness score badge
//   - Submission Readiness card (existing component, full width)
//   - RFP Attachments panel
//   - Submission Package CTA
//   - Vault status sidebar — counts per type, link to vault for gaps
//   - Generated drafts list (links to Review Queue per output)

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { getOpportunity } from '../services/bonfireService';
import {
  downloadSubmissionPackage,
} from '../services/bonfireAttachmentsService';
import BonfireReadinessPanel from '../components/bonfire/BonfireReadinessPanel';
import BonfireAttachmentsPanel from '../components/bonfire/BonfireAttachmentsPanel';

function fmtUSD(cents) {
  if (cents == null) return '—';
  const n = Number(cents) / 100;
  return Number.isFinite(n) ? '$' + n.toLocaleString() : '—';
}
function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
}

export default function BonfireSubmissionReadinessPage() {
  const { id } = useParams();
  const { user } = useSelector((s) => s.auth);
  const isAdmin = user?.role === 'admin';
  const [opp, setOpp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [packaging, setPackaging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getOpportunity(id)
      .then((o) => { if (!cancelled) setOpp(o); })
      .catch((e) => { if (!cancelled) setErr(e?.response?.data?.message || e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  async function handleGeneratePackage() {
    setPackaging(true);
    try {
      const hint = (opp?.title || '').slice(0, 40).replace(/\s+/g, '-');
      await downloadSubmissionPackage(id, hint);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Package failed');
    } finally {
      setPackaging(false);
    }
  }

  if (!user || user.role !== 'admin') {
    return <div className="p-6 text-center text-gray-500">Admin access required.</div>;
  }
  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>;
  if (err && !opp) return <div className="p-6 text-red-700 bg-red-50 rounded">{err}</div>;
  if (!opp) return <div className="p-6 text-gray-500">Opportunity not found.</div>;

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Breadcrumb */}
        <div className="text-sm text-gray-500 mb-3">
          <Link to="/bonfire" className="hover:underline">🔥 Bonfire</Link>
          <span className="mx-1.5">›</span>
          <span>Submission Readiness</span>
        </div>

        {/* Header card */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 break-words">{opp.title}</h1>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {opp.agency || 'Unknown agency'}
                {opp.aiCategory && <> · <span className="font-medium">{opp.aiCategory}</span></>}
                {opp.closeDate && <> · closes {fmtDate(opp.closeDate)}</>}
              </div>
              {opp.sourceUrl && (
                <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
                  View Original RFP on Bonfire ↗
                </a>
              )}
            </div>
            <div className="flex flex-col gap-2 items-end">
              <button
                type="button"
                disabled={packaging}
                onClick={handleGeneratePackage}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
              >
                {packaging ? '⏳ Assembling…' : '📦 Generate Package'}
              </button>
              {opp.priorityScore != null && (
                <span className="text-xs text-gray-500">Priority: <strong>{opp.priorityScore}</strong></span>
              )}
              {opp.estimatedValue != null && (
                <span className="text-xs text-gray-500">Value: <strong>{fmtUSD(opp.estimatedValue)}</strong></span>
              )}
            </div>
          </div>
          {err && (
            <div className="mt-3 p-2 rounded bg-red-50 dark:bg-red-900/30 text-sm text-red-700 dark:text-red-200">{err}</div>
          )}
        </div>

        {opp.overview && (
          <div className="mb-5 p-4 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40">
            <div className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1 font-semibold">What this is</div>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line leading-relaxed">{opp.overview}</p>
          </div>
        )}

        {/* Two-column layout: readiness + attachments on left, vault sidebar on right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <BonfireReadinessPanel opportunityId={id} />
            <BonfireAttachmentsPanel opportunityId={id} isAdmin={isAdmin} />
          </div>
          <aside className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sticky top-4">
              <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold mb-2">Quick links</h3>
              <ul className="text-sm space-y-1.5">
                <li><Link to="/admin/documents" className="text-blue-700 dark:text-blue-300 hover:underline">📁 Document Vault</Link></li>
                <li><Link to="/admin/data-sources" className="text-blue-700 dark:text-blue-300 hover:underline">🩺 Source Health</Link></li>
                <li><Link to="/bonfire" className="text-blue-700 dark:text-blue-300 hover:underline">🔥 All Bonfire opps</Link></li>
                {opp.sourceUrl && (
                  <li><a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 dark:text-blue-300 hover:underline">↗ Original Bonfire RFP</a></li>
                )}
              </ul>
              <hr className="my-3 border-gray-200 dark:border-gray-700" />
              <h3 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold mb-2">Tip</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Click <strong>📦 Generate Package</strong> to download a ZIP for upload. Includes vault docs (global + bid-local), AI-generated drafts as PDF, fetched RFP attachments, plus README + manifest.json.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
