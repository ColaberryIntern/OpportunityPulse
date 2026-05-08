// Submission Readiness Engine v0.3 — AI-driven document generator.
//
// Per-type system prompts + a single entry point that:
//   1. Validates the type is generatable.
//   2. Loads the org profile + (optionally) the Bonfire opp for grounding.
//   3. Calls the AI client.
//   4. Writes TWO Document rows linked by lineage_id:
//        - LOCAL: scope='bid', scope_id=<oppId>  → counts toward this bid's checklist
//        - GLOBAL: scope='global', scope_id=null → version history for analysis/improvement
//      Both rows share `source='ai_generated'` + `lineage_id`.
//
// The dual-write is intentional: the local row is the artifact for THIS bid,
// the global row is the org's accumulating corpus of generated content. Future
// generations can use the global history as past-wins context.

const crypto = require('crypto');
const logger = require('../logging/logger');
const { Document, BonfireOpportunity } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const types = require('./documentTypes');
const storage = require('./storage.adapter');
const profileSvc = require('../oied/profile.service');

// One paragraph per type. Each prompt asks for plain markdown, no
// preamble, ≤500 words, with grounding rules to prevent hallucination.
// Structures match what an evaluator scanning the doc actually expects.
const SYSTEM_PROMPTS = {
  cover_letter_template: `You write professional procurement cover letters. Output a 1-page cover
letter in plain markdown for the bidder responding to the procurement opportunity provided. Structure:
greeting, 1-paragraph purpose statement (name the buyer + bid ref), 3 bullet differentiators (concrete,
no fluff), 1-paragraph commitment + next steps, signature block. ≤350 words. Plain markdown only.
Never invent credentials, certifications, or named clients. If the org profile lacks a fact, omit it.`,

  capability_statement: `You write 1-page capability statements for procurement responders.
Structure: ## Core Competencies (4–6 bullets) | ## Differentiators (3 bullets, concrete) |
## Past Performance (top 3 from profile.pastWins) | ## Corporate Data (NAICS, services, geography).
≤500 words. Plain markdown only. Never invent NAICS codes, certifications, or work history not present
in the org profile.`,

  technical_response_template: `You produce a technical-response template tailored to the RFP scope.
Structure: ## Understanding of Requirements | ## Technical Approach | ## Team & Tools | ## Timeline |
## Risks & Mitigations. Use concrete language tied to the named tools/services in the org profile.
Mark spots requiring human input with \`[FILL: ...]\` placeholders. ≤600 words. Plain markdown.`,

  pricing_response_template: `You produce a pricing response TEMPLATE — structure only, no numbers.
Output: a labor-category table (role | qty | unit price | total), a materials/other-direct-costs table,
totals row, and a notes section calling out assumptions. Mark every numeric cell as \`[FILL: $X]\`.
Plain markdown table syntax. ≤350 words.`,

  eeo_statement: `You produce a standard EEO / Non-Discrimination Statement suitable for a federal /
state procurement attachment. Single page. References Title VII, the Americans with Disabilities Act,
and Section 503. Names the org as the bidder. Plain markdown, ≤250 words. No legal disclaimers.`,

  no_collusion_affidavit: `You produce a Non-Collusion Affidavit template. Single page. Standard
procurement language attesting that the bid was prepared independently. Includes signature block with
\`[FILL: Officer Name]\`, \`[FILL: Title]\`, \`[FILL: Date]\`. Plain markdown, ≤200 words.`,

  references: `You produce a 1-page References list compiled from the org profile's pastWins and
services. Format: numbered list, each entry — Client name | Project description | Duration | Contact
\`[FILL: Name + Email + Phone]\`. ≤350 words. Never invent clients; if pastWins is empty, return a
template with \`[FILL: ...]\` for all 3 entries.`,

  naics_list: `You produce a NAICS Code List for the org. Use the industries + services from the
profile to suggest 3–6 NAICS codes (with full names). Format: code — name — relevance to org services.
Plain markdown bulleted list. ≤200 words. Add a final note that the user should verify each code on
sba.gov for size standards.`,

  safety_program: `You produce a 1-page Safety Program statement. Structure: ## Safety Policy
| ## OSHA Compliance | ## Incident Reporting | ## Training. Mark specific OSHA stats / EMR /
incident counts with \`[FILL: ...]\` since these are facts the user must supply. ≤350 words.`,

  cert_prevailing_wage: `You produce a Davis-Bacon / Prevailing Wage Compliance Certification — the
contractor-signed affidavit affirming compliance, not the wage determination itself. Include attestation
language, contractor name placeholder, project name, and signature block. Plain markdown, ≤300 words.`,

  addendum_acknowledgment: `You produce an Addendum / Q&A Acknowledgment form. Lists addenda 1–N
with \`[FILL: addendum date]\` placeholders, signature block. Plain markdown, ≤150 words.`,

  site_visit_acknowledgment: `You produce a Site Visit Acknowledgment form. Acknowledges attendance
at the mandatory pre-bid site visit. Includes date placeholder, attendee name placeholder, signature
block. Plain markdown, ≤150 words.`,

  past_performance: `You produce a Past Performance Summary compiled from the org profile's pastWins.
For each past win, a short narrative (3–5 sentences): client + project + scope + outcome + value.
≤500 words total. If pastWins is empty, return 2 \`[FILL: ...]\` template entries instead of inventing.`,
};

function buildUserPrompt({ type, opp, profile }) {
  const lines = [];
  if (opp) {
    lines.push('Procurement opportunity context:');
    lines.push(`  Title: ${opp.title || ''}`);
    if (opp.agency) lines.push(`  Agency / Buyer: ${opp.agency}`);
    if (opp.categoryRaw) lines.push(`  Category: ${opp.categoryRaw}`);
    if (opp.estimatedValue) lines.push(`  Estimated value: $${opp.estimatedValue}`);
    if (opp.closeDate) lines.push(`  Close date: ${new Date(opp.closeDate).toISOString().slice(0, 10)}`);
    const desc = String(opp.description || '').trim();
    if (desc) lines.push('', 'Description:', desc.slice(0, 2000));
    if (opp.overview) lines.push('', 'AI overview:', String(opp.overview).slice(0, 800));
    lines.push('');
  }
  if (profile) {
    lines.push('Bidder organization profile:');
    if (profile.services && profile.services.length)   lines.push(`  Services: ${profile.services.join(', ')}`);
    if (profile.industries && profile.industries.length) lines.push(`  Industries: ${profile.industries.join(', ')}`);
    if (profile.tools && profile.tools.length)         lines.push(`  Tools/stack: ${profile.tools.join(', ')}`);
    if (profile.pastWins && profile.pastWins.length)   lines.push(`  Named past wins: ${profile.pastWins.join('; ')}`);
    lines.push('');
  }
  lines.push(`Generate a ${type} document now. Plain markdown only — no preamble, no surrounding code fences.`);
  return lines.join('\n');
}

function defaultDisplayName(typeKey, opp) {
  const label = types.labelFor(typeKey);
  const dt = new Date().toISOString().slice(0, 10);
  if (opp && opp.title) {
    const trimmed = String(opp.title).slice(0, 50).replace(/[^\w\s-]/g, '').trim();
    return `${label} — ${trimmed} (${dt})`;
  }
  return `${label} — ${dt}`;
}

async function generateDocument({
  type, organizationId, bonfireOpportunityId = null, userId = null,
} = {}) {
  if (!types.isGeneratable(type)) {
    const err = new Error(`Type '${type}' is not AI-generatable. It must be obtained from a third party.`);
    err.code = 'NOT_GENERATABLE';
    throw err;
  }
  const systemPrompt = SYSTEM_PROMPTS[type];
  if (!systemPrompt) {
    const err = new Error(`No system prompt configured for type '${type}'`);
    err.code = 'NO_PROMPT';
    throw err;
  }

  const orgId = organizationId || (userId ? await profileSvc.resolveOrgId(userId) : null);
  if (!orgId) {
    const err = new Error('organizationId required');
    err.code = 'MISSING_ORG';
    throw err;
  }

  let opp = null;
  if (bonfireOpportunityId) {
    opp = await BonfireOpportunity.findByPk(bonfireOpportunityId);
    if (!opp) {
      const err = new Error('Bonfire opportunity not found');
      err.code = 'NOT_FOUND';
      throw err;
    }
  }

  const profile = await profileSvc.getOrDefaultByOrg(orgId).catch(() => null);

  const ai = getAIClient();
  const userPrompt = buildUserPrompt({ type, opp, profile });

  let content = '';
  let modelUsed = ai.model;
  try {
    const out = await ai.chat(systemPrompt, userPrompt, {
      temperature: 0.2,
      maxTokens: 1500,
      responseFormat: 'text',
    });
    content = String(out.content || '').trim();
    logger.info('documentGenerator: AI call complete', {
      type, organizationId: orgId, bonfireOpportunityId, tokensUsed: out.tokensUsed,
    });
  } catch (e) {
    logger.error('documentGenerator: AI call failed', { type, error: e.message });
    const err = new Error('AI generation failed: ' + e.message);
    err.code = 'AI_FAILED';
    throw err;
  }

  if (!content) {
    const err = new Error('AI returned empty content');
    err.code = 'EMPTY_CONTENT';
    throw err;
  }

  // Two linked rows. Same content, two physical files (small markdown,
  // disk is cheap; keeping them physical means the local row remains
  // independent if the global is later removed/promoted/deactivated).
  const lineageId = crypto.randomUUID();
  const baseName = defaultDisplayName(type, opp);
  const buffer = Buffer.from(content, 'utf8');

  // Local row first — it's what the readiness panel will read.
  const localWrite = bonfireOpportunityId
    ? await storage.writeBuffer({ organizationId: orgId, type, originalName: `${baseName}.md`, buffer })
    : null;
  const globalWrite = await storage.writeBuffer({ organizationId: orgId, type, originalName: `${baseName} [global v].md`, buffer });

  const created = [];
  if (bonfireOpportunityId && localWrite) {
    const localRow = await Document.create({
      organizationId: orgId,
      type,
      name: baseName,
      filePath: localWrite.filePath,
      mime: 'text/markdown',
      sizeBytes: localWrite.sizeBytes,
      version: 1,
      metadata: { ai_model: modelUsed, generated_at: new Date().toISOString() },
      expiresAt: null,
      uploadedBy: userId,
      isActive: true,
      scope: 'bid',
      scopeId: String(bonfireOpportunityId),
      lineageId,
      source: 'ai_generated',
    });
    created.push(localRow);
  }
  // Global version — bumps version against existing global lineage of same (org, type, name-ish).
  const latestGlobal = await Document.findOne({
    where: { organizationId: orgId, type, scope: 'global' },
    order: [['version', 'DESC']],
    attributes: ['version'],
  });
  const globalVersion = latestGlobal ? Number(latestGlobal.version) + 1 : 1;
  const globalRow = await Document.create({
    organizationId: orgId,
    type,
    name: `${types.labelFor(type)} — AI-generated v${globalVersion}`,
    filePath: globalWrite.filePath,
    mime: 'text/markdown',
    sizeBytes: globalWrite.sizeBytes,
    version: globalVersion,
    metadata: {
      ai_model: modelUsed,
      generated_at: new Date().toISOString(),
      bonfire_opportunity_id: bonfireOpportunityId || null,
      bonfire_opportunity_title: opp ? opp.title : null,
    },
    expiresAt: null,
    uploadedBy: userId,
    isActive: true,
    scope: 'global',
    scopeId: null,
    lineageId,
    source: 'ai_generated',
  });
  created.push(globalRow);

  return {
    lineage_id: lineageId,
    type,
    organization_id: orgId,
    bonfire_opportunity_id: bonfireOpportunityId || null,
    local: bonfireOpportunityId ? created[0] : null,
    global: bonfireOpportunityId ? created[1] : created[0],
    model_used: modelUsed,
    chars: content.length,
  };
}

module.exports = {
  generateDocument,
  buildUserPrompt,
  defaultDisplayName,
  SYSTEM_PROMPTS,
};
