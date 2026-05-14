// Research Intelligence Phase 3c — research relationship graph.
//
// Two jobs:
//  1. buildRelationships() — materialize Phase 2.2's cross-channel matches
//     (stashed on aiAnalysis.cross_channel_matches) into the
//     research_relationships table as first-class, queryable edges.
//  2. buildTopicGraph(topic) — the doc's "Autonomous Agents → Papers /
//     Authors / Contracts / Jobs / ..." tree: given a topic, return the
//     connected papers, their authors, and the cross-channel opps they link
//     to, grouped by channel.

const { Op } = require('sequelize');
const {
  Opportunity, ResearchRelationship, ResearchTopic, ResearchAuthor, AnalysisRun,
} = require('../models');
const { getChannelKey } = require('./channels.service');
const logger = require('../logging/logger');

// ---- 1. Materialize cross-channel matches into graph edges -------------

async function buildRelationships() {
  const run = await AnalysisRun.create({
    type: 'research_graph_build',
    status: 'running',
    startedAt: new Date(),
  });
  try {
    const researchOpps = await Opportunity.findAll({
      where: { type: 'research', status: 'active' },
      attributes: ['id', 'aiAnalysis'],
    });

    let edgesUpserted = 0;
    let oppsWithMatches = 0;
    const errors = [];

    for (const opp of researchOpps) {
      const ccm = opp.aiAnalysis && opp.aiAnalysis.cross_channel_matches;
      const matches = (ccm && Array.isArray(ccm.matches)) ? ccm.matches : [];
      if (matches.length === 0) continue;
      oppsWithMatches += 1;
      for (const m of matches) {
        if (!m.opportunity_id) continue;
        try {
          await ResearchRelationship.upsert({
            researchOpportunityId: opp.id,
            relatedOpportunityId: m.opportunity_id,
            relationshipType: 'cross_channel',
            relatedChannel: m.channel || null,
            score: m.overlap_score != null ? m.overlap_score : null,
            metadata: { shared_terms: m.shared_terms || [], related_title: m.title || null },
          });
          edgesUpserted += 1;
        } catch (e) {
          errors.push({ research: opp.id, related: m.opportunity_id, error: e.message });
        }
      }
    }

    const finalStatus = errors.length > 0 ? 'partial' : 'success';
    await run.update({
      status: finalStatus,
      inputCount: researchOpps.length,
      outputCount: edgesUpserted,
      results: { researchOppsWithMatches: oppsWithMatches, edgesUpserted },
      errors: errors.slice(0, 50),
      completedAt: new Date(),
    });
    logger.info('researchGraph.buildRelationships complete', { edgesUpserted, oppsWithMatches });
    return run;
  } catch (error) {
    logger.error('researchGraph.buildRelationships failed', { error: error.message });
    await run.update({ status: 'failed', errors: [{ error: error.message }], completedAt: new Date() });
    throw error;
  }
}

// ---- 2. Topic graph ---------------------------------------------------

// Given a topic name, return the "tree": the research papers under that
// topic, the authors publishing them, and the cross-channel opps those
// papers link to (grouped by channel).
async function buildTopicGraph(topicName, { limit = 25 } = {}) {
  const topicRow = await ResearchTopic.findOne({
    where: { topicName: String(topicName || '').toLowerCase().trim() },
  });
  if (!topicRow) {
    const err = new Error(`Research topic not found: ${topicName}`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  // Papers under this topic — match the topic against tags OR sourceData.domains.
  const t = topicRow.topicName;
  const papers = await Opportunity.findAll({
    where: {
      type: 'research',
      status: 'active',
      [Op.or]: [
        { tags: { [Op.contains]: [t] } },
        // domains live in sourceData JSONB — match via a JSONB containment.
        { sourceData: { domains: { [Op.contains]: [t] } } },
      ],
    },
    attributes: ['id', 'title', 'source', 'sourceUrl', 'value', 'publishedAt', 'sourceData', 'aiAnalysis', 'actionType'],
    order: [['published_at', 'DESC']],
    limit: Math.min(Number(limit) || 25, 100),
  });

  // Authors across these papers.
  const authorNames = new Set();
  for (const p of papers) {
    const a = (p.sourceData && p.sourceData.authors) || [];
    for (const name of a) authorNames.add(String(name).trim());
  }
  const authors = authorNames.size
    ? await ResearchAuthor.findAll({
      where: { name: { [Op.in]: [...authorNames] } },
      order: [['citation_count', 'DESC'], ['paper_count', 'DESC']],
      limit: 30,
    })
    : [];

  // Cross-channel edges from these papers — pull from research_relationships.
  const paperIds = papers.map((p) => p.id);
  const edges = paperIds.length
    ? await ResearchRelationship.findAll({
      where: { researchOpportunityId: { [Op.in]: paperIds } },
      order: [['score', 'DESC']],
    })
    : [];

  // Group the cross-channel connections by channel for the tree view.
  const connectionsByChannel = {};
  for (const e of edges) {
    const ch = e.relatedChannel || 'unknown';
    if (!connectionsByChannel[ch]) connectionsByChannel[ch] = [];
    connectionsByChannel[ch].push({
      related_opportunity_id: e.relatedOpportunityId,
      score: e.score != null ? Number(e.score) : null,
      title: e.metadata && e.metadata.related_title,
      shared_terms: (e.metadata && e.metadata.shared_terms) || [],
    });
  }
  // Cap each channel's list so a hot topic doesn't return thousands of edges.
  for (const ch of Object.keys(connectionsByChannel)) {
    connectionsByChannel[ch] = connectionsByChannel[ch]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 15);
  }

  return {
    topic: {
      name: topicRow.topicName,
      paper_count: topicRow.paperCount,
      momentum_score: topicRow.momentumScore != null ? Number(topicRow.momentumScore) : null,
      growth_rate: topicRow.growthRate != null ? Number(topicRow.growthRate) : null,
      commercial_score: topicRow.commercialScore != null ? Number(topicRow.commercialScore) : null,
    },
    papers: papers.map((p) => ({
      opportunity_id: p.id,
      title: p.title,
      source: p.source,
      source_url: p.sourceUrl,
      action_type: p.actionType,
      published_at: p.publishedAt,
      buildable: !!(p.aiAnalysis && p.aiAnalysis.research_summary && p.aiAnalysis.research_summary.buildable),
      github_repo: (p.sourceData && p.sourceData.githubRepo) || null,
    })),
    authors: authors.map((a) => ({
      id: a.id,
      name: a.name,
      paper_count: a.paperCount,
      citation_count: a.citationCount,
    })),
    connections_by_channel: connectionsByChannel,
    edge_count: edges.length,
  };
}

module.exports = {
  buildRelationships,
  buildTopicGraph,
};
