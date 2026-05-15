import React, { useState, useCallback } from 'react';
import { getOpportunityContextTrace } from '../../services/deepResearchService';

// Deep Research Phase 7.5 — Per-opportunity traceability panel.
//
// Expandable row addendum shown inside My Opportunities (and anywhere an
// opportunity is rendered with the optional traceability prop). On expand,
// lazily fetches the insight links via /context/opportunity/:id/trace and
// renders each as a small evidence row.

const CONTRIBUTION_LABEL = {
  direct_link: 'Direct link',
  cluster_classification: 'Cluster classification',
  report_source: 'Report source',
  pattern_match: 'Pattern match',
  graph_edge: 'Graph edge',
  manual: 'Manually linked',
};

const INSIGHT_KIND_LABEL = {
  venture: 'Venture',
  cluster: 'Strategic cluster',
  recommendation: 'Strategic recommendation',
  intervention: 'Executive intervention',
  research_run: 'Custom research run',
  pursuit: 'Pursuit workspace',
  pattern: 'Strategic pattern',
};

export default function OpportunityTraceabilityPanel({ opportunityId, contextKind, contextId }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const handleExpand = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && rows == null && !loading) {
      setLoading(true); setErr(null);
      try {
        const data = await getOpportunityContextTrace(opportunityId, {
          kind: contextKind, id: contextId,
        });
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e?.response?.data?.message || e.message || 'Failed to load traceability');
      } finally { setLoading(false); }
    }
  }, [open, rows, loading, opportunityId, contextKind, contextId]);

  return (
    <div className="mt-2" data-testid={`trace-panel-${opportunityId}`}>
      <button
        type="button"
        onClick={handleExpand}
        className="text-[11px] text-cyan-700 hover:underline inline-flex items-center gap-1"
      >
        {open ? '▾' : '▸'} Why this opportunity appears
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-cyan-200 bg-cyan-50/50 p-3 text-xs">
          {loading && <p className="text-gray-500 italic">Loading evidence…</p>}
          {err && <p className="text-red-700">{err}</p>}
          {!loading && !err && rows && rows.length === 0 && (
            <p className="text-gray-500 italic">
              No persisted traceability rows for this opportunity yet — the strategic context
              referenced this opportunity through a derived link.
            </p>
          )}
          {!loading && !err && rows && rows.length > 0 && (
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <li key={r.id} className="leading-snug">
                  <span className="font-semibold text-gray-900">
                    {INSIGHT_KIND_LABEL[r.insightKind] || r.insightKind}
                    {' #'}{r.insightId}
                  </span>
                  <span className="text-gray-600 mx-1">·</span>
                  <span className="text-gray-700">
                    relevance {Math.round(Number(r.relevance) || 0)}
                  </span>
                  <span className="text-gray-600 mx-1">·</span>
                  <span className="text-gray-600 italic">
                    {CONTRIBUTION_LABEL[r.contribution] || r.contribution}
                  </span>
                  {r.reasoning && (
                    <p className="text-gray-600 mt-0.5">{r.reasoning}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
