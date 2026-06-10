// Channel-level freshness check.
//
// Why this exists: the per-source health agent (sourceHealthAgent) only sees
// individual sources. The Capital Deployments outage in Feb–Jun 2026 slipped
// past it because funding_news never went "failing" (its dead feed errored
// per-feed and was swallowed) and never went strictly "zero_yield" (a low-
// volume backup feed produced a trickle of off-topic rows). The SURFACE was
// dead — newest capital row was 4 months old — but no SOURCE looked broken.
//
// This module asks the question the per-source view can't: "for each channel,
// has anything new actually landed recently?" A channel whose freshest
// ingested row is older than the threshold is flagged regardless of how its
// individual sources look. That signal would have fired in February.

const { Op } = require('sequelize');
const { Opportunity } = require('../models');
const { listChannels } = require('../oied/channels.service');

const DEFAULT_STALE_DAYS = Number(process.env.OIED_CHANNEL_STALE_DAYS || 14);

/**
 * For every channel, compute the most recently ingested row and how many rows
 * landed in the staleness window, then flag channels that are stale.
 * Uses created_at (ingestion time) as the freshness signal — the broken state
 * was "we stopped ingesting anything new," which published_at can't detect
 * because a re-ingested old row keeps its old announcement date.
 *
 * @param {object} [opts]
 * @param {number} [opts.staleDays] - Age threshold in days.
 * @param {Date} [opts.now] - Reference time (injectable for tests).
 * @returns {Promise<{ stale: Array, fresh: Array, stale_days: number }>}
 */
async function checkChannelFreshness({ staleDays = DEFAULT_STALE_DAYS, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - staleDays * 86_400_000);
  const channels = listChannels();
  const stale = [];
  const fresh = [];

  for (const ch of channels) {
    if (!Array.isArray(ch.types) || ch.types.length === 0) continue;

    // eslint-disable-next-line no-await-in-loop
    const newest = await Opportunity.findOne({
      where: { type: { [Op.in]: ch.types }, status: 'active' },
      order: [['created_at', 'DESC']],
      attributes: ['createdAt', 'publishedAt', 'source'],
    });
    // eslint-disable-next-line no-await-in-loop
    const freshCount = await Opportunity.count({
      where: {
        type: { [Op.in]: ch.types },
        status: 'active',
        createdAt: { [Op.gte]: cutoff },
      },
    });

    const newestAt = newest ? newest.createdAt : null;
    const ageDays = newestAt
      ? Math.round((now.getTime() - new Date(newestAt).getTime()) / 86_400_000)
      : null;

    const row = {
      key: ch.key,
      label: ch.label,
      newest_created_at: newestAt ? new Date(newestAt).toISOString() : null,
      newest_published_at: newest && newest.publishedAt
        ? new Date(newest.publishedAt).toISOString() : null,
      age_days: ageDays,
      rows_in_window: freshCount,
      stale_days: staleDays,
    };

    if (freshCount === 0) {
      row.action = newestAt
        ? `No new ${ch.label} rows in ${staleDays} days (newest is ${ageDays}d old). Probe this channel's sources — a feed may be dead or producing off-topic rows that don't rank.`
        : `No active ${ch.label} rows at all. Channel sources are not producing — check ingestion + source config.`;
      stale.push(row);
    } else {
      fresh.push(row);
    }
  }

  return { stale, fresh, stale_days: staleDays };
}

module.exports = { checkChannelFreshness, DEFAULT_STALE_DAYS };
