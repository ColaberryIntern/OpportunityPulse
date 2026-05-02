import React, { useState } from 'react';
import { generateOutput, recordEvent } from '../../services/oiedService';

// Three buttons under each opportunity card: Generate Proposal / Offer /
// Analyze. Each fires the OIED generator and tracks a 'clicked' + 'generated'
// event. On success, banner shows the output id + a link to the review queue.

function OpportunityActionButtons({ opportunityId, onGenerated, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);

  async function run(type, label) {
    setBusy(true);
    setBanner(null);
    recordEvent(opportunityId, 'clicked', { action: type });
    try {
      const out = await generateOutput(opportunityId, type);
      setBanner({ kind: 'ok', text: `${label} drafted. Review at /admin/opportunities/review` });
      if (onGenerated) onGenerated(out);
    } catch (e) {
      setBanner({ kind: 'err', text: `${label} failed: ${e?.response?.data?.message || e.message}` });
    } finally {
      setBusy(false);
    }
  }

  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition disabled:opacity-50';
  const variant = compact
    ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
    : 'bg-blue-600 text-white hover:bg-blue-700';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => run('proposal', 'Proposal')}
        className={`${btn} ${variant}`} data-testid="generate-proposal-btn">
        ✍️ Generate Proposal
      </button>
      <button type="button" disabled={busy} onClick={() => run('offer', 'Offer')}
        className={`${btn} ${variant}`} data-testid="generate-offer-btn">
        🤝 Generate Offer
      </button>
      <button type="button" disabled={busy} onClick={() => run('analysis', 'Analysis')}
        className={`${btn} ${variant}`} data-testid="generate-analysis-btn">
        🔍 Analyze Opportunity
      </button>
      {banner && (
        <span className={`text-xs px-2 py-1 rounded ${
          banner.kind === 'ok'
            ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
            : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200'
        }`}>
          {banner.text}
        </span>
      )}
    </div>
  );
}

export default OpportunityActionButtons;
