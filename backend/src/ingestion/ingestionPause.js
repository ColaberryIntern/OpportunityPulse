/**
 * Single source of truth for "scheduled ingestion is paused".
 *
 * WHY THIS EXISTS
 * `INGESTION_SCHEDULER_ENABLED=false` originally gated only the generic daily
 * ingestion scheduler. It did not cover the other schedulers that also ingest,
 * so a release could assert "ingestion disabled", pass, and still ingest:
 *
 *   - ingestion/scheduler.js        generic sources, daily cron        (was gated)
 *   - freelance/freelance.scheduler each 4h PLUS 15s after startup     (was NOT gated)
 *   - ingestion/research.scheduler  arxiv/huggingface/blogs, 30m tick  (was NOT gated)
 *
 * Observed in production on 2026-10-01: a release rolled out with the flag
 * unset, and `freelancer_api` ingested 19 seconds later from the freelance
 * scheduler's startup timer — not from the generic scheduler at all.
 *
 * Only the exact string 'false' pauses, so a typo or an unset variable cannot
 * silently stop ingestion. Default remains enabled.
 */
function isIngestionPaused() {
  return String(process.env.INGESTION_SCHEDULER_ENABLED || '').toLowerCase() === 'false';
}

module.exports = { isIngestionPaused };
