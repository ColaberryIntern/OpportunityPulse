#!/usr/bin/env node
/**
 * Emits the gov-opportunity.v1 fixture set.
 *
 * Fixtures are committed JSON (see ./fixtures). This generator exists so the
 * variation points between cases stay visible and consistent -- each case is a
 * deliberate, minimal delta from a realistic base, not an independently
 * hand-edited blob that can drift from the schema.
 *
 * Run:  node contracts/gov-opportunity.v1/build-fixtures.js
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'fixtures');

const hex32 = (s) => require('crypto').createHash('md5').update(s).digest('hex');
const cid = (s) => `op:gov:${hex32(s)}`;
const fid = (s) => `opfam:${hex32(s)}`;
const SHA = (s) => require('crypto').createHash('sha256').update(s).digest('hex');

/** Minimal valid envelope. Every fixture starts here and overrides narrowly. */
function base() {
  return {
    schemaVersion: 'gov-opportunity.v1',
    sourceSnapshotVersion: 1,
    canonicalOpportunityId: cid('base'),
    sourceSystem: 'opportunity-pulse',
    sourceRecordId: 'placeholder',
    sourceAliases: [],
    solicitationFamily: null,
    publisher: {
      isCourtesyPosting: false,
      postingSource: { name: 'SAM.gov', portal: 'sam.gov', url: 'https://sam.gov' },
      leadBuyer: { name: 'Placeholder Agency', office: null, requirementOwner: null, jurisdiction: 'US-federal' },
      officialSourceUrl: null,
      submissionPortal: null,
    },
    notice: {
      title: 'Placeholder',
      noticeType: { value: 'unknown', raw: null, isResponseInvited: false, isBindingSolicitation: false, evidenceRef: null },
      procurementType: { value: 'unknown', basis: 'not_established', evidenceRef: null },
      contractVehicle: { value: 'unknown', programName: null, obligationsSummary: null, evidenceRef: null },
      selectableLots: null,
    },
    deadline: {
      originalText: null, wallClock: null, statedTimezone: null, resolvedZone: null,
      offsetMinutes: null, timezoneSource: 'absent', utc: null, utcConfidence: 'unknown',
      uncertaintyReason: 'missing_timezone', verifiedAt: null,
      conservativePlanningUtc: null, conflicts: [],
    },
    value: { published: null, modelEstimate: null },
    documents: {
      coverage: 'unknown', accessBarrier: null,
      counts: { listed: 0, downloaded: 0, parsed: 0, inaccessible: 0 },
      items: [], amendments: [],
    },
    requirements: [],
    timestamps: {
      sourceObservedAt: null, fetchedAt: null, enrichedAt: null,
      documentReviewedAt: null, lastVerifiedAtSource: null,
    },
    sourceAssessment: {
      serviceCategories: [], relevanceBasis: 'not_assessed', assessedBy: null,
      method: null, evidenceRefs: [], isNotEligibilityDetermination: true, legacyVerdict: null,
    },
    legacy: null,
    sourceAvailability: null,
    companyQualification: null,
  };
}

const merge = (a, b) => {
  if (Array.isArray(b) || b === null || typeof b !== 'object') return b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = merge(a && a[k] !== undefined ? a[k] : undefined, b[k]);
  return out;
};

const FIXTURES = {};

// ---------------------------------------------------------------- 1. RFI
// Real shape, drawn from VA RFI 36C10B26Q0834. Note: a DETAILED draft PWS is
// attached, yet isBindingSolicitation is false and procurementType is
// not_yet_determined. That combination is the whole point of this fixture.
FIXTURES['rfi-va-enterprise-ai.json'] = merge(base(), {
  sourceSnapshotVersion: 3,
  canonicalOpportunityId: cid('va-rfi-36C10B26Q0834'),
  sourceRecordId: 'ad537f8f7c044c7fadbe03e19193de21',
  solicitationFamily: {
    familyId: fid('36C10B26Q0834'),
    solicitationNumber: '36C10B26Q0834',
    linkBasis: 'solicitation_number',
    confidence: 'high',
    memberSourceRecordIds: ['ad537f8f7c044c7fadbe03e19193de21'],
  },
  publisher: {
    postingSource: { name: 'SAM.gov', portal: 'sam.gov', url: 'https://sam.gov' },
    leadBuyer: {
      name: 'Department of Veterans Affairs',
      office: 'Technology Acquisition Center NJ (36C10B)',
      requirementOwner: 'VA OIT Chief Artificial Intelligence Office',
      jurisdiction: 'US-federal',
    },
    officialSourceUrl: 'https://sam.gov/workspace/contract/opp/ad537f8f7c044c7fadbe03e19193de21/view',
    submissionPortal: {
      name: 'Email to Technology Acquisition Center',
      url: null,
      method: 'email',
      evidenceRef: { docId: 'doc:rfi', section: 'Response Instructions', page: null, quote: 'Responses shall be submitted electronically by 10:00 AM Eastern Standard Time, October 7, 2026, via email' },
    },
  },
  notice: {
    title: 'VA Enterprise Artificial Intelligence Support Services',
    noticeType: {
      value: 'sources_sought', raw: 'Sources Sought',
      isResponseInvited: true, isBindingSolicitation: false,
      evidenceRef: { docId: 'doc:rfi', section: 'opening', page: 1, quote: 'This is a Request for Information (RFI) only issued for conducting market research.' },
    },
    procurementType: {
      value: 'not_yet_determined', basis: 'document',
      components: [
        { value: 'custom_development', share: 'primary', evidenceRef: { docId: 'doc:rfi', section: '5.1 Scope', page: null, quote: 'Full development lifecycle: discovery, architecture, development, integration, testing' } },
        { value: 'managed_services', share: 'secondary', evidenceRef: { docId: 'doc:pws', section: '3.1 Annual Core Services', page: 8, quote: 'Tier 1, Tier 2, and Tier 3 support operations integrated with the VA Enterprise Service Desk' } },
      ],
      evidenceRef: { docId: 'doc:rfi', section: '5', page: null, quote: null },
    },
    contractVehicle: { value: 'none_yet', programName: null, obligationsSummary: 'Vehicle not established; RFI asks respondents which vehicles they hold.', evidenceRef: null },
    selectableLots: null,
  },
  // UNRESOLVED deadline conflict. The two sources denote DIFFERENT instants an
  // hour apart, so `utc` is null:
  //   literal "10:00 AM Eastern Standard Time" -> EST is UTC-05:00 -> 15:00Z
  //   structured responseDeadLine -04:00 (EDT) ->                     14:00Z
  // 7 October 2026 falls inside US Eastern DST, so the prose label "Standard"
  // is almost certainly a drafting slip -- but "almost certainly" is not
  // verification, and picking the later instant risks missing the deadline.
  // Neither source is marked as superseding the other.
  deadline: {
    originalText: 'Responses shall be submitted electronically by 10:00 AM Eastern Standard Time, October 7, 2026',
    wallClock: '2026-10-07T10:00:00',
    statedTimezone: 'Eastern Standard Time',
    resolvedZone: 'America/New_York',
    offsetMinutes: null,
    timezoneSource: 'named_zone',
    utc: null,
    utcConfidence: 'unknown',
    uncertaintyReason: 'conflicting_sources',
    verifiedAt: '2026-09-28T21:42:56.000Z',
    // Earliest candidate, for internal scheduling ONLY. Not a verified deadline.
    conservativePlanningUtc: '2026-10-07T14:00:00.000Z',
    conflicts: [
      {
        originalText: '10:00 AM Eastern Standard Time, October 7, 2026',
        utc: '2026-10-07T15:00:00.000Z',
        source: 'RFI document prose (36C10B26Q0834), taken literally: EST = UTC-05:00',
        observedAt: '2026-09-28T21:40:00.000Z',
        supersedes: null,
        note: 'Literal reading of the stated timezone. 7 Oct 2026 is inside US Eastern DST, so "Standard" may be a drafting slip - unverified either way.',
      },
      {
        originalText: '2026-10-07T10:00:00-04:00',
        utc: '2026-10-07T14:00:00.000Z',
        source: 'sam.gov responseDeadLine structured field (UTC-04:00, EDT)',
        observedAt: '2026-09-28T21:42:56.000Z',
        supersedes: null,
        note: 'Machine field. One hour EARLIER than the literal prose reading. Chosen as conservativePlanningUtc for that reason, not because it is verified.',
      },
    ],
  },
  value: { published: null, modelEstimate: null },
  documents: {
    coverage: 'complete_for_this_notice', accessBarrier: 'none',
    counts: { listed: 2, downloaded: 2, parsed: 2, inaccessible: 0 },
    items: [
      {
        docId: 'doc:pws', filename: 'PWS - Enterprise AI Support Services Draft.docx',
        url: 'https://sam.gov/api/prod/opps/v3/opportunities/resources/files/39948bda93e74362bd453479a865baaf/download',
        role: 'draft_pws', documentVersion: 'PWS v2.0', documentDate: '2026-09-22',
        sha256: SHA('pws-placeholder'), byteSize: 136527,
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        retrieval: { status: 'downloaded', method: 'direct_download', retrievedAt: '2026-09-28T21:36:00.000Z', failureReason: null },
        extraction: { status: 'parsed', method: 'docx_xml', reviewedBy: 'hybrid', reviewedAt: '2026-09-28T21:40:00.000Z' },
        supersededByDocId: null,
      },
      {
        docId: 'doc:rfi', filename: 'RFI - Veterans Affairs AI platform 3rd party support services.docx',
        url: 'https://sam.gov/api/prod/opps/v3/opportunities/resources/files/8ed266af08614a4a936eed3d6a731ee0/download',
        role: 'rfi', documentVersion: null, documentDate: null,
        sha256: SHA('rfi-placeholder'), byteSize: 50897,
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        retrieval: { status: 'downloaded', method: 'direct_download', retrievedAt: '2026-09-28T21:36:00.000Z', failureReason: null },
        extraction: { status: 'parsed', method: 'docx_xml', reviewedBy: 'hybrid', reviewedAt: '2026-09-28T21:40:00.000Z' },
        supersededByDocId: null,
      },
    ],
    amendments: [],
  },
  // Four bindingStatus values in one record: this is the distinction the
  // contract exists to make.
  requirements: [
    {
      id: 'req.uei', text: 'System for Award Management (SAM) Unique Entity Identifier (UEI)',
      category: 'registration', applicability: 'always', applicabilityNote: null, applicabilityEvidenceRef: null,
      responsibleParty: 'bidder', dueStage: 'submission',
      bindingStatus: 'mandatory_response_instruction',
      evidenceRef: { docId: 'doc:rfi', section: 'Information to include in a response', page: null, quote: 'System for Award Management (SAM) Unique Entity Identifier (UEI):' },
    },
    {
      id: 'req.vaar.219-75',
      text: 'Ability to comply with VAAR 852.219-75 Notice of Limitations on Subcontracting - Certificate of Compliance for Services and Construction (Jan 2023) (Deviation)',
      category: 'subcontracting', applicability: 'always', applicabilityNote: null, applicabilityEvidenceRef: null,
      responsibleParty: 'bidder', dueStage: 'submission',
      bindingStatus: 'mandatory_response_instruction',
      evidenceRef: { docId: 'doc:rfi', section: 'Information to include in a response', page: null, quote: 'The ability to comply with VAAR 852.219-75' },
    },
    {
      id: 'req.format.20pages', text: 'Responses shall not exceed 20 pages excluding cover page and appendices; MS Word, minimum 11-point font, 1-inch margins',
      category: 'format', applicability: 'always', applicabilityNote: null, applicabilityEvidenceRef: null,
      responsibleParty: 'bidder', dueStage: 'submission',
      bindingStatus: 'mandatory_response_instruction',
      evidenceRef: { docId: 'doc:rfi', section: 'Response Instructions', page: null, quote: 'Responses shall not exceed 20 pages' },
    },
    {
      id: 'req.508', text: 'Section 508 conformance and applicable VA security requirements on all deliverables',
      category: 'accessibility', applicability: 'unknown',
      applicabilityNote: 'Appears in a DRAFT PWS. Binds nobody until a solicitation issues.',
      applicabilityEvidenceRef: null,
      responsibleParty: 'bidder', dueStage: 'delivery',
      bindingStatus: 'draft_future_obligation',
      evidenceRef: { docId: 'doc:pws', section: '5.4 Safety and governance', page: null, quote: 'Section 508 conformance and applicable VA security requirements on all deliverables' },
    },
    {
      id: 'req.rmf.ato', text: 'Task-level support for cybersecurity, privacy, RMF and ATO activities',
      category: 'security', applicability: 'conditional',
      applicabilityNote: 'Contractor SUPPORTS VA’s RMF/ATO process; the AI product carries its own authorization. Not a demand that the bidder hold an ATO.',
      applicabilityEvidenceRef: { docId: 'doc:pws', section: '3.1', page: 8, quote: 'Task-level support for cybersecurity, privacy, Risk Management Framework (RMF) and Authority to Operate (ATO) activities' },
      responsibleParty: 'shared', dueStage: 'delivery',
      bindingStatus: 'draft_future_obligation',
      evidenceRef: { docId: 'doc:pws', section: '3.1', page: 8, quote: null },
    },
    {
      id: 'q.subcontract.share', text: 'How much of this potential requirement would your company need to subcontract to other companies, if any?',
      category: 'subcontracting', applicability: 'always', applicabilityNote: null, applicabilityEvidenceRef: null,
      responsibleParty: 'bidder', dueStage: 'submission',
      bindingStatus: 'rfi_question',
      evidenceRef: { docId: 'doc:rfi', section: 'Information to include in a response', page: null, quote: 'How much of this potential requirement would your company need to subcontract' },
    },
  ],
  timestamps: {
    sourceObservedAt: '2026-09-28T07:45:00.000Z',
    fetchedAt: '2026-09-28T21:36:00.000Z',
    enrichedAt: '2026-09-28T07:45:11.000Z',
    documentReviewedAt: '2026-09-28T21:40:00.000Z',
    lastVerifiedAtSource: '2026-09-28T21:42:56.000Z',
  },
  sourceAssessment: {
    serviceCategories: ['ai_implementation', 'custom_software', 'workflow_automation', 'managed_services'],
    relevanceBasis: 'document', assessedBy: 'opportunity-pulse/document-review',
    method: 'manual-read-of-pws-and-rfi',
    evidenceRefs: [{ docId: 'doc:pws', section: '3.1', page: 8, quote: null }, { docId: 'doc:rfi', section: '5.1', page: null, quote: null }],
    isNotEligibilityDetermination: true, legacyVerdict: null,
  },
  legacy: {
    fitScore: 47, priorityScore: null, enrichmentVersion: 1, enrichmentHash: null,
    pursuitStatus: 'none', pursuitStatusChangedAt: null,
    deprecation: { status: 'advisory_only', guidance: 'fitScore is title/summary-derived and is not an eligibility signal. Do not rank on it.', earliestRemovalVersion: 'gov-opportunity.v3' },
  },
});

// -------------------------------------------------- 2. Verified solicitation
FIXTURES['solicitation-verified.json'] = merge(base(), {
  sourceSnapshotVersion: 2,
  canonicalOpportunityId: cid('sol-verified'),
  sourceRecordId: '0844995c89404dfbbe638692a0d0f7e2',
  solicitationFamily: { familyId: fid('M6785426I4208'), solicitationNumber: 'M6785426I4208', linkBasis: 'solicitation_number', confidence: 'high', memberSourceRecordIds: ['0844995c89404dfbbe638692a0d0f7e2'] },
  publisher: {
    leadBuyer: { name: 'United States Marine Corps', office: 'MCCE Program Office', requirementOwner: null, jurisdiction: 'US-federal' },
    officialSourceUrl: 'https://sam.gov/opp/0844995c89404dfbbe638692a0d0f7e2/view',
    submissionPortal: { name: 'SAM.gov', url: 'https://sam.gov', method: 'portal_upload', evidenceRef: { docId: 'doc:sol', section: 'L.1', page: 12, quote: 'Offers shall be submitted through SAM.gov' } },
  },
  notice: {
    title: 'Marine Corps Cyberspace Environment Operational Support Services',
    noticeType: { value: 'solicitation', raw: 'Solicitation', isResponseInvited: true, isBindingSolicitation: true, evidenceRef: { docId: 'doc:sol', section: 'cover', page: 1, quote: null } },
    procurementType: { value: 'professional_services', basis: 'document', evidenceRef: { docId: 'doc:sol', section: 'C.1', page: 5, quote: 'The Contractor shall provide operational support services' } },
    contractVehicle: { value: 'idiq', programName: null, obligationsSummary: 'Single-award IDIQ, 5-year ordering period.', evidenceRef: { docId: 'doc:sol', section: 'B.1', page: 3, quote: null } },
    selectableLots: [],
  },
  deadline: {
    originalText: 'Offers due 19 October 2026, 5:00 PM EDT', wallClock: '2026-10-19T17:00:00',
    statedTimezone: 'EDT', resolvedZone: 'America/New_York', offsetMinutes: -240,
    timezoneSource: 'abbreviation', utc: '2026-10-19T21:00:00.000Z', utcConfidence: 'high',
    uncertaintyReason: null, verifiedAt: '2026-09-28T21:00:00.000Z', conflicts: [],
  },
  value: {
    published: { amountMinorUnits: 4500000000, currency: 'USD', valueType: 'ceiling', provenance: 'buyer_stated', evidenceRef: { docId: 'doc:sol', section: 'B.2', page: 3, quote: 'Total ceiling shall not exceed $45,000,000' } },
    modelEstimate: null,
  },
  documents: {
    coverage: 'complete', accessBarrier: 'none',
    counts: { listed: 1, downloaded: 1, parsed: 1, inaccessible: 0 },
    items: [{
      docId: 'doc:sol', filename: 'M6785426I4208-solicitation.pdf', url: 'https://sam.gov/example/download',
      role: 'solicitation', documentVersion: 'Rev 0', documentDate: '2026-09-18',
      sha256: SHA('sol'), byteSize: 884321, mediaType: 'application/pdf',
      retrieval: { status: 'downloaded', method: 'direct_download', retrievedAt: '2026-09-28T21:00:00.000Z', failureReason: null },
      extraction: { status: 'parsed', method: 'pdf_text', reviewedBy: 'model', reviewedAt: '2026-09-28T21:05:00.000Z' },
      supersededByDocId: null,
    }],
    amendments: [],
  },
  requirements: [{
    id: 'req.clearance', text: 'Key personnel shall hold an active Secret clearance at time of award',
    category: 'citizenship', applicability: 'always', applicabilityNote: null, applicabilityEvidenceRef: null,
    responsibleParty: 'bidder', dueStage: 'award', bindingStatus: 'binding_solicitation_requirement',
    evidenceRef: { docId: 'doc:sol', section: 'H.3', page: 22, quote: 'Key personnel shall hold an active Secret clearance' },
  }],
  timestamps: { sourceObservedAt: '2026-09-28T07:00:00.000Z', fetchedAt: '2026-09-28T21:00:00.000Z', enrichedAt: '2026-09-28T07:10:00.000Z', documentReviewedAt: '2026-09-28T21:05:00.000Z', lastVerifiedAtSource: '2026-09-28T21:00:00.000Z' },
  sourceAssessment: { serviceCategories: ['professional_services'], relevanceBasis: 'document', assessedBy: 'opportunity-pulse/document-review', method: 'pdf-extract', evidenceRefs: [{ docId: 'doc:sol', section: 'C.1', page: 5, quote: null }], isNotEligibilityDetermination: true, legacyVerdict: null },
  legacy: { fitScore: 46, priorityScore: 62, enrichmentVersion: 1, enrichmentHash: 'abc123', pursuitStatus: 'none', pursuitStatusChangedAt: null, deprecation: { status: 'advisory_only', guidance: 'Advisory only.', earliestRemovalVersion: null } },
});

// ------------------------------------------------------ 3. Courtesy posting
// NASPO SW1045: posted on Utah's Bonfire, lead buyer Oklahoma, submitted via
// Oklahoma's portal. Three distinct parties -- the reason they are separate fields.
FIXTURES['courtesy-posting-naspo-sw1045.json'] = merge(base(), {
  canonicalOpportunityId: cid('naspo-sw1045'),
  sourceRecordId: 'bonfire:agency:utah:249683',
  sourceAliases: [
    { idType: 'external_id', idValue: 'bonfire:agency:utah:NASPO Courtesy Posting- Emerging Technologies Consulting and Services', observedAt: '2026-08-21T07:48:09.000Z', note: 'Title-derived legacy external_id. Unstable: changes if the buyer edits the title. Retained as an alias only, never as a key.' },
    { idType: 'portal_url', idValue: 'https://utah.bonfirehub.com/opportunities/249683', observedAt: '2026-09-28T07:45:00.000Z', note: null },
  ],
  solicitationFamily: { familyId: fid('SW1045'), solicitationNumber: 'SW1045', linkBasis: 'explicit_source_reference', confidence: 'high', memberSourceRecordIds: ['bonfire:agency:utah:249683'] },
  publisher: {
    isCourtesyPosting: true,
    postingSource: { name: 'State of Utah (U3P)', portal: 'bonfire', url: 'https://utah.bonfirehub.com/opportunities/249683' },
    leadBuyer: { name: 'State of Oklahoma', office: null, requirementOwner: 'NASPO ValuePoint', jurisdiction: 'US-OK' },
    officialSourceUrl: 'https://www.naspovaluepoint.org/solicitations/sw1045/',
    submissionPortal: { name: 'Oklahoma Supplier Portal', url: 'https://financials.ok.gov/psc/SOKLFP1DS/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL', method: 'portal_upload', evidenceRef: { docId: 'doc:naspo-page', section: 'Solicitation details', page: null, quote: 'Lead State: Oklahoma' } },
  },
  notice: {
    title: 'Emerging Technologies Consulting and Services',
    noticeType: { value: 'courtesy_posting', raw: 'NASPO Courtesy Posting', isResponseInvited: true, isBindingSolicitation: true, evidenceRef: { docId: 'doc:naspo-page', section: 'body', page: null, quote: 'Request for Proposal (RFP) for the Emerging Technologies Consulting and Services' } },
    procurementType: { value: 'professional_services', basis: 'summary', evidenceRef: { docId: 'doc:naspo-page', section: 'body', page: null, quote: 'Emerging Technologies Consulting and Services' } },
    contractVehicle: { value: 'cooperative_master_agreement', programName: 'NASPO ValuePoint', obligationsSummary: 'Multi-state master agreement. Administrative-fee, reporting and sustained-capacity obligations NOT yet verified.', evidenceRef: { docId: 'doc:naspo-page', section: 'Solicitation details', page: null, quote: 'Solicitation Number: SW1045' } },
    selectableLots: null,
  },
  deadline: {
    originalText: 'All vendor proposals must be submitted by 3 p.m., Central Time on October 15, 2026.',
    wallClock: '2026-10-15T15:00:00', statedTimezone: 'Central Time', resolvedZone: 'America/Chicago',
    offsetMinutes: -300, timezoneSource: 'named_zone', utc: '2026-10-15T20:00:00.000Z',
    utcConfidence: 'high', uncertaintyReason: null, verifiedAt: '2026-09-28T16:29:00.000Z',
    conflicts: [{
      originalText: '(derived) 2026-10-15T14:00:00.000Z',
      utc: '2026-10-15T14:00:00.000Z',
      source: 'opportunity-pulse legacy scraper (timezone-stripping parser, pre-fix)',
      observedAt: '2026-08-21T07:48:09.000Z',
      supersedes: false,
      note: 'Six hours early. Produced by the defect this contract’s deadline block exists to surface. Retained so the discrepancy is auditable rather than silently overwritten.',
    }],
  },
  value: {
    published: null,
    modelEstimate: { amountMinorUnits: 25000000, currency: 'USD', method: 'llm-title-inference-v1', generatedAt: '2026-08-21T07:48:09.000Z', notForRevenuePlanning: true },
  },
  documents: {
    coverage: 'partial', accessBarrier: 'bot_protection',
    counts: { listed: 1, downloaded: 1, parsed: 1, inaccessible: 1 },
    items: [{
      docId: 'doc:naspo-page', filename: 'naspo-sw1045.html', url: 'https://www.naspovaluepoint.org/solicitations/sw1045/',
      role: 'other', documentVersion: null, documentDate: null,
      sha256: SHA('naspo-page'), byteSize: 46946, mediaType: 'text/html',
      retrieval: { status: 'downloaded', method: 'direct_download', retrievedAt: '2026-09-28T16:29:00.000Z', failureReason: null },
      extraction: { status: 'parsed', method: 'html', reviewedBy: 'hybrid', reviewedAt: '2026-09-28T16:30:00.000Z' },
      supersededByDocId: null,
    }, {
      docId: 'doc:sw1045-package', filename: '(SW1045 RFP package)', url: 'https://financials.ok.gov/psc/SOKLFP1DS/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL',
      role: 'solicitation', documentVersion: null, documentDate: null, sha256: null, byteSize: null, mediaType: null,
      retrieval: { status: 'not_attempted', method: 'none', retrievedAt: null, failureReason: 'Oklahoma portal requires an interactive session; courtesy posting returns HTTP 403 to direct requests.' },
      extraction: null, supersededByDocId: null,
    }],
    amendments: [],
  },
  // Empty on purpose: coverage=partial says absence is NOT evidence of none.
  requirements: [],
  timestamps: { sourceObservedAt: '2026-09-28T07:45:00.000Z', fetchedAt: '2026-09-28T16:29:00.000Z', enrichedAt: '2026-08-21T07:48:09.000Z', documentReviewedAt: '2026-09-28T16:30:00.000Z', lastVerifiedAtSource: '2026-09-28T16:29:00.000Z' },
  sourceAssessment: { serviceCategories: ['consulting', 'ai_implementation'], relevanceBasis: 'summary', assessedBy: 'opportunity-pulse/document-review', method: 'lead-source-page-read', evidenceRefs: [{ docId: 'doc:naspo-page', section: 'body', page: null, quote: null }], isNotEligibilityDetermination: true, legacyVerdict: null },
  legacy: { fitScore: 70, priorityScore: 54, enrichmentVersion: 1, enrichmentHash: null, pursuitStatus: 'none', pursuitStatusChangedAt: null, deprecation: { status: 'advisory_only', guidance: 'Advisory only.', earliestRemovalVersion: null } },
});

// ------------------------------------------------------- 4. Missing documents
FIXTURES['missing-documents-bonfire-403.json'] = merge(base(), {
  canonicalOpportunityId: cid('fortworth-ivr'),
  sourceRecordId: 'bonfire:agency:fortworthtexas:245046',
  publisher: {
    postingSource: { name: 'City of Fort Worth', portal: 'bonfire', url: 'https://fortworthtexas.bonfirehub.com/opportunities/245046' },
    leadBuyer: { name: 'City of Fort Worth', office: null, requirementOwner: null, jurisdiction: 'US-TX' },
    officialSourceUrl: 'https://fortworthtexas.bonfirehub.com/opportunities/245046',
    submissionPortal: null,
  },
  notice: {
    title: 'RFP AI-based Interactive Voice Response Solution',
    noticeType: { value: 'unknown', raw: null, isResponseInvited: true, isBindingSolicitation: false, evidenceRef: null },
    // Cannot tell build-from-scratch vs licence-an-IVR-product without the package.
    procurementType: { value: 'unknown', basis: 'title', evidenceRef: null },
    contractVehicle: { value: 'unknown', programName: null, obligationsSummary: null, evidenceRef: null },
    selectableLots: null,
  },
  deadline: {
    originalText: 'Oct 22nd 2026, 2:00 PM CDT', wallClock: '2026-10-22T14:00:00', statedTimezone: 'CDT',
    resolvedZone: 'America/Chicago', offsetMinutes: -300, timezoneSource: 'abbreviation',
    utc: '2026-10-22T19:00:00.000Z', utcConfidence: 'high', uncertaintyReason: null,
    verifiedAt: null, conflicts: [],
  },
  value: { published: null, modelEstimate: { amountMinorUnits: 30000000, currency: 'USD', method: 'llm-title-inference-v1', generatedAt: '2026-09-28T07:45:00.000Z', notForRevenuePlanning: true } },
  documents: {
    coverage: 'inaccessible', accessBarrier: 'bot_protection',
    counts: { listed: 0, downloaded: 0, parsed: 0, inaccessible: 0 },
    items: [], amendments: [],
  },
  requirements: [],
  timestamps: { sourceObservedAt: '2026-09-28T07:45:00.000Z', fetchedAt: null, enrichedAt: '2026-09-28T07:45:11.000Z', documentReviewedAt: null, lastVerifiedAtSource: '2026-09-28T16:40:00.000Z' },
  sourceAssessment: { serviceCategories: ['ai_implementation'], relevanceBasis: 'title', assessedBy: 'opportunity-pulse/title-screen', method: 'keyword', evidenceRefs: [], isNotEligibilityDetermination: true, legacyVerdict: null },
  legacy: { fitScore: 75, priorityScore: 81, enrichmentVersion: 1, enrichmentHash: null, pursuitStatus: 'none', pursuitStatusChangedAt: null, deprecation: { status: 'advisory_only', guidance: 'priorityScore 81 is the highest in the pool yet this row is demoted by a title regex with no AI term. Do not rank on it.', earliestRemovalVersion: null } },
});

// -------------------------------------------------------- 5. Uncertain value
FIXTURES['uncertain-value.json'] = merge(base(), {
  canonicalOpportunityId: cid('uncertain-value'),
  sourceRecordId: 'bonfire:agency:harriscountytx:235035',
  publisher: {
    postingSource: { name: 'Harris County', portal: 'bonfire', url: 'https://harriscountytx.bonfirehub.com/opportunities/235035' },
    leadBuyer: { name: 'Harris County', office: 'Sheriff’s Office', requirementOwner: null, jurisdiction: 'US-TX' },
    officialSourceUrl: 'https://harriscountytx.bonfirehub.com/opportunities/235035',
    submissionPortal: null,
  },
  notice: {
    title: 'RFP - Integrated Law Enforcement Data Platform',
    noticeType: { value: 'solicitation', raw: 'RFP', isResponseInvited: true, isBindingSolicitation: true, evidenceRef: null },
    procurementType: { value: 'unknown', basis: 'title', evidenceRef: null },
    contractVehicle: { value: 'unknown', programName: null, obligationsSummary: null, evidenceRef: null },
    selectableLots: null,
  },
  deadline: { originalText: 'Oct 5th 2026, 2:00 PM CDT', wallClock: '2026-10-05T14:00:00', statedTimezone: 'CDT', resolvedZone: 'America/Chicago', offsetMinutes: -300, timezoneSource: 'abbreviation', utc: '2026-10-05T19:00:00.000Z', utcConfidence: 'high', uncertaintyReason: null, verifiedAt: null, conflicts: [] },
  // The point: published is null, an estimate exists, and they never merge.
  value: {
    published: null,
    modelEstimate: { amountMinorUnits: 100000000, currency: 'USD', method: 'llm-title-inference-v1', generatedAt: '2026-09-28T07:45:00.000Z', notForRevenuePlanning: true },
  },
  documents: { coverage: 'inaccessible', accessBarrier: 'bot_protection', counts: { listed: 0, downloaded: 0, parsed: 0, inaccessible: 0 }, items: [], amendments: [] },
  requirements: [],
  timestamps: { sourceObservedAt: '2026-09-28T07:45:00.000Z', fetchedAt: null, enrichedAt: '2026-09-28T07:45:11.000Z', documentReviewedAt: null, lastVerifiedAtSource: '2026-09-28T16:40:00.000Z' },
  sourceAssessment: { serviceCategories: ['data_engineering'], relevanceBasis: 'title', assessedBy: 'opportunity-pulse/title-screen', method: 'keyword', evidenceRefs: [], isNotEligibilityDetermination: true, legacyVerdict: null },
  legacy: { fitScore: 75, priorityScore: 76, enrichmentVersion: 1, enrichmentHash: null, pursuitStatus: 'none', pursuitStatusChangedAt: null, deprecation: { status: 'advisory_only', guidance: 'Advisory only.', earliestRemovalVersion: null } },
});

// ------------------------------------------------------- 6. Deadline conflict
FIXTURES['deadline-conflict-unresolved.json'] = merge(base(), {
  canonicalOpportunityId: cid('deadline-conflict'),
  sourceRecordId: 'bonfire:agency:utah:249683#conflict',
  publisher: {
    isCourtesyPosting: true,
    postingSource: { name: 'State of Utah (U3P)', portal: 'bonfire', url: 'https://utah.bonfirehub.com/opportunities/249683' },
    leadBuyer: { name: 'State of Oklahoma', office: null, requirementOwner: 'NASPO ValuePoint', jurisdiction: 'US-OK' },
    officialSourceUrl: 'https://www.naspovaluepoint.org/solicitations/sw1045/',
    submissionPortal: null,
  },
  notice: {
    title: 'Emerging Technologies Consulting and Services (conflicting deadlines)',
    noticeType: { value: 'courtesy_posting', raw: null, isResponseInvited: true, isBindingSolicitation: true, evidenceRef: null },
    procurementType: { value: 'professional_services', basis: 'summary', evidenceRef: null },
    contractVehicle: { value: 'cooperative_master_agreement', programName: 'NASPO ValuePoint', obligationsSummary: null, evidenceRef: null },
    selectableLots: null,
  },
  // utc is NULL although two candidate instants are known: neither source has
  // been established as authoritative, so we refuse to pick one.
  deadline: {
    originalText: 'All vendor proposals must be submitted by 3 p.m., Central Time on October 15, 2026.',
    wallClock: '2026-10-15T15:00:00', statedTimezone: 'Central Time', resolvedZone: 'America/Chicago',
    offsetMinutes: null, timezoneSource: 'named_zone', utc: null, utcConfidence: 'unknown',
    uncertaintyReason: 'conflicting_sources', verifiedAt: '2026-09-28T16:29:00.000Z',
    conflicts: [
      { originalText: 'All vendor proposals must be submitted by 3 p.m., Central Time on October 15, 2026.', utc: '2026-10-15T20:00:00.000Z', source: 'naspovaluepoint.org lead-source page', observedAt: '2026-09-28T16:29:00.000Z', supersedes: null, note: 'Lead source.' },
      { originalText: 'Oct 15th 2026, 2:00 PM MDT', utc: '2026-10-15T20:00:00.000Z', source: 'utah.bonfirehub.com courtesy posting (post-fix parse)', observedAt: '2026-09-28T07:45:00.000Z', supersedes: null, note: 'Agrees with lead source once the timezone is honoured.' },
      { originalText: '(derived) 2026-10-15T14:00:00.000Z', utc: '2026-10-15T14:00:00.000Z', source: 'opportunity-pulse legacy parser (pre-fix)', observedAt: '2026-08-21T07:48:09.000Z', supersedes: false, note: 'Timezone-stripped. Retained for audit only; must not be used.' },
    ],
  },
  value: { published: null, modelEstimate: null },
  documents: { coverage: 'partial', accessBarrier: 'bot_protection', counts: { listed: 1, downloaded: 1, parsed: 1, inaccessible: 1 }, items: [], amendments: [] },
  requirements: [],
  timestamps: { sourceObservedAt: '2026-09-28T07:45:00.000Z', fetchedAt: '2026-09-28T16:29:00.000Z', enrichedAt: null, documentReviewedAt: '2026-09-28T16:30:00.000Z', lastVerifiedAtSource: '2026-09-28T16:29:00.000Z' },
  sourceAssessment: { serviceCategories: [], relevanceBasis: 'summary', assessedBy: null, method: null, evidenceRefs: [], isNotEligibilityDetermination: true, legacyVerdict: null },
});

// ------------------------------------------------------------- 7. Amendment
FIXTURES['amendment-extends-deadline.json'] = merge(base(), {
  sourceSnapshotVersion: 4,
  canonicalOpportunityId: cid('amendment-case'),
  sourceRecordId: 'sam:amend:0001',
  solicitationFamily: { familyId: fid('VLF-RECEIVER'), solicitationNumber: 'N0002426R0001', linkBasis: 'solicitation_number', confidence: 'high', memberSourceRecordIds: ['sam:amend:0001', 'sam:base:0001'] },
  publisher: {
    leadBuyer: { name: 'Department of the Navy', office: null, requirementOwner: null, jurisdiction: 'US-federal' },
    officialSourceUrl: 'https://sam.gov/opp/example-amendment/view',
    submissionPortal: { name: 'SAM.gov', url: 'https://sam.gov', method: 'portal_upload', evidenceRef: null },
  },
  notice: {
    title: 'Amendment #10: Common Very Low Frequency Receiver',
    noticeType: { value: 'amendment', raw: 'Amendment', isResponseInvited: true, isBindingSolicitation: true, evidenceRef: null },
    procurementType: { value: 'mixed', basis: 'document', components: [{ value: 'custom_development', share: 'primary', evidenceRef: { docId: 'doc:amend10', section: '1', page: 1, quote: 'engineering development' } }, { value: 'professional_services', share: 'secondary', evidenceRef: { docId: 'doc:amend10', section: '1', page: 1, quote: 'integration support' } }], evidenceRef: null },
    contractVehicle: { value: 'standalone_contract', programName: null, obligationsSummary: null, evidenceRef: null },
    selectableLots: null,
  },
  deadline: {
    originalText: 'Amended: offers due 2 November 2026, 4:00 PM EST', wallClock: '2026-11-02T16:00:00',
    statedTimezone: 'EST', resolvedZone: 'America/New_York', offsetMinutes: -300,
    timezoneSource: 'abbreviation', utc: '2026-11-02T21:00:00.000Z', utcConfidence: 'high',
    uncertaintyReason: null, verifiedAt: '2026-09-28T21:00:00.000Z',
    conflicts: [{ originalText: 'Offers due 19 October 2026, 5:00 PM EDT', utc: '2026-10-19T21:00:00.000Z', source: 'base solicitation (superseded by Amendment #10)', observedAt: '2026-09-01T00:00:00.000Z', supersedes: false, note: 'Original deadline. Superseded, retained for audit.' }],
  },
  value: { published: { amountMinorUnits: null, currency: 'USD', valueType: 'unknown', provenance: 'unknown', evidenceRef: null }, modelEstimate: null },
  documents: {
    coverage: 'complete', accessBarrier: 'none',
    counts: { listed: 2, downloaded: 2, parsed: 2, inaccessible: 0 },
    items: [{
      docId: 'doc:amend10', filename: 'amendment-0010.pdf', url: 'https://sam.gov/example/amend10',
      role: 'amendment', documentVersion: 'Amendment 0010', documentDate: '2026-09-20',
      sha256: SHA('amend10'), byteSize: 24110, mediaType: 'application/pdf',
      retrieval: { status: 'downloaded', method: 'direct_download', retrievedAt: '2026-09-28T21:00:00.000Z', failureReason: null },
      extraction: { status: 'parsed', method: 'pdf_text', reviewedBy: 'model', reviewedAt: '2026-09-28T21:02:00.000Z' },
      supersededByDocId: null,
    }, {
      docId: 'doc:base', filename: 'base-solicitation.pdf', url: 'https://sam.gov/example/base',
      role: 'solicitation', documentVersion: 'Rev 0', documentDate: '2026-08-15',
      sha256: SHA('base'), byteSize: 990211, mediaType: 'application/pdf',
      retrieval: { status: 'downloaded', method: 'direct_download', retrievedAt: '2026-09-28T21:00:00.000Z', failureReason: null },
      extraction: { status: 'parsed', method: 'pdf_text', reviewedBy: 'model', reviewedAt: '2026-09-28T21:02:00.000Z' },
      supersededByDocId: 'doc:amend10',
    }],
    amendments: [{ amendmentId: 'amend:0010', number: '0010', issuedDate: '2026-09-20', observedAt: '2026-09-28T21:00:00.000Z', docId: 'doc:amend10', affects: ['deadline', 'requirements'], summary: 'Extends the offer due date and revises Section L submission instructions.' }],
  },
  requirements: [],
  timestamps: { sourceObservedAt: '2026-09-28T07:00:00.000Z', fetchedAt: '2026-09-28T21:00:00.000Z', enrichedAt: null, documentReviewedAt: '2026-09-28T21:02:00.000Z', lastVerifiedAtSource: '2026-09-28T21:00:00.000Z' },
  sourceAssessment: { serviceCategories: ['custom_software'], relevanceBasis: 'document', assessedBy: 'opportunity-pulse/document-review', method: 'pdf-extract', evidenceRefs: [], isNotEligibilityDetermination: true, legacyVerdict: null },
});

// ---------------------------------------------------------- 8. Missing verdict
FIXTURES['missing-verdict.json'] = merge(base(), {
  canonicalOpportunityId: cid('missing-verdict'),
  sourceRecordId: 'bonfire:agency:dallascityhall:252009',
  publisher: {
    postingSource: { name: 'City of Dallas', portal: 'bonfire', url: 'https://dallascityhall.bonfirehub.com/opportunities/252009' },
    leadBuyer: { name: 'City of Dallas', office: null, requirementOwner: null, jurisdiction: 'US-TX' },
    officialSourceUrl: 'https://dallascityhall.bonfirehub.com/opportunities/252009',
    submissionPortal: null,
  },
  notice: {
    title: 'AI-Assisted Digital Evidence Analysis Platform',
    noticeType: { value: 'solicitation', raw: 'RFP', isResponseInvited: true, isBindingSolicitation: true, evidenceRef: null },
    procurementType: { value: 'unknown', basis: 'title', evidenceRef: null },
    contractVehicle: { value: 'unknown', programName: null, obligationsSummary: null, evidenceRef: null },
    selectableLots: null,
  },
  deadline: { originalText: 'Oct 23rd 2026, 1:00 PM CDT', wallClock: '2026-10-23T13:00:00', statedTimezone: 'CDT', resolvedZone: 'America/Chicago', offsetMinutes: -300, timezoneSource: 'abbreviation', utc: '2026-10-23T18:00:00.000Z', utcConfidence: 'high', uncertaintyReason: null, verifiedAt: null, conflicts: [] },
  value: { published: null, modelEstimate: { amountMinorUnits: 100000000, currency: 'USD', method: 'llm-title-inference-v1', generatedAt: '2026-09-28T07:45:00.000Z', notForRevenuePlanning: true } },
  documents: { coverage: 'inaccessible', accessBarrier: 'bot_protection', counts: { listed: 0, downloaded: 0, parsed: 0, inaccessible: 0 }, items: [], amendments: [] },
  requirements: [],
  timestamps: { sourceObservedAt: '2026-09-28T07:45:00.000Z', fetchedAt: null, enrichedAt: '2026-09-28T07:45:11.000Z', documentReviewedAt: null, lastVerifiedAtSource: '2026-09-28T16:40:00.000Z' },
  // legacyVerdict null = never vetted. Distinct from "vetted and cleared".
  sourceAssessment: { serviceCategories: ['ai_implementation'], relevanceBasis: 'title', assessedBy: 'opportunity-pulse/title-screen', method: 'keyword', evidenceRefs: [], isNotEligibilityDetermination: true, legacyVerdict: null },
  legacy: { fitScore: 80, priorityScore: 79, enrichmentVersion: 1, enrichmentHash: null, pursuitStatus: 'none', pursuitStatusChangedAt: null, deprecation: { status: 'advisory_only', guidance: 'Advisory only. legacyVerdict null means NOT VETTED, not cleared.', earliestRemovalVersion: null } },
});

// --------------------------------------------------------- 9. Declined status
FIXTURES['declined-with-legacy-verdict.json'] = merge(base(), {
  canonicalOpportunityId: cid('declined-upskilling'),
  sourceRecordId: 'bonfire:agency:wfsdallas:244997',
  publisher: {
    postingSource: { name: 'Workforce Solutions Greater Dallas', portal: 'bonfire', url: 'https://wfsdallas.bonfirehub.com/opportunities/244997' },
    leadBuyer: { name: 'Workforce Solutions Greater Dallas', office: null, requirementOwner: null, jurisdiction: 'US-TX' },
    officialSourceUrl: 'https://wfsdallas.bonfirehub.com/opportunities/244997',
    submissionPortal: null,
  },
  notice: {
    title: 'Upskilling Projects - 2025',
    noticeType: { value: 'unknown', raw: null, isResponseInvited: true, isBindingSolicitation: false, evidenceRef: null },
    // Unresolved: procurement vs employer funding vs provider registration.
    procurementType: { value: 'unknown', basis: 'title', evidenceRef: null },
    contractVehicle: { value: 'unknown', programName: null, obligationsSummary: null, evidenceRef: null },
    selectableLots: null,
  },
  deadline: { originalText: 'Sep 30th 2026, 11:30 AM CDT', wallClock: '2026-09-30T11:30:00', statedTimezone: 'CDT', resolvedZone: 'America/Chicago', offsetMinutes: -300, timezoneSource: 'abbreviation', utc: '2026-09-30T16:30:00.000Z', utcConfidence: 'high', uncertaintyReason: null, verifiedAt: null, conflicts: [] },
  value: { published: null, modelEstimate: { amountMinorUnits: 30000000, currency: 'USD', method: 'llm-title-inference-v1', generatedAt: '2026-06-20T13:56:17.000Z', notForRevenuePlanning: true } },
  documents: { coverage: 'inaccessible', accessBarrier: 'bot_protection', counts: { listed: 0, downloaded: 0, parsed: 0, inaccessible: 0 }, items: [], amendments: [] },
  requirements: [],
  timestamps: { sourceObservedAt: '2026-09-28T07:45:00.000Z', fetchedAt: null, enrichedAt: '2026-06-20T13:56:17.000Z', documentReviewedAt: null, lastVerifiedAtSource: '2026-09-28T16:40:00.000Z' },
  sourceAssessment: {
    serviceCategories: ['training'], relevanceBasis: 'title', assessedBy: 'opportunity-pulse/title-screen', method: 'keyword', evidenceRefs: [],
    isNotEligibilityDetermination: true,
    legacyVerdict: {
      status: 'no_bid', disqualifier: 'DOMAIN_MISMATCH',
      label: 'Not a bid: employer-applies model; register as a training provider instead',
      method: 'title_regex',
      evidence: null,
      vettedAt: '2026-06-20T13:56:17.000Z',
      scope: 'this_notice',
    },
  },
  legacy: {
    fitScore: 75, priorityScore: 59, enrichmentVersion: 1, enrichmentHash: null,
    pursuitStatus: 'declined', pursuitStatusChangedAt: '2026-06-20T14:00:00.000Z',
    deprecation: { status: 'advisory_only', guidance: 'pursuitStatus=declined is an OP-local operator action, NOT an authoritative decision for the consumer. legacyVerdict was produced by a /upskill/i title regex with evidence=null.', earliestRemovalVersion: null },
  },
});

// ------------------------------------------------- 10. Duplicate source aliases
// One real notice observed under three portal rows with divergent enrichment.
// Aliases are recorded; the notices are NOT merged away.
FIXTURES['duplicate-source-aliases.json'] = merge(base(), {
  sourceSnapshotVersion: 2,
  canonicalOpportunityId: cid('va-duplicate-36C10B26Q0485'),
  sourceRecordId: '688316aed90d4b8fbcef73b0c2e4e8ef',
  sourceAliases: [
    { idType: 'source_record_id', idValue: '634c8faf6b9d4171bcf6873e153258ed', observedAt: '2026-05-20T00:00:00.000Z', note: 'Distinct SAM noticeId for the same solicitation number.' },
    { idType: 'legacy_row_id', idValue: 'opportunities.id=96771', observedAt: '2026-05-20T00:00:00.000Z', note: 'Duplicate row with type=null and fit_score=null - divergent enrichment.' },
    { idType: 'legacy_row_id', idValue: 'opportunities.id=97872', observedAt: '2026-05-21T00:00:00.000Z', note: 'Duplicate row with type="Sources Sought" and fit_score=49.' },
  ],
  solicitationFamily: {
    familyId: fid('36C10B26Q0485'), solicitationNumber: '36C10B26Q0485',
    linkBasis: 'solicitation_number', confidence: 'high',
    memberSourceRecordIds: ['688316aed90d4b8fbcef73b0c2e4e8ef', '634c8faf6b9d4171bcf6873e153258ed'],
  },
  publisher: {
    leadBuyer: { name: 'Department of Veterans Affairs', office: null, requirementOwner: null, jurisdiction: 'US-federal' },
    officialSourceUrl: 'https://sam.gov/opp/688316aed90d4b8fbcef73b0c2e4e8ef/view',
    submissionPortal: null,
  },
  notice: {
    title: 'DA01--VA Enterprise Artificial Intelligence (VA-26-00070193)',
    noticeType: { value: 'sources_sought', raw: 'Sources Sought', isResponseInvited: false, isBindingSolicitation: false, evidenceRef: null },
    procurementType: { value: 'not_yet_determined', basis: 'summary', evidenceRef: null },
    contractVehicle: { value: 'none_yet', programName: null, obligationsSummary: null, evidenceRef: null },
    selectableLots: null,
  },
  deadline: { originalText: '2026-06-09T13:00:00-04:00', wallClock: '2026-06-09T13:00:00', statedTimezone: '-04:00', resolvedZone: 'America/New_York', offsetMinutes: -240, timezoneSource: 'offset', utc: '2026-06-09T17:00:00.000Z', utcConfidence: 'high', uncertaintyReason: null, verifiedAt: '2026-09-28T21:00:00.000Z', conflicts: [] },
  value: { published: null, modelEstimate: null },
  documents: { coverage: 'unknown', accessBarrier: null, counts: { listed: 0, downloaded: 0, parsed: 0, inaccessible: 0 }, items: [], amendments: [] },
  requirements: [],
  timestamps: { sourceObservedAt: '2026-05-21T00:00:00.000Z', fetchedAt: null, enrichedAt: '2026-05-21T00:00:00.000Z', documentReviewedAt: null, lastVerifiedAtSource: '2026-09-28T21:00:00.000Z' },
  sourceAssessment: { serviceCategories: ['ai_implementation'], relevanceBasis: 'summary', assessedBy: 'opportunity-pulse/title-screen', method: 'keyword', evidenceRefs: [], isNotEligibilityDetermination: true, legacyVerdict: null },
  legacy: { fitScore: 49, priorityScore: null, enrichmentVersion: 1, enrichmentHash: null, pursuitStatus: 'none', pursuitStatusChangedAt: null, deprecation: { status: 'advisory_only', guidance: 'Two duplicate rows carried different fitScores (49 and null) for the same notice.', earliestRemovalVersion: null } },
});

// ------------------------------------------------------------ 11. Source outage
FIXTURES['source-outage.json'] = merge(base(), {
  canonicalOpportunityId: cid('source-outage'),
  sourceRecordId: 'sbir:unavailable',
  publisher: {
    postingSource: { name: 'SBIR.gov', portal: 'sbir.gov', url: 'https://www.sbir.gov' },
    leadBuyer: { name: 'Unknown (source unreachable)', office: null, requirementOwner: null, jurisdiction: 'US-federal' },
    officialSourceUrl: null, submissionPortal: null,
  },
  notice: {
    title: null,
    noticeType: { value: 'unknown', raw: null, isResponseInvited: false, isBindingSolicitation: false, evidenceRef: null },
    procurementType: { value: 'unknown', basis: 'not_established', evidenceRef: null },
    contractVehicle: { value: 'unknown', programName: null, obligationsSummary: null, evidenceRef: null },
    selectableLots: null,
  },
  deadline: { originalText: null, wallClock: null, statedTimezone: null, resolvedZone: null, offsetMinutes: null, timezoneSource: 'absent', utc: null, utcConfidence: 'unknown', uncertaintyReason: 'unparseable', verifiedAt: null, conflicts: [] },
  value: { published: null, modelEstimate: null },
  documents: { coverage: 'unknown', accessBarrier: 'source_outage', counts: { listed: 0, downloaded: 0, parsed: 0, inaccessible: 0 }, items: [], amendments: [] },
  requirements: [],
  timestamps: { sourceObservedAt: null, fetchedAt: null, enrichedAt: null, documentReviewedAt: null, lastVerifiedAtSource: null },
  sourceAssessment: { serviceCategories: [], relevanceBasis: 'not_assessed', assessedBy: null, method: null, evidenceRefs: [], isNotEligibilityDetermination: true, legacyVerdict: null },
  sourceAvailability: { status: 'unavailable', since: '2026-08-13T00:00:00.000Z', reason: 'SBIR.gov returned HTTP 403 on every ingestion attempt; zero rows have ever been stored.', servingLastKnownSnapshot: false },
});

// ------------------------------------- 12. Rejected procurement type (evidenced)
FIXTURES['rejected-procurement-type.json'] = merge(base(), {
  canonicalOpportunityId: cid('rejected-copier'),
  sourceRecordId: 'bonfire:agency:example:copier-001',
  publisher: {
    postingSource: { name: 'Example County', portal: 'bonfire', url: 'https://example.bonfirehub.com/opportunities/1' },
    leadBuyer: { name: 'Example County', office: null, requirementOwner: null, jurisdiction: 'US-TX' },
    officialSourceUrl: 'https://example.bonfirehub.com/opportunities/1', submissionPortal: null,
  },
  notice: {
    title: 'LEASE/RENTAL OF COPIER AND DIGITAL EQUIPMENT AND SERVICES',
    noticeType: { value: 'solicitation', raw: 'IFB', isResponseInvited: true, isBindingSolicitation: true, evidenceRef: null },
    // Classified from the document, and the classification is a SOURCE FACT.
    // It is not a bid/no-bid decision: that remains consumer-owned.
    procurementType: { value: 'existing_product_license', basis: 'document', evidenceRef: { docId: 'doc:ifb', section: '2.1 Scope', page: 3, quote: 'The County seeks to lease multifunction copier devices and associated maintenance' } },
    contractVehicle: { value: 'standalone_contract', programName: null, obligationsSummary: null, evidenceRef: null },
    selectableLots: null,
  },
  deadline: { originalText: 'Nov 5th 2026, 10:00 AM CST', wallClock: '2026-11-05T10:00:00', statedTimezone: 'CST', resolvedZone: 'America/Chicago', offsetMinutes: -360, timezoneSource: 'abbreviation', utc: '2026-11-05T16:00:00.000Z', utcConfidence: 'high', uncertaintyReason: null, verifiedAt: null, conflicts: [] },
  value: { published: { amountMinorUnits: 30000000, currency: 'USD', valueType: 'estimated_by_buyer', provenance: 'buyer_stated', evidenceRef: { docId: 'doc:ifb', section: '2.4', page: 4, quote: 'estimated annual expenditure of $300,000' } }, modelEstimate: null },
  documents: {
    coverage: 'complete', accessBarrier: 'none', counts: { listed: 1, downloaded: 1, parsed: 1, inaccessible: 0 },
    items: [{ docId: 'doc:ifb', filename: 'copier-ifb.pdf', url: 'https://example.invalid/ifb.pdf', role: 'solicitation', documentVersion: null, documentDate: '2026-09-15', sha256: SHA('ifb'), byteSize: 120000, mediaType: 'application/pdf', retrieval: { status: 'downloaded', method: 'manual_upload', retrievedAt: '2026-09-25T00:00:00.000Z', failureReason: null }, extraction: { status: 'parsed', method: 'pdf_text', reviewedBy: 'human', reviewedAt: '2026-09-25T00:10:00.000Z' }, supersededByDocId: null }],
    amendments: [],
  },
  requirements: [],
  timestamps: { sourceObservedAt: '2026-09-20T00:00:00.000Z', fetchedAt: '2026-09-25T00:00:00.000Z', enrichedAt: '2026-09-20T00:05:00.000Z', documentReviewedAt: '2026-09-25T00:10:00.000Z', lastVerifiedAtSource: '2026-09-25T00:00:00.000Z' },
  sourceAssessment: {
    serviceCategories: [], relevanceBasis: 'document', assessedBy: 'opportunity-pulse/document-review', method: 'pdf-extract',
    evidenceRefs: [{ docId: 'doc:ifb', section: '2.1 Scope', page: 3, quote: 'lease multifunction copier devices' }],
    isNotEligibilityDetermination: true, legacyVerdict: null,
  },
  legacy: { fitScore: 60, priorityScore: 54, enrichmentVersion: 1, enrichmentHash: null, pursuitStatus: 'none', pursuitStatusChangedAt: null, deprecation: { status: 'advisory_only', guidance: 'This row reached the legacy Top 10 because its title contains "digital".', earliestRemovalVersion: null } },
});

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const names = Object.keys(FIXTURES).sort();
  for (const name of names) {
    fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(FIXTURES[name], null, 2)}\n`, 'utf8');
  }
  console.log(`wrote ${names.length} fixtures to ${OUT}`);
  names.forEach((n) => console.log(`  ${n}`));
}

if (require.main === module) main();
module.exports = { FIXTURES, base, merge };
