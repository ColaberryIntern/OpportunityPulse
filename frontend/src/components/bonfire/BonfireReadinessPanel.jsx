// Submission Readiness Engine v0.1 — per-bid panel rendered inside the
// Bonfire detail drawer. v0.8: now switches on a four-state machine —
//   pre-pursuit              → "Pursue this bid" CTA, no number shown
//   pursuing-no-attachments  → drop-zone for the human to upload the RFP
//   attachments-only         → "Run AI tailoring" CTA against the uploaded RFP
//   tailored                 → real % + per-item checklist (legacy panel)
// Generic baselines no longer surface a misleading 67%.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getBonfireReadiness, tailorBonfireRequirements, generateDocument, downloadDocumentToFile,
} from '../../services/documentService';
import { pursueBid, cancelPursuit } from '../../services/bonfireAttachmentsService';
import BonfireUploadZone from './BonfireUploadZone';
import BonfirePortalScreenshotZone from './BonfirePortalScreenshotZone';

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

export default function BonfireReadinessPanel({ opportunityId, onStateChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [tailoring, setTailoring] = useState(false);
  const [generating, setGenerating] = useState({}); // { typeKey: true } while AI is generating that doc

  // Lift the bid's flow state up to whatever wraps this component (e.g. the
  // dedicated readiness page) so it can gate Generate Package etc.
  React.useEffect(() => {
    if (onStateChange && data) onStateChange(data.state || null);
  }, [data, onStateChange]);

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

  const [pursuing, setPursuing] = useState(false);

  async function handlePursue() {
    setPursuing(true); setErr(null);
    try {
      await pursueBid(opportunityId);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Pursue failed');
    } finally {
      setPursuing(false);
    }
  }

  async function handleCancelPursuit({ decline = false } = {}) {
    setPursuing(true); setErr(null);
    try {
      await cancelPursuit(opportunityId, { decline });
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Cancel failed');
    } finally {
      setPursuing(false);
    }
  }

  async function handleGenerate(typeKey) {
    setGenerating((s) => ({ ...s, [typeKey]: true }));
    setErr(null);
    try {
      await generateDocument({ type: typeKey, bonfireOpportunityId: opportunityId });
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Generation failed');
    } finally {
      setGenerating((s) => {
        const next = { ...s };
        delete next[typeKey];
        return next;
      });
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

  // v0.8 — state-machine fork. Each non-tailored state has a focused UI
  // that points the user to exactly the next action.
  const state = data.state || 'tailored';
  if (state === 'pre-pursuit' || state === 'declined') {
    return (
      <PrePursuitCard
        data={data}
        pursuing={pursuing}
        onPursue={handlePursue}
        wasDeclined={state === 'declined'}
      />
    );
  }
  if (state === 'pursuing-no-attachments') {
    return (
      <PursuingNoAttachmentsCard
        data={data}
        opportunityId={opportunityId}
        pursuing={pursuing}
        onCancelPursuit={handleCancelPursuit}
        onUploaded={reload}
      />
    );
  }
  if (state === 'attachments-only') {
    return (
      <AttachmentsOnlyCard
        data={data}
        opportunityId={opportunityId}
        tailoring={tailoring}
        pursuing={pursuing}
        // Always force a fresh AI run when the user explicitly clicks the CTA
        // from this state — otherwise the cache might short-circuit and the
        // panel never graduates to 'tailored'.
        onTailor={() => handleTailor({ force: true })}
        onCancelPursuit={handleCancelPursuit}
        onUploaded={reload}
      />
    );
  }
  if (state === 'submitted') {
    return <SubmittedCard data={data} />;
  }

  // state === 'tailored' — legacy UI with the full % + checklist.
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
        <FlowSteps state="tailored" />
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

        {/* Be honest about what we read to compute this. The 6-doc baseline applies
            to any government bid; the bid-specific stuff (bonds, prevailing wage,
            EEO, MWBE thresholds) only surfaces when AI reads the actual RFP PDFs. */}
        <div className="mb-3 text-[11px] text-gray-600 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
          {data.ai && data.ai.generated_at ? (
            <>
              <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 font-medium">🤖 AI-tailored</span>
              <span>checklist reflects this RFP's specific requirements{data.ai.attachments_used ? ' (read from fetched documents)' : ' (inferred from title + description)'}.</span>
            </>
          ) : (
            <>
              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 font-medium">📋 Baseline</span>
              <span>generic checklist for any government bid. Click <strong>🤖 Tailor with AI</strong> to surface bid-specific requirements (bonds, prevailing wage, EEO, etc.).</span>
            </>
          )}
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
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => downloadDocumentToFile(item.document.id, item.document.name)
                          .catch((e) => setErr('Download failed: ' + (e?.response?.data?.message || e.message)))}
                        className="text-blue-700 dark:text-blue-300 hover:underline font-medium inline-flex items-center gap-1"
                        title="Download this document"
                      >
                        ⬇ {item.document.name} · v{item.document.version}
                      </button>
                      {item.document.scope === 'bid' && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 font-medium" title="Local to this bid only">
                          📌 this bid
                        </span>
                      )}
                      {item.document.scope === 'global' && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200" title="From the global vault — reused across bids">
                          🌐 vault
                        </span>
                      )}
                      {item.document.doc_source === 'ai_generated' && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" title="Created by the AI generator">
                          🤖 AI
                        </span>
                      )}
                      {item.document.expires_in_days != null && (
                        <span> · {item.document.expires_in_days < 0
                          ? `expired ${-item.document.expires_in_days}d ago`
                          : `expires in ${item.document.expires_in_days}d`}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 items-end shrink-0">
                  {item.type_generatable && (item.status === 'gap' || item.status === 'expired') && (
                    <button
                      type="button"
                      disabled={!!generating[item.type]}
                      onClick={() => handleGenerate(item.type)}
                      className="text-[11px] px-2 py-0.5 rounded border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
                      title="Generate this document with AI — saved locally for this bid + globally as a versioned reference"
                    >
                      {generating[item.type] ? '🤖 Generating…' : '🤖 Generate'}
                    </button>
                  )}
                  {(item.status === 'gap' || item.status === 'expired') && (
                    <Link
                      to="/admin/documents"
                      className="text-[11px] text-blue-700 dark:text-blue-300 hover:underline whitespace-nowrap"
                      title="Open the Document Vault to upload"
                    >
                      Upload →
                    </Link>
                  )}
                </div>
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

// v0.10 step indicator: 5 steps now that we have the portal screenshot capture
// step. Order: Pursue → Capture requirements (screenshot+vision) → Upload
// supporting files → AI tailoring against RFP body → Generate Package.
const FLOW_STEPS = [
  { key: 'pursue',   label: 'Pursue',           emoji: '📌', satisfiedIn: ['pursuing-no-attachments', 'attachments-only', 'tailored', 'submitted'] },
  { key: 'capture',  label: 'Capture requirements', emoji: '📸', satisfiedIn: ['tailored', 'submitted'] },
  { key: 'upload',   label: 'Upload supporting files', emoji: '📥', satisfiedIn: ['attachments-only', 'tailored', 'submitted'] },
  { key: 'tailor',   label: 'Tailor with AI',   emoji: '🤖', satisfiedIn: ['tailored', 'submitted'] },
  { key: 'package',  label: 'Generate Package', emoji: '📦', satisfiedIn: ['submitted'] },
];

function FlowSteps({ state }) {
  // Active step = first un-satisfied step; satisfied = green; future = grey.
  const activeIdx = FLOW_STEPS.findIndex((s) => !s.satisfiedIn.includes(state));
  return (
    <div className="flex items-center gap-1 mb-4 overflow-x-auto" aria-label="Submission flow steps">
      {FLOW_STEPS.map((s, idx) => {
        const satisfied = s.satisfiedIn.includes(state);
        const active = idx === activeIdx;
        const cls = satisfied
          ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-700'
          : active
            ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100 border-blue-300 dark:border-blue-700 ring-2 ring-blue-300 dark:ring-blue-600'
            : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700';
        return (
          <React.Fragment key={s.key}>
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border whitespace-nowrap ${cls}`}
              title={satisfied ? 'Done' : (active ? 'Next step' : 'Coming up')}
            >
              <span aria-hidden="true">{satisfied ? '✓' : s.emoji}</span>
              <span>{idx + 1}. {s.label}</span>
            </span>
            {idx < FLOW_STEPS.length - 1 && (
              <span className="text-gray-300 dark:text-gray-600 select-none" aria-hidden="true">›</span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// v0.8 — state cards. Each renders the right next-action for the bid's state.

function PrePursuitCard({ data, pursuing, onPursue, wasDeclined }) {
  return (
    <div className="mb-4 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
          Submission Readiness
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          {wasDeclined ? 'previously declined' : 'not yet pursued'}
        </span>
      </div>
      <div className="px-4 py-4">
        <FlowSteps state={data.state || 'pre-pursuit'} />
        <div className="text-sm text-gray-700 dark:text-gray-200 mb-2">
          <strong>Show interest first.</strong> A real readiness score isn't possible until we know what
          <em> this </em> bid actually requires — and that lives inside the RFP attachments on the agency portal.
        </div>
        <ol className="list-decimal pl-5 text-[13px] text-gray-700 dark:text-gray-300 space-y-0.5 mb-3">
          <li>Click <strong>📌 Pursue this bid</strong>.</li>
          <li>Open the agency portal page in your browser. Screenshot the <strong>Required Information</strong> section + drop it in our zone — AI vision extracts the agency's published submission checklist.</li>
          <li>Click <em>Download All Files</em> on the portal, drop the ZIP in our zone — we auto-expand + classify each file.</li>
          <li>Run AI against the RFP body to surface bid-specific clauses (bonds, EEO, etc.).</li>
          <li>We assemble a ready-to-upload package against the agency's actual checklist.</li>
        </ol>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={pursuing}
            onClick={onPursue}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {pursuing ? '⏳ Setting…' : (wasDeclined ? '📌 Re-pursue this bid' : '📌 Pursue this bid')}
          </button>
          {data.source_url && (
            <a
              href={data.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              🔗 Open RFP on Bonfire ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function PursuingNoAttachmentsCard({ data, opportunityId, pursuing, onCancelPursuit, onUploaded }) {
  return (
    <div className="mb-4 rounded border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
      <div className="px-4 py-3 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-blue-800 dark:text-blue-200 font-semibold">
            Submission Readiness
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-200 text-blue-900 dark:bg-blue-700 dark:text-blue-100">
            📌 pursuing · no attachments yet
          </span>
        </div>
        <button
          type="button"
          disabled={pursuing}
          onClick={() => onCancelPursuit({ decline: false })}
          className="text-[11px] text-gray-600 dark:text-gray-300 hover:underline disabled:opacity-50"
          title="Clear pursuit (you can re-pursue later)"
        >
          Cancel pursuit
        </button>
      </div>
      <div className="px-4 py-4">
        <FlowSteps state={data.state || 'pursuing-no-attachments'} />
        <div className="text-sm text-gray-800 dark:text-gray-100 mb-1">
          <strong>Step 1 done.</strong> Two things to do next:
        </div>
        <ol className="list-decimal pl-5 text-[13px] text-gray-700 dark:text-gray-300 space-y-0.5 mb-3">
          <li>
            <strong>Capture the agency's requirements list.</strong> Open the portal page
            {data.source_url ? (
              <>
                {' '}(<a href={data.source_url} target="_blank" rel="noopener noreferrer"
                      className="text-blue-700 dark:text-blue-300 underline font-medium">
                  link ↗
                </a>)
              </>
            ) : ''}, screenshot the <strong>Required Information</strong> section, drop it in the purple zone below.
            We use AI vision to extract the agency's published submission checklist.
          </li>
          <li>
            <strong>Upload the supporting docs.</strong> Click <em>Download All Files</em> on the portal,
            drop the ZIP in the blue zone below. We auto-expand + classify each file.
          </li>
        </ol>
        <BonfirePortalScreenshotZone
          opportunityId={opportunityId}
          sourceUrl={data.source_url}
          onExtracted={onUploaded}
        />
        <BonfireUploadZone
          opportunityId={opportunityId}
          sourceUrl={data.source_url}
          onUploaded={onUploaded}
        />
      </div>
    </div>
  );
}

function AttachmentsOnlyCard({ data, opportunityId, tailoring, pursuing, onTailor, onCancelPursuit, onUploaded }) {
  const count = data.attachments?.count || 0;
  return (
    <div className="mb-4 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20">
      <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-amber-900 dark:text-amber-100 font-semibold">
            Submission Readiness
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 dark:bg-amber-700 dark:text-amber-100">
            📎 {count} file{count === 1 ? '' : 's'} uploaded · AI hasn't tailored yet
          </span>
        </div>
        <button
          type="button"
          disabled={pursuing}
          onClick={() => onCancelPursuit({ decline: false })}
          className="text-[11px] text-gray-600 dark:text-gray-300 hover:underline disabled:opacity-50"
        >
          Cancel pursuit
        </button>
      </div>
      <div className="px-4 py-4">
        <FlowSteps state={data.state || 'attachments-only'} />
        <div className="mb-3 text-[12px] text-gray-700 dark:text-gray-300 px-2 py-1.5 rounded bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/40">
          <strong>📸 Tip:</strong> for the most accurate readiness checklist, also screenshot the
          portal's <em>Required Information</em> section and drop it in below — AI vision extracts
          the agency's actual submission requirements.
        </div>
        <BonfirePortalScreenshotZone
          opportunityId={opportunityId}
          sourceUrl={data.source_url}
          onExtracted={onUploaded}
        />
        <div className="text-sm text-gray-800 dark:text-gray-100 mb-2">
          <strong>RFP files are uploaded.</strong> Run AI to read them and produce a real readiness checklist
          (bid bonds, prevailing wage, EEO, page limits, etc. — quoted with evidence from the RFP body).
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <button
            type="button"
            disabled={tailoring}
            onClick={onTailor}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {tailoring ? '🤖 Analyzing the RFP…' : '🤖 Tailor with AI'}
          </button>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            ~10–30 seconds · uses gpt-4o-mini
          </span>
        </div>
        <details className="mb-2">
          <summary className="cursor-pointer text-[12px] text-gray-600 dark:text-gray-300">
            Need to add more files?
          </summary>
          <div className="mt-2">
            <BonfireUploadZone
              opportunityId={opportunityId}
              sourceUrl={data.source_url}
              onUploaded={onUploaded}
            />
          </div>
        </details>
      </div>
    </div>
  );
}

function SubmittedCard({ data }) {
  return (
    <div className="mb-4 rounded border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/20">
      <div className="px-4 py-3 border-b border-green-200 dark:border-green-800">
        <span className="text-xs uppercase tracking-wide text-green-900 dark:text-green-100 font-semibold">
          Submission Readiness
        </span>
        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-green-200 text-green-900 dark:bg-green-700 dark:text-green-100">
          ✅ submitted
        </span>
      </div>
      <div className="px-4 py-4 text-sm text-gray-800 dark:text-gray-100">
        This bid was submitted{data.pursuit?.pursued_at && (
          <> on {new Date(data.pursuit.pursued_at).toLocaleDateString()}</>
        )}. The readiness score, attachments, and assembled package are preserved as the historical record.
      </div>
    </div>
  );
}
