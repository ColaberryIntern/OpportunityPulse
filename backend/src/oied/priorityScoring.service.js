// Priority Engine — turns the deterministic fit score + opportunity timing
// + revenue/effort tradeoff into a single 0-100 priority and a bucket label
// the UI uses to group rows.
//
// Buckets:
//   🔥 act_now     priority >= 80 OR urgency >= 90
//   💰 high_value  revenue_weight >= 16 (>=$500k, gated on fit >= 50)
//   ⚡ quick_win   ease_of_entry >= 7 + automation_score >= 11 + close <=30d
//   (anything else → 'standard')
//
// Formula: priorityScore = 0.5 × fit + 0.3 × urgency + 0.2 × revenueVelocity.

function urgencyFromCloseDate(closeDate, now = new Date()) {
  if (!closeDate) return 30; // unknown deadline → mild urgency floor
  const d = new Date(closeDate);
  if (Number.isNaN(d.getTime())) return 30;
  const days = Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return 0;       // already closed
  if (days <= 7)  return 100;
  if (days <= 14) return 85;
  if (days <= 30) return 65;
  if (days <= 60) return 45;
  if (days <= 90) return 25;
  return 10;
}

// Revenue velocity (0-100): high value × low effort. We approximate effort
// from the AI breakdown — high automation + ease both reduce effort. Pure
// fall-back to revenue_weight when AI components are absent.
function revenueVelocity({ revenue_weight = 0, automation_score = 0, ease_of_entry = 0 }) {
  // Normalize each component to 0-1 then combine.
  const rev = Math.min(1, (revenue_weight || 0) / 20);
  const eff = Math.min(1, ((automation_score || 0) / 15) * 0.6 + ((ease_of_entry || 0) / 10) * 0.4);
  return Math.round(((rev * 0.6) + (eff * 0.4)) * 100);
}

function bucketFor({ priority, urgency, fit, breakdown }) {
  if (priority >= 80 || urgency >= 90) return 'act_now';
  if ((breakdown.revenue_weight || 0) >= 16 && fit >= 50) return 'high_value';
  const easeHi = (breakdown.ease_of_entry || 0) >= 7;
  const autoHi = (breakdown.automation_score || 0) >= 11;
  if (easeHi && autoHi && urgency >= 65) return 'quick_win';
  return 'standard';
}

function calculatePriorityScore({ opportunity, fitScore, breakdown = {}, now = new Date() }) {
  const fit = Math.max(0, Math.min(100, Number(fitScore) || 0));
  const urgency = urgencyFromCloseDate(opportunity && opportunity.expiresAt, now);
  const velocity = revenueVelocity(breakdown);
  const priority = Math.round(0.5 * fit + 0.3 * urgency + 0.2 * velocity);
  const bucket = bucketFor({ priority, urgency, fit, breakdown });
  return {
    priorityScore: Math.max(0, Math.min(100, priority)),
    urgency,
    revenueVelocity: velocity,
    bucket,
  };
}

module.exports = {
  calculatePriorityScore,
  urgencyFromCloseDate,
  revenueVelocity,
  bucketFor,
};
