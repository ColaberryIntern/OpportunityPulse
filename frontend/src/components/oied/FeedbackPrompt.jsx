import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPendingOutcomes } from '../../services/oiedService';

const SNOOZE_KEY = 'oied_feedback_snooze_until';

function isSnoozed() {
  try {
    const until = localStorage.getItem(SNOOZE_KEY);
    if (!until) return false;
    return Date.now() < new Date(until).getTime();
  } catch {
    return false;
  }
}

function snoozeForADay() {
  try {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
    localStorage.setItem(SNOOZE_KEY, until.toISOString());
  } catch { /* localStorage quota — ignore */ }
}

// Dismissible banner shown on the briefing page when there are
// opportunities submitted >7 days ago without an outcome. Encourages
// the admin to feed the win-probability learning loop.
function FeedbackPrompt() {
  const [pending, setPending] = useState([]);
  const [hidden, setHidden] = useState(isSnoozed());

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    (async () => {
      try {
        const out = await getPendingOutcomes();
        if (!cancelled) setPending(out.pending || []);
      } catch { /* best effort */ }
    })();
    return () => { cancelled = true; };
  }, [hidden]);

  if (hidden || pending.length === 0) return null;

  return (
    <div
      className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4 flex items-start justify-between gap-3"
      data-testid="feedback-prompt"
    >
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
          🔔 Mark outcomes for submitted opportunities
        </div>
        <div className="text-sm text-amber-900 dark:text-amber-100">
          You have <strong>{pending.length}</strong> opportunit{pending.length === 1 ? 'y' : 'ies'} submitted
          more than 7 days ago without a recorded outcome. Win-probability calibration
          improves as you mark them.
        </div>
        <ul className="text-xs text-amber-800 dark:text-amber-300 mt-2 list-disc list-inside">
          {pending.slice(0, 3).map((p) => (
            <li key={p.opportunity_id}>
              {p.title} <span className="text-amber-600 dark:text-amber-400">(submitted {p.days_since}d ago)</span>
            </li>
          ))}
          {pending.length > 3 && <li>… and {pending.length - 3} more</li>}
        </ul>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <Link
          to="/admin/opportunities/recommendations"
          className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm hover:bg-amber-700 text-center"
          data-testid="feedback-mark-btn"
        >
          Mark them now
        </Link>
        <button
          type="button"
          onClick={() => { snoozeForADay(); setHidden(true); }}
          className="px-3 py-1.5 rounded border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-sm hover:bg-amber-100 dark:hover:bg-amber-900/40"
          data-testid="feedback-snooze-btn"
        >
          Snooze 1 day
        </button>
      </div>
    </div>
  );
}

export default FeedbackPrompt;
