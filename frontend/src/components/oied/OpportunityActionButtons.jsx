import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { generateOutput, recordEvent } from '../../services/oiedService';

// Action buttons under each opportunity card. Generators are now gated
// on BOTH lifecycle (`recommendedAction`) AND opportunity type (`oppType`).
// Type gating (v9.8.2):
//   ai_news (News)        — analyze only. Proposals/offers/resumes are
//                           nonsensical for informational news rows.
//   investment (Capital)  — analyze only. Same reasoning: capital-news
//                           is research material, not a bid surface.
//   ai_job (Talent)       — analyze + resume. Replaces proposal/offer
//                           with a resume tailored to the job posting.
//   everything else       — analyze + proposal + offer (legacy).

const PROPOSAL_OK_ACTIONS = new Set([
  'generate_proposal', 'monitor', 'skip', undefined, null, '',
]);

// Types where proposal/offer make no sense — there's nothing to bid on.
const NO_BID_TYPES = new Set(['ai_news', 'investment']);

// Types where a resume is the right tailored output instead of a proposal.
const RESUME_TYPES = new Set(['ai_job']);

function OpportunityActionButtons({
  opportunityId,
  oppType,
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

  // Lifecycle gate (v2): hide proposal/offer when server-side stage gate
  // would refuse. Type gate (v9.8.2): also suppress for non-bidable types.
  const lifecycleOk = PROPOSAL_OK_ACTIONS.has(recommendedAction);
  const isNoBid = NO_BID_TYPES.has(oppType);
  const isResumeType = RESUME_TYPES.has(oppType);
  const showProposalOffer = lifecycleOk && !isNoBid && !isResumeType;
  const showResume = lifecycleOk && isResumeType;
  const showAnalyze = true; // analyze never modifies lifecycle, always available

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showProposalOffer && (
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
      {showResume && (
        <button type="button" disabled={busy} onClick={() => run('resume', 'Resume')}
          className={`${btn} ${variant}`} data-testid="generate-resume-btn">
          📄 Tailor Resume
        </button>
      )}
      {!lifecycleOk && recommendedAction && !isNoBid && (
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
