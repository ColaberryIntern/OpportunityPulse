// Document-driven deep vet. After the actual RFP documents are uploaded + parsed,
// run an AI gate-check of the solicitation text against Colaberry's winnability gates
// and write the authoritative verdict to bonfire_opportunities.vet_verdict (auto:false,
// overriding the title-based heuristic). This is the "extra layer of scrutiny" that
// only the real documents can unlock. See OPPORTUNITY_VETTING_AND_DISQUALIFICATION.md.
const { Op } = require('sequelize');
const { OpportunityAttachment, BonfireOpportunity } = require('../models');
const { getAIClient } = require('../analysis/ai.client');
const { DISQUALIFIERS } = require('../govContracts/disqualification.service');
const logger = require('../logging/logger');

const MAX_PER_ATTACHMENT = 12000;
const MAX_TOTAL = 30000;
const MIN_TEXT = 500;
const HEAD_CHARS = 1800;       // doc opening (scope/intro) for context
const PASSAGE_WINDOW = 380;    // chars of context captured around each gate keyword

// Language that triggers a hard gate. We pull windows around these so the exact
// disqualifying clause is in the excerpt even when it sits deep in a long PDF
// (otherwise a first-N-chars truncation hides it and the AI guesses from context).
const GATE_RE = /tx-?ramp|soc ?2|soc 2 type|stateramp|govramp|fedramp|\bcjis\b|\bfips\b|hecvat|certif(y|ied|ication)|minimum qualif|years?\s+of\s+experience|prior (experience|deployment|implementation)|set-?aside|8\(a\)|\bwosb\b|hubzone|sdvosb|bid bond|performance bond|payment bond|professional liability|errors and omissions|parent guarant|source code escrow|furnish and install|installed base|on-?site|must (hold|be certified|provide proof|possess|have at least|demonstrate)/i;

// Extract de-duplicated ~window-sized passages around each gate keyword.
function gatePassages(text, { window = PASSAGE_WINDOW, maxPassages = 20 } = {}) {
  const passages = [];
  const ranges = [];
  const re = new RegExp(GATE_RE.source, 'gi');
  let m;
  while ((m = re.exec(text)) !== null && passages.length < maxPassages) {
    const start = Math.max(0, m.index - window);
    const end = Math.min(text.length, m.index + m[0].length + window);
    if (ranges.some(([s, e]) => start < e && end > s)) continue; // skip overlaps
    ranges.push([start, end]);
    passages.push(text.slice(start, end).replace(/\s+/g, ' ').trim());
    re.lastIndex = end;
  }
  return passages;
}

const SYSTEM_PROMPT = `You are a government-contract capture analyst vetting an RFP for Colaberry Inc., a small AI/data/software services firm in Plano TX.
Colaberry's delivery lane: custom software, AI/ML, RAG/document intelligence, data analytics, IT consulting, 508/accessibility, workforce/education technology.
Colaberry does NOT hold: SOC 2 Type II, TX-RAMP, StateRAMP, FedRAMP, CJIS, FIPS, HECVAT. It is a first-time government vendor with NO federal past performance and NO SBA set-aside certifications (not 8(a)/WOSB/HUBZone/SDVOSB). It does NOT install physical hardware or manage property/people on-site.

Read the RFP text and decide whether Colaberry can SUBMIT and WIN this. Apply these hard gates — ANY single one failing = no_bid:
- CERT_WALL: a security certification (SOC 2 / TX-RAMP / StateRAMP / FedRAMP / CJIS / FIPS / HECVAT) is MANDATORY at submission.
- DOMAIN_MISMATCH: the scope is outside software/AI/data/consulting (construction, AV/hardware install, property management, social-services delivery, building automation/HVAC, field inspection, vehicles/equipment).
- SCALE_WALL: enterprise outsourcing, parent guarantee, source-code escrow, or $20M+ financial capacity required.
- EXPERIENCE_GATE: a mandatory minimum of N years of SPECIFIC prior experience or N prior like-for-like deployments.
- PRODUCT_REQUIRED: requires an existing commercial product in a vertical Colaberry does not own.
- PHYSICAL_INSTALL: furnish-and-install hardware, bid bond, or construction plans/drawings.
- SET_ASIDE_INELIGIBLE: reserved for a set-aside Colaberry can't claim (8(a)/WOSB/HUBZone/SDVOSB).
- DEADLINE_TIGHT: the real submission deadline is under 14 days from "Today" below.

The text below is each document's opening plus [GATE-RELEVANT PASSAGES] — windows pulled around certification / qualification / insurance / set-aside / bond / experience language. Base the verdict on THESE.

Return ONLY this JSON:
{"status":"bid|no_bid|conditional|needs_review","disqualifier":"<one taxonomy CODE or null>","label":"<one-line plain-English reason, <=90 chars>","evidence":"<the EXACT verbatim sentence from the text that triggers the disqualifier, or null>","lane":"services|sbir|coop|null","unblocked_by":"<what/who would clear a conditional, or null>","confidence":0.0}

Rules:
- no_bid REQUIRES a verbatim sentence in "evidence" copied exactly from the text that proves the failing gate (e.g. the sentence mandating TX-RAMP/SOC 2, or stating the N-year experience minimum). disqualifier = that gate's CODE.
- Evidence must AFFIRMATIVELY impose the gate. A clause stating a requirement is "not applicable", "N/A", "waived", "not required", "none", or absent is the OPPOSITE of a gate — NEVER cite it as proof of a disqualification. If the security/qualification/bond section says it is not applicable, that gate does NOT fail.
- Do NOT infer CERT_WALL from the words "security", "secure", "cyber", or a security-product name in the title or scope. CERT_WALL fails ONLY when an explicit clause MANDATES a named certification (SOC 2 / TX-RAMP / StateRAMP / FedRAMP / CJIS / FIPS / HECVAT) as a condition of submission or award.
- Re-read your chosen "evidence" before finalizing: on its own, it must prove the disqualifier. If it does not, pick different evidence, change the disqualifier, or change the status.
- If it LOOKS like a no-bid but you CANNOT find a verbatim clause in the text proving a hard gate, return status "needs_review" (NOT no_bid) with your best-guess disqualifier and confidence — never assert a disqualification on the agency name or inference alone.
- conditional -> clears every gate except one a partner can satisfy (Que for housing-finance experience, or a SOC2-certified host); set unblocked_by.
- bid -> clears every gate.
- confidence (0.0-1.0) = how strongly the QUOTED TEXT supports the verdict: 1.0 only when "evidence" is an explicit verbatim clause, lower when partial, near 0 when inferred.
- Quote verbatim from the supplied text only. Never invent a requirement that is not in the text.`;

async function loadRfpText(oppId) {
  const rows = await OpportunityAttachment.findAll({
    where: { bonfireOpportunityId: oppId, parsedText: { [Op.ne]: null } },
    order: [['downloaded_at', 'DESC']],
  });
  const out = [];
  let total = 0;
  for (const r of rows) {
    const text = String(r.parsedText || '').trim();
    if (!text) continue;
    // Build a gate-focused excerpt: the document opening (scope) + every passage
    // around a gate keyword, so the disqualifying clause is never truncated away.
    const head = text.slice(0, HEAD_CHARS);
    const passages = gatePassages(text);
    let docExcerpt = head;
    if (passages.length) docExcerpt += `\n[GATE-RELEVANT PASSAGES]\n${passages.join('\n...\n')}`;
    docExcerpt = docExcerpt.slice(0, MAX_PER_ATTACHMENT);
    const remaining = MAX_TOTAL - total;
    if (remaining <= 200) break;
    const slice = docExcerpt.slice(0, remaining);
    total += slice.length;
    out.push({ name: r.name, text: slice });
  }
  return out;
}

const VALID_CODES = new Set(Object.keys(DISQUALIFIERS));

function sanitizeVerdict(parsed) {
  const status = ['bid', 'no_bid', 'conditional'].includes(parsed && parsed.status) ? parsed.status : 'needs_review';
  return {
    status,
    disqualifier: (parsed && parsed.disqualifier && VALID_CODES.has(parsed.disqualifier)) ? parsed.disqualifier : null,
    label: String((parsed && parsed.label) || (status === 'bid' ? 'Cleared the gate-check' : 'Needs review')).slice(0, 120),
    evidence: (parsed && parsed.evidence) ? String(parsed.evidence).slice(0, 500) : null,
    lane: ['services', 'sbir', 'coop'].includes(parsed && parsed.lane) ? parsed.lane : null,
    unblocked_by: (parsed && parsed.unblocked_by) ? String(parsed.unblocked_by).slice(0, 160) : null,
    confidence: Math.max(0, Math.min(1, Number(parsed && parsed.confidence) || 0)),
    auto: false,
    scorer: 'document_deep_vet',
    vetted_at: new Date().toISOString(),
  };
}

// A CERT_WALL verdict must be backed by evidence that NAMES a specific security
// certification. Models over-trigger CERT_WALL on generic "maintain all licenses
// and certifications" boilerplate present in nearly every contract. This is a
// deterministic guardrail: if a no_bid/CERT_WALL's evidence names no real cert,
// downgrade to needs_review rather than wrongly burying the opportunity.
const NAMED_CERT_RE = /tx-?ramp|soc ?2|soc 2 type|stateramp|govramp|fedramp|\bcjis\b|\bfips\b|hecvat|iso ?27001/i;

function validateVerdictEvidence(v) {
  if (v.status === 'no_bid' && v.disqualifier === 'CERT_WALL' && !NAMED_CERT_RE.test(v.evidence || '')) {
    return {
      ...v,
      status: 'needs_review',
      label: 'Possible cert requirement — evidence did not name a specific certification',
      confidence: Math.min(v.confidence, 0.4),
    };
  }
  return v;
}

function parseAiJson(content) {
  try { return JSON.parse(content); } catch (e) { /* fall through */ }
  const m = String(content || '').match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* noop */ } }
  return null;
}

// Second, ADVERSARIAL pass. The first verdict can be confidently wrong (it cited a
// "not applicable" clause as a cert wall). This reviewer is told to find that error
// and return the corrected final verdict. Two passes + the deterministic guardrails
// catch the bulk of the bad calls before a human ever sees them.
const REVIEW_SYSTEM_PROMPT = `You are a SKEPTICAL senior reviewer auditing a draft bid/no-bid decision on a government RFP for Colaberry Inc. (a small AI/data/software services firm; does NOT hold SOC 2 / TX-RAMP / StateRAMP / FedRAMP / CJIS / FIPS / HECVAT; no federal past performance; no SBA set-aside certifications; does not install hardware or manage property/people on-site).
You are given (a) the DRAFT VERDICT and (b) the RFP text. Your job is to catch the draft's errors and return the CORRECT final verdict.
Audit rigorously:
1. EVIDENCE: does the draft's quote actually appear (in substance) in the text AND, on its own, AFFIRMATIVELY prove the stated disqualifier? A clause saying a requirement is "not applicable / waived / not required / N/A / none" proves the OPPOSITE — it cannot support a disqualification.
2. CODE: is the disqualifier the correct gate? CERT_WALL requires a clause NAMING SOC 2 / TX-RAMP / StateRAMP / FedRAMP / CJIS / FIPS / HECVAT as a condition of submission/award — never infer it from the word "security" or generic "maintain all certifications" boilerplate. Annual support of a proprietary product (e.g. a named access-control or ERP system) is PRODUCT_REQUIRED, not CERT_WALL.
3. CONTRADICTION: is there a clause that contradicts the draft?
Return ONLY JSON:
{"agrees_with_draft":true|false,"status":"bid|no_bid|conditional|needs_review","disqualifier":"<CODE or null>","label":"<=90 chars","evidence":"<verbatim sentence that affirmatively proves the disqualifier, or null>","lane":"services|sbir|coop|null","unblocked_by":"<or null>","confidence":0.0,"reason":"<why you agreed or corrected, <=160 chars>"}
Rules: if the draft's evidence does not affirmatively prove its disqualifier, you MUST correct it. If you cannot prove ANY hard gate from the text, return status "needs_review" (let a human decide) — never invent a gate. A no_bid REQUIRES a verbatim affirmative clause in "evidence".`;

async function reviewVerdict({ opp, draft, excerpts }) {
  const ai = getAIClient();
  const userPrompt = [
    `Opportunity: ${opp.title || ''}`,
    `Agency: ${opp.agency || ''}`,
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    '',
    '=== DRAFT VERDICT TO AUDIT ===',
    JSON.stringify({ status: draft.status, disqualifier: draft.disqualifier, label: draft.label, evidence: draft.evidence }),
    '',
    '=== RFP attachment text ===',
    ...excerpts.map((e) => `--- ${e.name} ---\n${e.text}`),
  ].join('\n');
  try {
    const { content } = await ai.chat(REVIEW_SYSTEM_PROMPT, userPrompt, { temperature: 0, maxTokens: 600 });
    return parseAiJson(content);
  } catch (e) {
    logger.warn('documentDeepVet: review pass failed', { id: opp.id, error: e.message });
    return null;
  }
}

// Run the deep vet for one bonfire opportunity using its uploaded+parsed documents.
async function deepVetFromDocuments(oppId) {
  const excerpts = await loadRfpText(oppId);
  const totalChars = excerpts.reduce((acc, e) => acc + e.text.length, 0);
  if (totalChars < MIN_TEXT) {
    return { skipped: true, reason: 'No parsed RFP text yet — upload/parse the documents first.' };
  }
  const opp = await BonfireOpportunity.findByPk(oppId);
  if (!opp) return { skipped: true, reason: 'Opportunity not found.' };

  const userPrompt = [
    `Opportunity: ${opp.title || ''}`,
    `Agency: ${opp.agency || ''}`,
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    '',
    '=== RFP attachment text (cite verbatim in evidence) ===',
    ...excerpts.map((e) => `--- ${e.name} ---\n${e.text}`),
  ].join('\n');

  const ai = getAIClient();
  let parsed = null;
  let aiError = null;
  try {
    const { content } = await ai.chat(SYSTEM_PROMPT, userPrompt, { temperature: 0, maxTokens: 700 });
    parsed = parseAiJson(content);
  } catch (e) {
    aiError = e.message;
    logger.error('documentDeepVet: AI call failed', { id: oppId, error: e.message });
  }
  if (!parsed) return { skipped: true, reason: aiError || 'AI returned no parseable verdict.' };

  // Pass 1 — draft verdict (with deterministic guardrails).
  const draft = validateVerdictEvidence(sanitizeVerdict(parsed));

  // Pass 2 — skeptical AI review. Its corrected verdict (re-guarded) becomes final.
  // If the review is unavailable, fall back to the guarded draft.
  let final = draft;
  let review = { agreed: null, reason: 'review unavailable', reviewer: 'ai_review', draft_status: draft.status, draft_disqualifier: draft.disqualifier };
  const reviewed = await reviewVerdict({ opp, draft, excerpts });
  if (reviewed) {
    const corrected = validateVerdictEvidence(sanitizeVerdict(reviewed));
    review = {
      agreed: reviewed.agrees_with_draft !== false,
      reason: String(reviewed.reason || '').slice(0, 200),
      reviewer: 'ai_review',
      draft_status: draft.status,
      draft_disqualifier: draft.disqualifier,
    };
    final = corrected;
  }
  final = { ...final, review };

  await opp.update({ vetVerdict: final });
  logger.info('documentDeepVet wrote verdict', {
    id: oppId, status: final.status, disqualifier: final.disqualifier, review_agreed: review.agreed,
  });
  return { verdict: final };
}

module.exports = {
  deepVetFromDocuments, loadRfpText, sanitizeVerdict, validateVerdictEvidence, reviewVerdict, gatePassages,
  SYSTEM_PROMPT, REVIEW_SYSTEM_PROMPT,
};
