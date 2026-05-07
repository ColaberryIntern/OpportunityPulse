// OIED v9.1 UX — reusable drill-down modal for an opportunity row.
//
// Triggered by row click on My Opportunities, Top Actions, and Execution
// Queue. Loads /opportunities/:id (single-row endpoint, which carries the
// full grounding + execution_mode + partner_profile).
//
// Closing: clicking the backdrop, pressing Escape, or hitting the Close
// button.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import ChannelChip from './ChannelChip';

function fmtUSD(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + Math.round(v / 1_000) + 'k';
  return '$' + v;
}

function modeBadge(mode) {
  if (mode === 'partner_required') return { text: 'Partner Required', cls: 'bg-purple-100 text-purple-800' };
  if (mode === 'direct_submit')    return { text: 'Direct Submit',    cls: 'bg-green-100 text-green-800' };
  if (mode === 'ignore')           return { text: 'Skip',              cls: 'bg-gray-100 text-gray-800' };
  return null;
}

function Field({ label, value, mono = false }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-0.5 text-sm text-gray-900 dark:text-gray-100 ${mono ? 'font-mono' : ''}`}>
        {value == null || value === '' ? '—' : value}
      </div>
    </div>
  );
}

export default function OpportunityDetailModal({ opportunityId, onClose }) {
  const [opp, setOpp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!opportunityId) return undefined;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    api.get(`/oied/opportunities/${opportunityId}`)
      .then((res) => { if (!cancelled) setOpp(res.data && res.data.data); })
      .catch((e) => {
        if (!cancelled) setErr((e.response && e.response.data && e.response.data.message) || e.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    function onKey(ev) { if (ev.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKey);
    };
  }, [opportunityId, onClose]);

  if (!opportunityId) return null;

  const ctx = (opp && opp.context) || {};
  const grounding = ctx.grounding || {};
  const partner = ctx.partner_profile;
  const mb = modeBadge(ctx.execution_mode);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
      data-testid="opp-detail-modal-backdrop"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mt-8 mb-12"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="opp-detail-modal-title"
        data-testid="opp-detail-modal"
      >
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs text-gray-500">Opportunity #{opportunityId}</span>
              {ctx.channel && <ChannelChip channel={ctx.channel} linkable={false} />}
              {mb && (
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${mb.cls}`}>
                  {mb.text}
                </span>
              )}
              {ctx.recommended_action && (
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-semibold">
                  {ctx.recommended_action}
                </span>
              )}
            </div>
            <h2 id="opp-detail-modal-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 break-words">
              {opp ? opp.title : 'Loading…'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl leading-none px-2"
            aria-label="Close"
            data-testid="opp-detail-modal-close"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {loading && <div className="text-sm text-gray-500">Loading opportunity…</div>}
          {err && <div className="text-sm text-red-700 bg-red-50 p-3 rounded">{err}</div>}

          {opp && !loading && (
            <>
              <section className="grid grid-cols-2 gap-4 mb-4">
                <Field label="Source" value={opp.source} />
                <Field label="Source ID" value={opp.sourceId} mono />
                <Field label="Category" value={opp.category} />
                <Field label="Bucket" value={opp.bucket} />
                <Field label="Estimated value" value={fmtUSD(opp.value)} />
                <Field label="Fit / Priority" value={`${opp.fitScore || 0} / ${opp.priorityScore || 0}`} />
                <Field label="Win probability" value={ctx.win_probability != null ? Math.round(ctx.win_probability * 100) + '%' : '—'} />
                <Field label="ROI / hr" value={fmtUSD(ctx.roi_per_hour)} />
              </section>

              {(grounding.agency_name || grounding.solicitation_id || grounding.status) && (
                <section className="mb-4 bg-gray-50 dark:bg-gray-900/50 rounded-md p-3">
                  <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Grounding</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Agency" value={grounding.agency_name} />
                    <Field label="Solicitation ID" value={grounding.solicitation_id} mono />
                    {Array.isArray(grounding.missing_fields) && grounding.missing_fields.length > 0 && (
                      <div className="col-span-2">
                        <Field label="Missing context fields" value={grounding.missing_fields.join(', ')} />
                      </div>
                    )}
                    {grounding.status === 'invalid_stage' && (
                      <div className="col-span-2">
                        <Field label="Lifecycle blocker" value={`${grounding.blocked_by_event || 'event recorded'} — generation locked`} />
                      </div>
                    )}
                  </div>
                </section>
              )}

              {partner && (
                <section className="mb-4 bg-purple-50 dark:bg-purple-900/20 rounded-md p-3">
                  <div className="text-xs uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-2">Partner profile (v9)</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <Field label="Industry" value={partner.industry} />
                    <Field label="Geography" value={partner.geography} />
                    <Field label="Size band" value={partner.size_band} />
                    <Field label="Outreach ready" value={ctx.outreach_ready ? 'Yes' : 'No'} />
                    <div className="col-span-2">
                      <Field label="Capabilities prime needs" value={(partner.capabilities_needed || []).join(', ')} />
                    </div>
                    <div className="col-span-2">
                      <Field label="Colaberry contributes" value={(partner.colaberry_contribution || []).join(', ')} />
                    </div>
                  </div>
                </section>
              )}

              {ctx.reason && (
                <section className="mb-4">
                  <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Why this matters</div>
                  <div className="text-sm text-gray-800 dark:text-gray-200">{ctx.reason}</div>
                </section>
              )}

              {Array.isArray(ctx.next_steps) && ctx.next_steps.length > 0 && (
                <section className="mb-4">
                  <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Next steps</div>
                  <ul className="text-sm text-gray-800 dark:text-gray-200 list-disc list-inside space-y-1">
                    {ctx.next_steps.map((s, idx) => (
                      <li key={idx} className="break-words">{s}</li>
                    ))}
                  </ul>
                </section>
              )}

              {opp.description && (
                <section className="mb-4">
                  <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Description</div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {opp.description}
                  </div>
                </section>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-sm">
                <Link
                  to={`/admin/opportunities/${opportunityId}`}
                  className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                  onClick={onClose}
                >
                  Open full page →
                </Link>
                {opp.sourceUrl && (
                  <a
                    href={opp.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Source ↗
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-auto px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
