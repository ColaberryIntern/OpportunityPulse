// OIED v9.9 — Data Source Health page backend.
//
// Provides:
//   GET  /api/v1/admin/data-sources/health
//        Roll-up of every data source: last run, last error, recent
//        record counts, 14-day trend, and a derived status.
//   POST /api/v1/admin/data-sources/:name/run
//        On-demand ingest trigger. Reuses ingestion.service.runIngestion.
//
// Status derivation (priority order, first match wins):
//   disabled    → enabled === false
//   failing     → last run status = 'failed', or 2 of last 3 runs had errors
//   stale       → no successful run in > STALE_HOURS (default 48)
//   zero_yield  → 3+ consecutive successful runs with recordsCreated === 0
//   healthy     → otherwise
//
// "Next run" is computed from INGESTION_SCHEDULE (single master cron —
// the ingestion scheduler iterates every enabled source per fire).

const { Op } = require('sequelize');
const logger = require('../logging/logger');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { DataSource, IngestionLog, Opportunity, sequelize } = require('../models');
const channelsSvc = require('../oied/channels.service');
const ingestionSvc = require('../ingestion/ingestion.service');

const STALE_HOURS = 48;
const ZERO_YIELD_RUNS = 3;     // consecutive zero-create runs to flag zero_yield
const RECENT_LOG_LOOKBACK = 30; // pull last N logs per source for trend + zero-yield walk
const TREND_DAYS = 14;
const DEFAULT_CRON = '0 6 * * *';

// Minimal cron-next-fire scanner. Handles the cron features actually in
// use in this repo: lists (5,17), ranges (1-4), step (*/5), wildcards.
// Brute-forces minute-by-minute over the next 8 days — trivial cost for
// a single admin endpoint, no extra dependency. Returns ISO string or null.
function nextCronFire(expr, fromMs = Date.now()) {
  if (!expr) return null;
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minP, hourP, domP, monP, dowP] = parts;

  const matches = (val, pattern) => {
    if (pattern === '*') return true;
    for (const seg of pattern.split(',')) {
      const stepMatch = seg.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
      if (stepMatch) {
        const step = Number(stepMatch[2]);
        const baseToken = stepMatch[1];
        if (baseToken === '*') {
          if (val % step === 0) return true;
          continue;
        }
        const [lo, hi] = baseToken.includes('-') ? baseToken.split('-').map(Number) : [Number(baseToken), Infinity];
        if (val >= lo && val <= hi && (val - lo) % step === 0) return true;
        continue;
      }
      const rangeMatch = seg.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) {
        const lo = Number(rangeMatch[1]);
        const hi = Number(rangeMatch[2]);
        if (val >= lo && val <= hi) return true;
        continue;
      }
      if (/^\d+$/.test(seg) && Number(seg) === val) return true;
    }
    return false;
  };

  const start = Math.ceil(fromMs / 60_000) * 60_000;
  for (let i = 1; i < 60 * 24 * 8; i += 1) {
    const t = new Date(start + i * 60_000);
    if (
      matches(t.getUTCMinutes(), minP)
      && matches(t.getUTCHours(), hourP)
      && matches(t.getUTCDate(), domP)
      && matches(t.getUTCMonth() + 1, monP)
      && matches(t.getUTCDay(), dowP)
    ) {
      return t.toISOString();
    }
  }
  return null;
}

// Source-name → channel key. Derived from a single GROUP BY query so it
// reflects what's actually in the DB rather than a hand-maintained map.
async function buildSourceChannelMap() {
  const rows = await Opportunity.findAll({
    attributes: ['type', 'source'],
    group: ['type', 'source'],
    raw: true,
  });
  const map = new Map();
  for (const r of rows) {
    if (!r.source) continue;
    const ch = channelsSvc.getChannelForOpp({ type: r.type, source: r.source });
    if (!map.has(r.source) || map.get(r.source).key === 'unknown') {
      map.set(r.source, { key: ch.key, label: ch.label });
    }
  }
  return map;
}

function deriveStatus(source, recentLogs) {
  if (!source.enabled) return 'disabled';
  if (recentLogs.length === 0) {
    // Enabled but never ran — treat as stale.
    return 'stale';
  }
  const last = recentLogs[0];
  if (last.status === 'failed') return 'failing';

  // 2 of last 3 runs had errors → failing
  const last3 = recentLogs.slice(0, 3);
  const errCount = last3.filter((l) => l.status === 'failed' || (Array.isArray(l.errors) && l.errors.length > 0)).length;
  if (errCount >= 2) return 'failing';

  // Stale: no successful run in > STALE_HOURS
  const lastSuccess = recentLogs.find((l) => l.status === 'success' || l.status === 'partial');
  if (!lastSuccess) return 'failing';
  const ageHours = (Date.now() - new Date(lastSuccess.startedAt).getTime()) / 3_600_000;
  if (ageHours > STALE_HOURS) return 'stale';

  // Zero-yield: ZERO_YIELD_RUNS consecutive successful runs with 0 created
  let zeroStreak = 0;
  for (const l of recentLogs) {
    if (l.status !== 'success' && l.status !== 'partial') break;
    if ((l.recordsCreated || 0) > 0) break;
    zeroStreak += 1;
    if (zeroStreak >= ZERO_YIELD_RUNS) return 'zero_yield';
  }

  return 'healthy';
}

function summarize(rows) {
  const out = { healthy: 0, stale: 0, zero_yield: 0, failing: 0, disabled: 0 };
  for (const r of rows) {
    if (out[r.status] != null) out[r.status] += 1;
  }
  return out;
}

// Build a 14-day trend (rows created per day) per source. Single grouped
// query using date_trunc; cheap because it scans recent ingestion_logs.
async function buildTrendMap() {
  const since = new Date(Date.now() - TREND_DAYS * 86_400_000);
  const rows = await IngestionLog.findAll({
    attributes: [
      'dataSourceId',
      [sequelize.fn('date_trunc', 'day', sequelize.col('started_at')), 'day'],
      [sequelize.fn('SUM', sequelize.col('records_created')), 'created'],
    ],
    where: { startedAt: { [Op.gte]: since } },
    group: ['dataSourceId', sequelize.fn('date_trunc', 'day', sequelize.col('started_at'))],
    raw: true,
  });
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.dataSourceId)) map.set(r.dataSourceId, []);
    map.get(r.dataSourceId).push({
      date: new Date(r.day).toISOString().slice(0, 10),
      created: Number(r.created) || 0,
    });
  }
  // Pad to 14 days, oldest → newest, zero-fill missing days.
  const today = new Date();
  for (const [k, days] of map.entries()) {
    const byDate = new Map(days.map((d) => [d.date, d.created]));
    const padded = [];
    for (let i = TREND_DAYS - 1; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      padded.push({ date: key, created: byDate.get(key) || 0 });
    }
    map.set(k, padded);
  }
  return map;
}

async function getDataSourcesHealth(req, res) {
  try {
    const cronExpr = process.env.INGESTION_SCHEDULE || DEFAULT_CRON;
    const sources = await DataSource.findAll({ raw: true, order: [['name', 'ASC']] });

    const ids = sources.map((s) => s.id);
    const [logs, sourceChannelMap, trendMap] = await Promise.all([
      ids.length === 0 ? [] : IngestionLog.findAll({
        where: { dataSourceId: { [Op.in]: ids } },
        order: [['startedAt', 'DESC']],
        limit: ids.length * RECENT_LOG_LOOKBACK,
      }),
      buildSourceChannelMap(),
      buildTrendMap(),
    ]);

    // Group logs by data_source_id (already DESC by startedAt globally,
    // but we still need to slice per-source after grouping).
    const logsByDs = new Map();
    for (const l of logs) {
      const ds = l.dataSourceId;
      if (!logsByDs.has(ds)) logsByDs.set(ds, []);
      const arr = logsByDs.get(ds);
      if (arr.length < RECENT_LOG_LOOKBACK) arr.push(l);
    }

    const since24h = new Date(Date.now() - 24 * 3_600_000);
    const since7d = new Date(Date.now() - 7 * 86_400_000);
    const since30d = new Date(Date.now() - 30 * 86_400_000);

    const sourceRows = sources.map((s) => {
      const dsLogs = (logsByDs.get(s.id) || []);
      const last = dsLogs[0] || null;
      // errors[] entries can be either plain strings or structured
      // {message, status, ...} objects depending on the adapter. Render
      // a stable readable string for either shape.
      const formatError = (e) => {
        if (e == null) return null;
        if (typeof e === 'string') return e;
        if (typeof e === 'object') {
          const parts = [];
          if (e.message)   parts.push(String(e.message));
          if (e.code)      parts.push(`(${e.code})`);
          if (e.status && !e.message) parts.push(`status=${e.status}`);
          if (e.url)       parts.push(`url=${e.url}`);
          if (parts.length === 0) {
            try { return JSON.stringify(e); } catch (_) { return String(e); }
          }
          return parts.join(' ');
        }
        return String(e);
      };
      const lastError = last && Array.isArray(last.errors) && last.errors.length > 0
        ? formatError(last.errors[0]).slice(0, 240)
        : null;
      // Roll up created counts over 24h/7d/30d from the recent log slice.
      const sumCreated = (sinceDate) => dsLogs
        .filter((l) => new Date(l.startedAt) >= sinceDate)
        .reduce((acc, l) => acc + (l.recordsCreated || 0), 0);

      // Walk back to count consecutive zero-create runs.
      let consecZero = 0;
      for (const l of dsLogs) {
        if (l.status !== 'success' && l.status !== 'partial') break;
        if ((l.recordsCreated || 0) > 0) break;
        consecZero += 1;
      }

      const status = deriveStatus(s, dsLogs);
      const channel = sourceChannelMap.get(s.name) || { key: 'unknown', label: 'Unknown' };
      const trend = trendMap.get(s.id) || [];
      // Even if a source has no logs in the window, ensure padded trend exists.
      const trendOrEmpty = trend.length > 0 ? trend : Array.from({ length: TREND_DAYS }, (_, i) => {
        const d = new Date(Date.now() - (TREND_DAYS - 1 - i) * 86_400_000);
        return { date: d.toISOString().slice(0, 10), created: 0 };
      });

      return {
        id: s.id,
        name: s.name,
        type: s.type,
        channel,
        enabled: !!s.enabled,
        schedule: s.schedule || null,
        last_run_at: last ? last.startedAt : null,
        last_run_status: last ? last.status : null,
        last_run_error: lastError,
        last_run: last ? {
          fetched: last.recordsFetched || 0,
          created: last.recordsCreated || 0,
          updated: last.recordsUpdated || 0,
          skipped: last.recordsSkipped || 0,
          duration_ms: last.completedAt
            ? new Date(last.completedAt).getTime() - new Date(last.startedAt).getTime()
            : null,
        } : null,
        rows_24h: sumCreated(since24h),
        rows_7d:  sumCreated(since7d),
        rows_30d: sumCreated(since30d),
        trend_14d: trendOrEmpty,
        consecutive_zero_runs: consecZero,
        status,
        last_run_id: last ? last.id : null,
      };
    });

    return successResponse(res, {
      ingestion_cron: cronExpr,
      next_run_at: nextCronFire(cronExpr),
      summary: summarize(sourceRows),
      sources: sourceRows,
    });
  } catch (e) {
    logger.error('admin.dataSourcesHealth failed', { error: e.message, stack: e.stack });
    return errorResponse(res, 'Failed to load data source health: ' + e.message, 500);
  }
}

async function runDataSource(req, res) {
  try {
    const name = String(req.params.name || '').trim();
    if (!name) return errorResponse(res, 'name is required', 400);
    const ds = await DataSource.findOne({ where: { name } });
    if (!ds) return errorResponse(res, `Unknown data source: ${name}`, 404);
    const result = await ingestionSvc.runIngestion(name);
    return successResponse(res, result);
  } catch (e) {
    logger.error('admin.runDataSource failed', { error: e.message, stack: e.stack });
    return errorResponse(res, 'Manual ingestion failed: ' + e.message, 500);
  }
}

module.exports = {
  getDataSourcesHealth,
  runDataSource,
  // Exported for tests
  nextCronFire,
  deriveStatus,
};
