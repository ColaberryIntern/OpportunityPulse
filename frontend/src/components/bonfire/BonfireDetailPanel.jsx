import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import BonfireSignalBadges from './BonfireSignalBadges';
import BonfireReadinessPanel from './BonfireReadinessPanel';
import BonfireAttachmentsPanel from './BonfireAttachmentsPanel';
import { downloadSubmissionPackage } from '../../services/bonfireAttachmentsService';

function fmtUSD(cents) {
  if (cents == null) return '—';
  const n = Number(cents) / 100;
  return Number.isFinite(n) ? '$' + n.toLocaleString() : '—';
}

function BonfireDetailPanel({ row, isAdmin, onClose, onEnrich, onStrategy, busy }) {
  const [packaging, setPackaging] = useState(false);
  const [packageErr, setPackageErr] = useState(null);
  if (!row) return null;

  async function handleGeneratePackage() {
    setPackaging(true); setPackageErr(null);
    try {
      const hint = (row.title || '').slice(0, 40).replace(/\s+/g, '-');
      await downloadSubmissionPackage(row.id, hint);
    } catch (e) {
      setPackageErr(e?.response?.data?.message || e.message || 'Package failed');
    } finally {
      setPackaging(false);
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Opportunity details"
    >
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="w-full max-w-xl h-full overflow-y-auto bg-white dark:bg-gray-900 shadow-xl border-l border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{row.title}</h2>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {row.agency || 'Unknown agency'}
              {row.aiCategory && <> · <span className="font-medium">{row.aiCategory}</span></>}
            </div>
            {row.sourceUrl && (
              <a
                href={row.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
              >
                View Original RFP on Bonfire
                <span aria-hidden="true">↗</span>
              </a>
            )}
            {isAdmin && (
              <Link
                to={`/admin/bonfire/${row.id}/submission-readiness`}
                className="inline-flex items-center gap-1.5 mt-2 ml-2 px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 text-sm font-medium"
                title="Open this opportunity in a dedicated full-page Submission Readiness view"
              >
                📑 Open full readiness page
              </Link>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        {row.overview && (
          <div className="mb-4 p-3 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40">
            <div className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300 mb-1 font-semibold">
              What this is
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line leading-relaxed">
              {row.overview}
            </p>
          </div>
        )}

        {/* v0.1 Submission Readiness: completion % + checklist + jump-to-vault links */}
        {isAdmin && <BonfireReadinessPanel opportunityId={row.id} />}

        {/* v0.4 RFP Attachments: scraper-fed file locker per opp */}
        <BonfireAttachmentsPanel opportunityId={row.id} isAdmin={isAdmin} />

        {/* v0.5 (Phase 4) — Submission Package: one-click ZIP of vault + attachments + manifest */}
        {isAdmin && (
          <div className="mb-4 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-blue-900 dark:text-blue-200 font-semibold">📦 Submission Package</div>
                <div className="text-[12px] text-blue-800 dark:text-blue-200 mt-0.5">
                  ZIP of every vault doc (global + bid-local), AI-generated drafts rendered to PDF, every fetched RFP attachment, plus a README + manifest.json.
                </div>
              </div>
              <button
                type="button"
                disabled={packaging}
                onClick={handleGeneratePackage}
                className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 whitespace-nowrap"
                title="Build a single ZIP for upload to the Bonfire portal"
              >
                {packaging ? '⏳ Assembling…' : '📦 Generate Package'}
              </button>
            </div>
            {packageErr && (
              <div className="mt-2 px-2 py-1 rounded bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/40 text-[11px] text-red-900 dark:text-red-200">
                {packageErr}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <Stat label="Priority" value={row.priorityScore ?? '—'} />
          <Stat label="Fit" value={row.fitScore ?? '—'} />
          <Stat label="Automation %" value={row.automationPotential ?? '—'} />
          <Stat label="Repeatability" value={row.repeatability ?? '—'} />
          <Stat label="Ease of Entry" value={row.easeOfEntry ?? '—'} />
          <Stat label="Revenue Weight" value={row.revenueWeight ?? '—'} />
          <Stat label="Est. Value" value={fmtUSD(row.estimatedValue)} />
          <Stat label="Close Date" value={row.closeDate ? new Date(row.closeDate).toLocaleDateString() : '—'} />
        </div>

        {row.recommendedProduct && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Recommended Product</div>
            <span className="inline-block px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm font-medium">
              {row.recommendedProduct}
            </span>
          </div>
        )}

        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Signals</div>
          <BonfireSignalBadges signals={row.signals || []} size="lg" />
        </div>

        {row.description && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Description</div>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{row.description}</p>
          </div>
        )}

        {row.tags && row.tags.length > 0 && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Tags</div>
            <div className="flex flex-wrap gap-1">
              {row.tags.map((t, i) => (
                <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
                  {t.tag || t}
                </span>
              ))}
            </div>
          </div>
        )}

        {row.strategy && (
          <div className="mb-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Productization Strategy</div>
            <dl className="space-y-2 text-sm">
              {row.strategy.suggested_ai_system && (
                <div>
                  <dt className="font-medium text-gray-900 dark:text-gray-100">Suggested AI System</dt>
                  <dd className="text-gray-700 dark:text-gray-300">{row.strategy.suggested_ai_system}</dd>
                </div>
              )}
              {row.strategy.staffing_model && (
                <div>
                  <dt className="font-medium text-gray-900 dark:text-gray-100">Staffing</dt>
                  <dd className="text-gray-700 dark:text-gray-300">{row.strategy.staffing_model}</dd>
                </div>
              )}
              {row.strategy.pricing_range && (
                <div>
                  <dt className="font-medium text-gray-900 dark:text-gray-100">Pricing</dt>
                  <dd className="text-gray-700 dark:text-gray-300">
                    ${Number(row.strategy.pricing_range.low || 0).toLocaleString()} – ${Number(row.strategy.pricing_range.high || 0).toLocaleString()}
                    {row.strategy.pricing_range.model && <> · {row.strategy.pricing_range.model}</>}
                  </dd>
                </div>
              )}
              {Array.isArray(row.strategy.proposal_outline) && row.strategy.proposal_outline.length > 0 && (
                <div>
                  <dt className="font-medium text-gray-900 dark:text-gray-100">Proposal Outline</dt>
                  <dd>
                    <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300">
                      {row.strategy.proposal_outline.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </dd>
                </div>
              )}
              {Array.isArray(row.strategy.risks) && row.strategy.risks.length > 0 && (
                <div>
                  <dt className="font-medium text-gray-900 dark:text-gray-100">Risks</dt>
                  <dd>
                    <ul className="list-disc pl-5 text-gray-700 dark:text-gray-300">
                      {row.strategy.risks.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {isAdmin && row.rawText && (
          <details className="mb-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-gray-500">Raw Source (admin only)</summary>
            <pre className="text-xs mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded whitespace-pre-wrap break-words">{row.rawText}</pre>
          </details>
        )}

        {isAdmin && (
          <div className="sticky bottom-0 left-0 right-0 -mx-5 px-5 py-3 mt-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex gap-2 flex-wrap">
            <button
              type="button"
              disabled={busy}
              onClick={() => onEnrich && onEnrich(row)}
              className="px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-sm hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Enrich
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onStrategy && onStrategy(row)}
              className="px-3 py-1.5 rounded bg-accent text-white text-sm hover:bg-accent/90 disabled:opacity-50"
            >
              Generate Strategy
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}

export default BonfireDetailPanel;
