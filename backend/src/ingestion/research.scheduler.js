// Research Intelligence Phase 2.4 — per-source ingestion tick loop.
//
// The single daily ingestion runner (scheduler.js) still runs every enabled
// source once a day. This tick loop adds *higher-cadence* runs for sources
// that set `ingest_interval_minutes` — arXiv every 2h, HuggingFace every 6h,
// etc. — without touching the daily-runner behavior for the other ~20 sources.
//
// Design: one cron firing every TICK_MINUTES. Each tick, load enabled sources
// with a non-null ingest_interval_minutes, run the ones where
// `now - last_run_at >= ingest_interval_minutes`. runIngestion already stamps
// last_run_at, so the loop is self-pacing and restart-safe (a missed tick
// just runs the source on the next one).

const cron = require('node-cron');
const logger = require('../logging/logger');

let schedulerStarted = false;

// How often the loop wakes up to check what's due. 30 min is fine-grained
// enough for 2h+ intervals and cheap (one indexed query per tick).
const TICK_MINUTES = Number(process.env.RESEARCH_TICK_MINUTES) || 30;

async function runDueSources() {
  // eslint-disable-next-line global-require
  const { DataSource } = require('../models');
  // eslint-disable-next-line global-require
  const { Op } = require('sequelize');
  // eslint-disable-next-line global-require
  const { runIngestion } = require('./ingestion.service');

  const sources = await DataSource.findAll({
    where: {
      enabled: true,
      ingestIntervalMinutes: { [Op.ne]: null },
    },
  });

  const now = Date.now();
  const due = sources.filter((s) => {
    if (!s.lastRunAt) return true; // never run → due
    const elapsedMin = (now - new Date(s.lastRunAt).getTime()) / 60000;
    return elapsedMin >= s.ingestIntervalMinutes;
  });

  if (due.length === 0) {
    logger.debug('research tick: nothing due', { checked: sources.length });
    return { checked: sources.length, ran: 0 };
  }

  let ran = 0;
  for (const source of due) {
    try {
      const result = await runIngestion(source.name);
      ran += 1;
      logger.info('research tick: ingested', {
        source: source.name,
        intervalMin: source.ingestIntervalMinutes,
        created: result.recordsCreated,
        updated: result.recordsUpdated,
      });
    } catch (error) {
      logger.error('research tick: ingestion failed', { source: source.name, error: error.message });
      // Continue — one bad source doesn't block the others.
    }
  }
  return { checked: sources.length, ran };
}

function startResearchScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  // Tick every TICK_MINUTES.
  cron.schedule(`*/${TICK_MINUTES} * * * *`, async () => {
    try {
      const { checked, ran } = await runDueSources();
      if (ran > 0) logger.info('research tick complete', { checked, ran });
    } catch (error) {
      logger.error('research tick failed', { error: error.message });
    }
  });

  logger.info(`Research scheduler started — per-source tick every ${TICK_MINUTES}m`);
}

module.exports = { startResearchScheduler, runDueSources, TICK_MINUTES };
