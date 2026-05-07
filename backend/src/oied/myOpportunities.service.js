// "My Opportunities" — backed by the unified opportunities table, scored
// against the calling user's profile (profile.getOrDefault if none exists),
// then sorted by priority_score DESC (falls back to fit_score).

const { Op } = require('sequelize');
const { Opportunity, OpportunityFitScore } = require('../models');
const { getOrCreateFitScore, profileHash } = require('./fitScoring.service');
const { calculatePriorityScore } = require('./priorityScoring.service');
const profileSvc = require('./profile.service');
const { estimateEffort } = require('./effortEstimator.service');
const channelsSvc = require('./channels.service');

const MIN_VALUE_USD = 1000;

// Allowed sort keys + how each maps to the SQL candidate-pool ordering
// AND the in-memory scored-array ordering. `priority` is the default
// (highest-score-first); `newest`/`oldest` use createdAt — when the row
// landed in our DB, which is what Ali means by "the date it got pulled,
// configured or added to the system".
const SORT_OPTIONS = {
  priority: { sql: [['updatedAt', 'DESC']], rank: (a, b) => (b.priorityScore || 0) - (a.priorityScore || 0) || (b.fitScore || 0) - (a.fitScore || 0) },
  newest:   { sql: [['createdAt', 'DESC']], rank: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) },
  oldest:   { sql: [['createdAt', 'ASC']],  rank: (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) },
};

async function listMyOpportunities({
  limit = 50,
  offset = 0,
  type,
  channel,           // v9.4: filter to one channel's types at SQL level
  sort = 'priority', // v9.4: 'priority' (default) | 'newest' | 'oldest'
  q,                 // v9.5: keyword filter (title/description ILIKE)
  minScore,
  userId,           // who's asking — resolved to org via profile.service
  organizationId,   // explicit org override (multi-tenant callers)
} = {}) {
  const orgId = organizationId || await profileSvc.resolveOrgId(userId);
  const userProfile = await profileSvc.getOrDefaultByOrg(orgId);

  // The default cross-channel view applies a $1k value floor to keep
  // noise out (most channels have a real bid value). Strategic Bonfire
  // rows carry their value in a multi-field jsonb that's often unset,
  // so they get a carve-out.
  //
  // When a specific channel is requested, the value floor is dropped:
  // private-sector (news) and talent (job postings) both have null
  // value as a matter of course — they're signal channels, not bid
  // surfaces — and Ali asked for the channel explicitly, so we should
  // return every row in it.
  const where = {
    status: 'active',
  };
  // Apply the $1k value floor only on the default cross-channel view.
  // Channel-explicit and keyword-explicit views drop the floor — Ali
  // asked for them, ai_news / talent rows have null value by nature,
  // and excluding them defeats the point of cross-channel search.
  if (!channel && !q) {
    where[Op.or] = [
      { value: { [Op.gte]: MIN_VALUE_USD } },
      { type: 'bonfire_strategic' },
    ];
  }
  if (type) where.type = type;

  // v9.4 channel filter: when supplied, restrict candidates to that
  // channel's (type) set at SQL time. Without this, the candidate pool
  // (limit 2000, ordered by updatedAt) is dominated by high-velocity
  // sources like freelance / ai_news, and a smaller channel's rows
  // never make it into the pool — so a client-side filter returns
  // empty even though the channel has hundreds of rows in the DB.
  if (channel) {
    const ch = channelsSvc.whereForChannel(channel);
    if (ch && ch.types.length > 0) {
      where.type = { [Op.in]: ch.types };
    }
  }

  // v9.5/v9.8: keyword filter. Single token does title OR description
  // ILIKE. Comma-separated tokens (e.g. "healthcare,compliance") are
  // ANDed — every token must appear in title or description. This is
  // how the drill-down sub-cloud refines a parent keyword to a sub-topic
  // without losing the parent constraint.
  const qTokens = q && String(q).trim()
    ? String(q).split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  if (qTokens.length > 0) {
    where[Op.and] = [
      ...(Array.isArray(where[Op.and]) ? where[Op.and] : []),
      ...qTokens.map((tok) => {
        const needle = `%${tok}%`;
        return {
          [Op.or]: [
            { title:       { [Op.iLike]: needle } },
            { description: { [Op.iLike]: needle } },
          ],
        };
      }),
    ];
  }

  // When filtering by channel, pull 500 candidates from THAT channel.
  // Without channel filter, keep the 2000-row default pool to drive the
  // broad scoring sweep.
  const candidatePool = channel ? 500 : 2000;
  const sortConfig = SORT_OPTIONS[sort] || SORT_OPTIONS.priority;

  // v9.7: when a keyword filter is active and no channel is pinned, do
  // ONE candidate query per channel (~80 rows each) and union them.
  // Without this, recently-updated news/freelance dominate the global
  // candidate window and matches in capital / talent / strategic never
  // show up on page 1 for cross-channel keyword searches. Word-cloud
  // click-through is the canonical caller — a click on "healthcare"
  // must surface healthcare matches in *every* channel that has any.
  let candidates;
  if (q && String(q).trim() && !channel) {
    const PER_CHANNEL = 80;
    const channelList = channelsSvc.listChannels();
    const byId = new Map();
    for (const ch of channelList) {
      if (!ch || !ch.types || ch.types.length === 0) continue;
      const channelWhere = { ...where, type: { [Op.in]: ch.types } };
      try {
        // eslint-disable-next-line no-await-in-loop
        const rows = await Opportunity.findAll({
          where: channelWhere,
          order: sortConfig.sql,
          limit: PER_CHANNEL,
        });
        for (const r of rows) byId.set(r.id, r);
      } catch (e) {
        // If a single channel's query fails (e.g. type mismatch from
        // an in-flight migration), skip it — don't poison the whole
        // search.
        // eslint-disable-next-line no-continue
        continue;
      }
    }
    candidates = Array.from(byId.values());
  } else {
    candidates = await Opportunity.findAll({
      where,
      order: sortConfig.sql,
      limit: candidatePool,
    });
  }

  const hash = profileHash(userProfile);
  // Cache scoped by (org_id, opportunity_id, profile_hash). Older rows
  // pre-v4 carry org_id=1 from the migration backfill.
  const cached = await OpportunityFitScore.findAll({
    where: {
      opportunityId: candidates.map((c) => c.id),
      profileHash: hash,
      organizationId: orgId,
    },
  });
  const cacheMap = new Map();
  for (const c of cached) cacheMap.set(c.opportunityId, c);

  const scored = [];
  for (const opp of candidates) {
    // Strategic Bonfire rows carry their own pre-computed score from
    // the strategist's cluster analysis (aiAnalysis.fit_score = the
    // strategic_score). Re-scoring them against the user profile would
    // tank their fitScore (their copy describes a synthesized cluster,
    // not a single service) and sink them to the bottom of the sort.
    // Use the embedded score directly + a small +5 priority boost
    // (capped at 95) so they integrate alongside individual rows.
    let fit;
    let breakdown;
    let priorityScore;
    let urgency;
    let revenueVelocity;
    let bucket;

    if (opp.type === 'bonfire_strategic') {
      const ai = opp.aiAnalysis || {};
      fit = Number(ai.fit_score || ai.strategic_score || opp.aiScore || 70);
      // Hard cap at 75 — strictly below act_now (>=80). Strategic rows
      // always surface (they default into high_value when score >= 60)
      // but never crowd the act_now top slots, which stay reserved for
      // time-pressured individual opps. Mirrors the cap in
      // bonfireStrategicSync.STRATEGIC_PRIORITY_CAP.
      priorityScore = Math.min(75, Math.max(0, Number(ai.strategic_score || ai.fit_score || opp.aiScore || 60)));
      urgency = 60; // never trigger urgency >= 90 act_now path either
      revenueVelocity = null;
      // Strategic clusters get their own bucket so they appear in a
      // dedicated "Strategic Patterns" strip, not competing with
      // individual rows for high_value's slots. Per Ali's ask:
      // "strategically integrated, not overshadowing".
      bucket = 'strategic_pattern';
      breakdown = {
        service_match: 25,        // strategic = "we built this for you"
        revenue_weight: 18,
        automation_score: 15,
        repeatability_score: 14,
        ease_of_entry: 8,
        strategic_alignment: 15,
      };
    } else {
      let score = cacheMap.get(opp.id);
      if (!score) {
        score = await getOrCreateFitScore({ opportunity: opp, userProfile, organizationId: orgId });
      }
      fit = score.fitScore != null ? score.fitScore : score.fit_score;
      if (minScore != null && fit < Number(minScore)) continue;

      const computed = calculatePriorityScore({
        opportunity: opp,
        fitScore: fit,
        breakdown: {
          service_match: score.serviceMatch ?? score.service_match,
          revenue_weight: score.revenueWeight ?? score.revenue_weight,
          automation_score: score.automationScore ?? score.automation_score,
          repeatability_score: score.repeatabilityScore ?? score.repeatability_score,
          ease_of_entry: score.easeOfEntry ?? score.ease_of_entry,
          strategic_alignment: score.strategicAlignment ?? score.strategic_alignment,
        },
      });
      priorityScore = computed.priorityScore;
      urgency = computed.urgency;
      revenueVelocity = computed.revenueVelocity;
      bucket = computed.bucket;
      breakdown = {
        service_match: score.serviceMatch ?? score.service_match,
        revenue_weight: score.revenueWeight ?? score.revenue_weight,
        automation_score: score.automationScore ?? score.automation_score,
        repeatability_score: score.repeatabilityScore ?? score.repeatability_score,
        ease_of_entry: score.easeOfEntry ?? score.ease_of_entry,
        strategic_alignment: score.strategicAlignment ?? score.strategic_alignment,
      };
    }

    if (minScore != null && fit < Number(minScore)) continue;

    // v3: attach effort estimate so the UI / recommendation engine
    // doesn't need a second pass.
    const effort = estimateEffort(opp);

    scored.push({
      ...opp.toJSON(),
      fitScore: fit,
      priorityScore,
      urgency,
      revenueVelocity,
      bucket,
      effortEstimate: effort,
      fitBreakdown: breakdown,
    });
  }
  // Apply the requested sort. For 'priority' (default), highest-score-
  // first with fit as tiebreaker. For 'newest' / 'oldest', sort by
  // createdAt — when the row landed in our DB.
  scored.sort(sortConfig.rank);

  // v9.8: when a keyword filter is active, also compute a per-channel
  // bucket — top-5 from each channel — so the UI can render a
  // "breakdown by channel" strip above the main priority-sorted list.
  // Without this, low-priority channels (news/talent — signal channels
  // with no commercial value) get drowned in the unified ranking and a
  // user clicking "healthcare" never sees the news matches without
  // paginating 18 pages.
  let channelBuckets = null;
  if (q && String(q).trim()) {
    channelBuckets = {};
    const PER_BUCKET = 5;
    // News/talent are signal channels — most-recent matters more than
    // priority for them. Other channels stay priority-sorted.
    const RECENCY_FIRST = new Set(['private-sector', 'talent']);
    for (const ch of channelsSvc.listChannels()) {
      const matches = scored.filter((r) => channelsSvc.getChannelKey(r) === ch.key);
      if (matches.length === 0) continue;
      const ordered = RECENCY_FIRST.has(ch.key)
        ? matches.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        : matches; // already priority-sorted
      channelBuckets[ch.key] = {
        label: ch.label,
        icon: ch.icon,
        color: ch.color,
        total: matches.length,
        rows: ordered.slice(0, PER_BUCKET),
      };
    }
  }

  const start = Number(offset) || 0;
  const stop = start + (Math.min(Number(limit) || 50, 200));
  return {
    rows: scored.slice(start, stop),
    total: scored.length,
    profileWasDefault: !!userProfile._isDefault,
    organizationId: orgId,
    channelBuckets,
  };
}

async function topByFitScore({ n = 5, userId, organizationId } = {}) {
  const { rows } = await listMyOpportunities({ limit: n, offset: 0, userId, organizationId });
  return rows;
}

// v7: single-opportunity enrichment for the bridge's GET /opportunities/:id.
// Runs the same profile → fit → priority/bucket → effort pipeline as
// listMyOpportunities, but for one opp.
async function enrichOpportunity({ opportunity, organizationId, userId = null } = {}) {
  if (!opportunity) return null;
  const orgId = organizationId || (await profileSvc.resolveOrgId(userId));
  const userProfile = await profileSvc.getOrDefaultByOrg(orgId);
  const score = await getOrCreateFitScore({
    opportunity, userProfile, organizationId: orgId,
  });
  const fit = score.fitScore != null ? score.fitScore : score.fit_score;
  const breakdown = {
    service_match: score.serviceMatch ?? score.service_match,
    revenue_weight: score.revenueWeight ?? score.revenue_weight,
    automation_score: score.automationScore ?? score.automation_score,
    repeatability_score: score.repeatabilityScore ?? score.repeatability_score,
    ease_of_entry: score.easeOfEntry ?? score.ease_of_entry,
    strategic_alignment: score.strategicAlignment ?? score.strategic_alignment,
  };
  const { priorityScore, urgency, revenueVelocity, bucket } =
    calculatePriorityScore({ opportunity, fitScore: fit, breakdown });
  const effort = estimateEffort(opportunity);
  return {
    ...(opportunity.toJSON ? opportunity.toJSON() : opportunity),
    fitScore: fit,
    priorityScore,
    urgency,
    revenueVelocity,
    bucket,
    effortEstimate: effort,
    fitBreakdown: breakdown,
    organization_id: orgId,
  };
}

module.exports = { listMyOpportunities, topByFitScore, enrichOpportunity, MIN_VALUE_USD };
