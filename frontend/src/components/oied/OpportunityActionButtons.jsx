import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { generateOutput, recordEvent } from '../../services/oiedService';

// Action buttons under each opportunity card. Three classic generators
// (Generate Proposal / Offer / Analyze) plus banner-with-link on success.
//
// `recommendedAction` (from context.recommended_action) lets the caller
// hide buttons that the lifecycle gate would refuse anyway. If the prop
// is undefined we render all three buttons (legacy behavior).

const PROPOSAL_OK_ACTIONS = new Set([
  'generate_proposal', 'monitor', 'skip', undefined, null, '',
]);

function OpportunityActionButtons({
  opportunityId,
  onGenerated,
  compact = false,
  recommendedAction,
}) {
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);

  async function run(type, label) {
    setBusy(true);
    setBanner(null);
    recordEvent(opportunityId, 'clicked', { action: type });
    try {
      const out = await generateOutput(opportunityId, type);
      setBanner({
        kind: 'ok',
        text: `${label} drafted (#${out && out.id ? out.id : 'new'}).`,
        showReviewLink: true,
      });
      if (onGenerated) onGenerated(out);
    } catch (e) {
      const msg = (e && e.response && e.response.data && e.response.data.message) || e.message;
      const errs = e && e.response && e.response.data && e.response.data.errors;
      let extra = '';
      if (errs && errs.status === 'invalid_stage') {
        extra = ` (already past lifecycle stage: ${errs.requires || 'submitted'}). Use Mark Outcome instead.`;
      } else if (errs && errs.status === 'needs_context' && Array.isArray(errs.missing_fields)) {
        extra = ` Missing: ${errs.missing_fields.join(', ')}.`;
      }
      setBanner({ kind: 'err', text: `${label} failed: ${msg}${extra}` });
    } finally {
      setBusy(false);
    }
  }

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition disabled:opacity-50';
  const variant = compact
    ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
    : 'bg-blue-600 text-white hover:bg-blue-700';

  // v2 of this component: hide proposal/offer/analyze when the lifecycle
  // gate or v9 execution_mode would block them server-side. Keeps Ali
  // from clicking buttons that 400.
  const proposalOk = PROPOSAL_OK_ACTIONS.has(recommendedAction);
  const showAnalyze = true; // analyze never modifies lifecycle, always available

  return (
    <div className="flex flex-wrap items-center gap-2">
      {proposalOk && (
        <>
          <button type="button" disabled={busy} onClick={() => run('proposal', 'Proposal')}
            className={`${btn} ${variant}`} data-testid="generate-proposal-btn">
            ✍️ Generate Proposal
          </button>
          <button type="button" disabled={busy} onClick={() => run('offer', 'Offer')}
            className={`${btn} ${variant}`} data-testid="generate-offer-btn">
            🤝 Generate Offer
          </button>
        </>
      )}
      {!proposalOk && recommendedAction && (
        <span className="text-xs px-2 py-1 rounded bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" data-testid="lifecycle-blocked-note">
          Generation locked: lifecycle stage is <strong>{recommendedAction}</strong>.
        </span>
      )}
      {showAnalyze && (
        <button type="button" disabled={busy} onClick={() => run('analysis', 'Analysis')}
          className={`${btn} ${variant}`} data-testid="generate-analysis-btn">
          🔍 Analyze Opportunity
        </button>
      )}
      {banner && (
        <span className={`text-xs px-2 py-1 rounded inline-flex items-center gap-2 ${
          banner.kind === 'ok'
            ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
            : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200'
        }`}
        data-testid={`action-banner-${banner.kind}`}>
          {banner.text}
          {banner.showReviewLink && (
            <Link
              to="/admin/opportunities/review"
              className="underline font-semibold hover:text-green-900 dark:hover:text-green-100"
            >
              Review Queue →
            </Link>
          )}
        </span>
      )}
    </div>
  );
}

export default OpportunityActionButtons;
