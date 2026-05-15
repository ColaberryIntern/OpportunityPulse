// Deep Research Phase 8 — venture-vs-tool conflict intelligence.
//
// Detects overlap between a generated VentureIdea and existing AiTool rows
// in the registry. Strategic realism, not idea-killer — every match
// surfaces with severity + differentiation hints so the operator can
// decide whether to pivot, partner, or proceed.
//
// MEASURE-ONLY. Persists into venture_conflicts.

const { Op } = require('sequelize');
const {
  AiTool, VentureIdea, VentureConflict,
} = require('../models');
const competingTools = require('./competingTools.service');

const STOP = competingTools.STOPS;

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g) || [];
}

function uniqueTokens(text) {
  const out = new Set();
  for (const t of tokenize(text)) {
    if (!STOP.has(t)) out.add(t);
  }
  return Array.from(out);
}

function jaccard(a, b) {
  const A = new Set(a); const B = new Set(b);
  let intersect = 0;
  for (const x of A) if (B.has(x)) intersect += 1;
  const union = A.size + B.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function categoryOverlap(ventureMeta, tool) {
  const venCats = []
    .concat(Array.isArray(ventureMeta.categories) ? ventureMeta.categories : [])
    .concat(ventureMeta.marketTiming ? [ventureMeta.marketTiming] : [])
    .map((c) => String(c).toLowerCase());
  const toolCat = String(tool.category || '').toLowerCase();
  if (!toolCat) return 0;
  return venCats.some((c) => c.includes(toolCat) || toolCat.includes(c)) ? 1 : 0;
}

function featureOverlap(ventureMeta, tool) {
  const ventureBlob = uniqueTokens(
    `${ventureMeta.description || ''} ${ventureMeta.mvpScope || ''} ${ventureMeta.title || ''}`,
  );
  const toolBlob = uniqueTokens(
    `${tool.name || ''} ${tool.description || ''} ${(Array.isArray(tool.tags) ? tool.tags : []).join(' ')}`,
  );
  return jaccard(ventureBlob, toolBlob);
}

function classifyConflictType({ catOverlap, feat, semantic }) {
  if (semantic >= 0.5) return 'semantic_overlap';
  if (feat >= 0.25) return 'feature_overlap';
  if (catOverlap) return 'category_overlap';
  return 'ecosystem_overlap';
}

function severityScore({ feat, catOverlap, momentumStage }) {
  // 0-100. feature_overlap dominates; category adds; momentum modulates.
  let s = feat * 70;
  if (catOverlap) s += 15;
  if (momentumStage === 'dominant') s += 10;
  if (momentumStage === 'explosive') s += 15;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function differentiationHints({ ventureMeta, tool, sharedTokens }) {
  const hints = [];
  if ((tool.pricingTier || '').toLowerCase() === 'enterprise') {
    hints.push('Tool is enterprise-priced — target mid-market or SMB instead.');
  }
  if ((tool.pricingTier || '').toLowerCase() === 'paid' && tool.openSource === false) {
    hints.push('Tool is paid + closed-source — open-source angle is differentiated.');
  }
  if (tool.openSource && (ventureMeta.targetCustomers || '').toLowerCase().includes('gov')) {
    hints.push('Tool is open-source — managed/government-compliance angle is differentiated.');
  }
  if (sharedTokens.length >= 4) {
    hints.push(`Heavy lexical overlap (${sharedTokens.slice(0, 4).join(', ')}) — emphasize a different domain or workflow.`);
  }
  if ((tool.category || '').toLowerCase().includes('infrastructure')) {
    hints.push('Tool is infrastructure — vertical SaaS or domain-specific UX is differentiated.');
  }
  if (hints.length === 0) {
    hints.push('No obvious wedge — consider partnership or pivot to an adjacent customer segment.');
  }
  return hints;
}

// Compute conflicts for one venture. Looks at top-K candidate tools from
// the registry (tokenized search), scores each, persists rows with severity
// >= 25 (below that they're noise).
async function computeForVenture(ventureIdeaId, { minSeverity = 25, candidateCap = 60 } = {}) {
  const venture = await VentureIdea.findByPk(ventureIdeaId);
  if (!venture) {
    const err = new Error(`Venture ${ventureIdeaId} not found`); err.code = 'NOT_FOUND'; throw err;
  }
  const ventureMeta = {
    title: venture.title,
    description: venture.description,
    mvpScope: venture.mvpScope,
    marketTiming: venture.marketTiming,
    categories: (venture.metadata && Array.isArray(venture.metadata.categories))
      ? venture.metadata.categories : [],
    targetCustomers: venture.metadata && venture.metadata.target_customers,
  };
  const venTokens = uniqueTokens(
    `${venture.title || ''} ${venture.description || ''} ${venture.mvpScope || ''}`,
  );
  if (venTokens.length === 0) return { venture_id: ventureIdeaId, computed: 0, conflicts: [] };

  // Candidate tools — query top 60 by trending, then filter by token match.
  const orClauses = venTokens.slice(0, 12).map((t) => ({
    [Op.or]: [
      { name: { [Op.iLike]: `%${t}%` } },
      { description: { [Op.iLike]: `%${t}%` } },
      { tags: { [Op.contains]: [t] } },
    ],
  }));
  const candidates = await AiTool.findAll({
    where: { status: 'active', [Op.or]: orClauses },
    order: [['trending_score', 'DESC']],
    limit: candidateCap,
  });

  // Idempotent rewrite of this venture's conflicts.
  await VentureConflict.destroy({ where: { ventureIdeaId } });

  const persisted = [];
  for (const tool of candidates) {
    const feat = featureOverlap(ventureMeta, tool);
    const catOverlap = categoryOverlap(ventureMeta, tool);
    const semantic = feat; // v1 — same metric. v2 will use embeddings.
    const conflictType = classifyConflictType({ catOverlap, feat, semantic });
    const severity = severityScore({
      feat, catOverlap, momentumStage: tool.momentumStage,
    });
    if (severity < minSeverity) continue;
    const toolTokens = uniqueTokens(
      `${tool.name || ''} ${tool.description || ''} ${(Array.isArray(tool.tags) ? tool.tags : []).join(' ')}`,
    );
    const sharedTokens = venTokens.filter((t) => toolTokens.includes(t));
    const hints = differentiationHints({ ventureMeta, tool, sharedTokens });
    const rationale = `Overlap ${(feat * 100).toFixed(0)}% with ${tool.name} `
      + `(${tool.category || 'uncategorized'}, ${tool.momentumStage || 'emerging'}). `
      + `Shared terms: ${sharedTokens.slice(0, 6).join(', ') || '(none)'}.`;
    // eslint-disable-next-line no-await-in-loop
    const row = await VentureConflict.create({
      ventureIdeaId,
      aiToolId: tool.id,
      conflictType,
      severity,
      matchedTerms: sharedTokens.slice(0, 12),
      differentiationHints: hints,
      rationale,
    });
    persisted.push({
      ...row.toJSON(),
      tool: {
        id: tool.id, name: tool.name, vendor: tool.vendor,
        category: tool.category, momentum_stage: tool.momentumStage,
        trending_score: Number(tool.trendingScore || 0),
      },
    });
  }
  return {
    venture_id: ventureIdeaId,
    computed: persisted.length,
    conflicts: persisted.sort((a, b) => Number(b.severity) - Number(a.severity)),
  };
}

async function listForVenture(ventureIdeaId) {
  const rows = await VentureConflict.findAll({
    where: { ventureIdeaId: Number(ventureIdeaId) },
    order: [['severity', 'DESC']], limit: 50,
  });
  return rows.map((r) => r.toJSON());
}

module.exports = {
  uniqueTokens, jaccard, categoryOverlap, featureOverlap,
  classifyConflictType, severityScore, differentiationHints,
  computeForVenture, listForVenture,
};
