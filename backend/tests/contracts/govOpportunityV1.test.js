// gov-opportunity.v1 — schema conformance + contract invariants.
//
// Two layers:
//   1. A JSON-Schema-subset validator (type/required/enum/const/pattern/
//      $ref/oneOf/additionalProperties/items/min/max). Hand-rolled on purpose:
//      pulling in ajv would be a new runtime dependency, which CLAUDE.md treats
//      as a governance decision rather than an implementation one.
//   2. The semantic invariants that make this contract worth having. These are
//      the rules a generic validator cannot express — e.g. "utcConfidence
//      'unknown' REQUIRES utc null", "a model estimate may never be published
//      as a value", "not_applicable must be evidenced".
//
// Every fixture is checked against both layers.

const fs = require('fs');
const path = require('path');

const CONTRACT_DIR = path.join(__dirname, '../../../contracts/gov-opportunity.v1');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(CONTRACT_DIR, 'schema.json'), 'utf8'));
const FIXTURE_DIR = path.join(CONTRACT_DIR, 'fixtures');
const fixtureNames = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).sort();
const load = (n) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, n), 'utf8'));

// -------------------------------------------------- validator (real 2020-12)
//
// Ajv's JSON Schema 2020-12 implementation, with ajv-formats for date-time /
// date / uri. This REPLACES the hand-rolled subset validator that previously
// stood in for it: that one silently ignored any keyword it did not implement,
// so "conformance" meant only "conformance to the subset I happened to write".
//
// $schema is PRESERVED — Ajv2020 resolves the 2020-12 meta-schema itself, so the
// declaration in schema.json is honoured rather than stripped.
//
// strict mode is ON. It rejects unknown keywords and several classes of
// malformed schema outright, which means a typo in schema.json fails the build
// instead of quietly disabling a constraint.
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  allowUnionTypes: true, // the contract uses ["string","null"] deliberately
});
addFormats(ajv);

const validateSchema = ajv.compile(SCHEMA);

/** Returns an array of human-readable error strings (empty when valid). */
function validateFixture(doc) {
  const ok = validateSchema(doc);
  if (ok) return [];
  return (validateSchema.errors || []).map(
    (e) => `${e.instancePath || '$'} ${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`,
  );
}

// ------------------------------------------------------------------- tests
describe('gov-opportunity.v1 — fixture coverage', () => {
  it('ships all the cases the contract must demonstrate', () => {
    const required = [
      'solicitation', 'rfi', 'courtesy-posting', 'missing-documents',
      'uncertain-value', 'deadline-conflict', 'amendment', 'missing-verdict',
      'declined', 'duplicate-source-aliases', 'source-outage', 'rejected-procurement-type',
    ];
    for (const token of required) {
      expect(fixtureNames.some((n) => n.includes(token))).toBe(true);
    }
  });

  it('has at least 12 fixtures', () => {
    expect(fixtureNames.length).toBeGreaterThanOrEqual(12);
  });
});

describe('gov-opportunity.v1 — schema conformance', () => {
  it.each(fixtureNames)('%s validates against schema.json', (name) => {
    const errs = validateFixture(load(name));
    if (errs.length) throw new Error(`${name}:\n  ${errs.join('\n  ')}`);
    expect(errs).toEqual([]);
  });
});

describe('gov-opportunity.v1 — validated by a real JSON Schema 2020-12 implementation', () => {
  it("uses Ajv's 2020-12 dialect, not a hand-rolled subset", () => {
    expect(require('ajv/package.json').version.startsWith('8.')).toBe(true);
    // eslint-disable-next-line no-console
    console.log(`    validator: ajv ${require('ajv/package.json').version} (2020-12) + ajv-formats ${require('ajv-formats/package.json').version}`);
  });

  it('preserves the $schema declaration rather than stripping it', () => {
    expect(SCHEMA.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    // the compiled validator was built from the document including $schema
    expect(typeof validateSchema).toBe('function');
  });

  it('compiles under strict mode, so unknown keywords cannot hide', () => {
    // A mistyped keyword is a schema bug. Prove strict mode rejects one.
    const broken = JSON.parse(JSON.stringify(SCHEMA));
    broken.properties.schemaVersion = { tpye: 'string' };
    const strictAjv = new Ajv2020({ strict: true, allowUnionTypes: true });
    addFormats(strictAjv);
    expect(() => strictAjv.compile(broken)).toThrow();
  });

  it('enforces formats for real (date-time / date / uri)', () => {
    const d = load('rfi-va-enterprise-ai.json');
    d.timestamps.fetchedAt = 'last Tuesday';
    expect(validateFixture(d).join(' ')).toMatch(/date-time/);

    const d2 = load('rfi-va-enterprise-ai.json');
    d2.publisher.officialSourceUrl = 'not a url';
    expect(validateFixture(d2).join(' ')).toMatch(/uri/);

    const d3 = load('amendment-extends-deadline.json');
    d3.documents.items[0].documentDate = '2026-13-45';
    expect(validateFixture(d3).join(' ')).toMatch(/date/);
  });

  it('enforces keywords the previous subset validator ignored entirely', () => {
    // format was the known gap; these prove the new validator covers the
    // general case rather than a hand-picked list.
    const d = load('solicitation-verified.json');
    d.value.published.currency = 'usd'; // pattern ^[A-Z]{3}$
    expect(validateFixture(d).length).toBeGreaterThan(0);
  });
});

describe('gov-opportunity.v1 — the validator itself rejects bad documents', () => {
  // A validator that never fails proves nothing.
  const good = () => load('rfi-va-enterprise-ai.json');

  it('rejects a wrong schemaVersion', () => {
    const d = good(); d.schemaVersion = 'gov-opportunity.v2';
    expect(validateFixture(d).length).toBeGreaterThan(0);
  });

  it('rejects a missing required block', () => {
    const d = good(); delete d.deadline;
    const errs = validateFixture(d);
    // Assert the behaviour and the offending field, not the validator's exact
    // phrasing — that would couple the test to the implementation.
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join(' ')).toMatch(/required/);
    expect(errs.join(' ')).toMatch(/deadline/);
  });

  it('rejects an unknown enum value', () => {
    const d = good(); d.notice.noticeType.value = 'invitation_to_tea';
    expect(validateFixture(d).length).toBeGreaterThan(0);
  });

  it('rejects an unexpected property (additionalProperties:false)', () => {
    const d = good(); d.notAField = 1;
    const errs = validateFixture(d);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.join(' ')).toMatch(/additional/i);
    expect(errs.join(' ')).toMatch(/notAField/);
  });

  it('rejects a non-opaque canonical id', () => {
    const d = good(); d.canonicalOpportunityId = 'op:gov:sam:36C10B26Q0834';
    expect(validateFixture(d).length).toBeGreaterThan(0);
  });

  it('rejects a truncated sha256', () => {
    const d = good(); d.documents.items[0].sha256 = '4cf752f9e649c929';
    expect(validateFixture(d).length).toBeGreaterThan(0);
  });

  it('rejects a non-null companyQualification', () => {
    const d = good(); d.companyQualification = { fit: 'good' };
    expect(validateFixture(d).length).toBeGreaterThan(0);
  });

  it('rejects a float amount where minor units are required', () => {
    const d = load('solicitation-verified.json');
    d.value.published.amountMinorUnits = 45000000.5;
    expect(validateFixture(d).length).toBeGreaterThan(0);
  });
});

describe('gov-opportunity.v1 — ownership boundary', () => {
  it.each(fixtureNames)('%s never carries a company qualification', (name) => {
    const d = load(name);
    expect(d.companyQualification).toBeNull();
    expect(d.sourceAssessment.isNotEligibilityDetermination).toBe(true);
  });
});

describe('gov-opportunity.v1 — deadline invariants', () => {
  it.each(fixtureNames)('%s: utcConfidence "unknown" implies utc null', (name) => {
    const { deadline } = load(name);
    if (deadline.utcConfidence === 'unknown') expect(deadline.utc).toBeNull();
  });

  it.each(fixtureNames)('%s: a resolved utc carries an offset and a reason-free state', (name) => {
    const { deadline } = load(name);
    if (deadline.utc !== null) {
      expect(deadline.offsetMinutes).not.toBeNull();
      expect(deadline.uncertaintyReason).toBeNull();
      expect(deadline.utcConfidence).toBe('high');
    }
  });

  it.each(fixtureNames)('%s: originalText is preserved whenever any deadline is known', (name) => {
    const { deadline } = load(name);
    if (deadline.utc !== null) expect(typeof deadline.originalText).toBe('string');
  });

  it('an unresolved conflict refuses to pick a winner', () => {
    const d = load('deadline-conflict-unresolved.json');
    expect(d.deadline.utc).toBeNull();
    expect(d.deadline.uncertaintyReason).toBe('conflicting_sources');
    expect(d.deadline.conflicts.length).toBeGreaterThanOrEqual(2);
  });

  // The VA RFI states "10:00 AM Eastern Standard Time" on a date that is inside
  // US Eastern DST, while the structured field says -04:00. EST is UTC-05:00, so
  // the literal reading is 15:00Z and the structured one is 14:00Z — an hour
  // apart, NOT the same instant. Neither is verified.
  it('the VA RFI deadline is an UNRESOLVED conflict between 14:00Z and 15:00Z', () => {
    const { deadline } = load('rfi-va-enterprise-ai.json');
    expect(deadline.utc).toBeNull();
    expect(deadline.utcConfidence).toBe('unknown');
    expect(deadline.uncertaintyReason).toBe('conflicting_sources');
    const instants = deadline.conflicts.map((c) => c.utc).sort();
    expect(instants).toEqual(['2026-10-07T14:00:00.000Z', '2026-10-07T15:00:00.000Z']);
  });

  it('neither VA source is marked as superseding the other', () => {
    const { deadline } = load('rfi-va-enterprise-ai.json');
    for (const c of deadline.conflicts) expect(c.supersedes).toBeNull();
  });

  it('the literal EST reading and the structured -04:00 reading are both preserved', () => {
    const { deadline } = load('rfi-va-enterprise-ai.json');
    expect(deadline.originalText).toContain('Eastern Standard Time');
    expect(deadline.statedTimezone).toBe('Eastern Standard Time');
    const literal = deadline.conflicts.find((c) => c.utc === '2026-10-07T15:00:00.000Z');
    const structured = deadline.conflicts.find((c) => c.utc === '2026-10-07T14:00:00.000Z');
    expect(literal.source).toMatch(/prose|literal|EST/i);
    expect(structured.source).toMatch(/responseDeadLine|-04:00|EDT/i);
  });

  it('no fixture claims the two VA readings are the same instant', () => {
    const blob = JSON.stringify(load('rfi-va-enterprise-ai.json'));
    expect(blob).not.toMatch(/same instant/i);
  });

  it.each(fixtureNames)('%s: conservativePlanningUtc only appears when utc is null', (name) => {
    const { deadline } = load(name);
    if (deadline.conservativePlanningUtc) {
      expect(deadline.utc).toBeNull();
      // and it must be the EARLIEST candidate, i.e. genuinely conservative
      const candidates = deadline.conflicts.map((c) => c.utc).filter(Boolean).sort();
      expect(deadline.conservativePlanningUtc).toBe(candidates[0]);
    }
  });

  it('the conservative planning value is the earlier VA instant and is labelled as such', () => {
    const d = load('rfi-va-enterprise-ai.json');
    expect(d.deadline.conservativePlanningUtc).toBe('2026-10-07T14:00:00.000Z');
    // it must never be mistaken for the verified deadline
    expect(d.deadline.utc).toBeNull();
    const structured = d.deadline.conflicts.find((c) => c.utc === '2026-10-07T14:00:00.000Z');
    expect(structured.note).toMatch(/not because it is verified|conservative/i);
  });

  it('the NASPO courtesy posting resolves to 20:00Z and keeps the wrong legacy value as a conflict', () => {
    const d = load('courtesy-posting-naspo-sw1045.json');
    expect(d.deadline.utc).toBe('2026-10-15T20:00:00.000Z');
    const legacy = d.deadline.conflicts.find((c) => c.utc === '2026-10-15T14:00:00.000Z');
    expect(legacy).toBeDefined();
    expect(legacy.supersedes).toBe(false);
  });

  it('an amendment supersedes the base deadline without discarding it', () => {
    const d = load('amendment-extends-deadline.json');
    expect(d.deadline.utc).toBe('2026-11-02T21:00:00.000Z');
    expect(d.deadline.conflicts.some((c) => c.supersedes === false)).toBe(true);
    expect(d.documents.amendments[0].affects).toContain('deadline');
  });
});

describe('gov-opportunity.v1 — value invariants', () => {
  it.each(fixtureNames)('%s: a model estimate is never presented as a published value', (name) => {
    const { value } = load(name);
    if (value.modelEstimate) {
      expect(value.modelEstimate.notForRevenuePlanning).toBe(true);
      // The estimate must not have leaked into `published`.
      if (value.published) {
        expect(value.published.provenance).not.toBe('model_estimated');
      }
    }
  });

  it.each(fixtureNames)('%s: published provenance is never a model', (name) => {
    const { value } = load(name);
    if (value.published) {
      expect(['buyer_stated', 'historical_award', 'derived_from_document', 'unknown'])
        .toContain(value.published.provenance);
    }
  });

  it('uncertain value: published null, estimate present, never merged', () => {
    const d = load('uncertain-value.json');
    expect(d.value.published).toBeNull();
    expect(d.value.modelEstimate.amountMinorUnits).toBe(100000000);
    expect(d.value.modelEstimate.notForRevenuePlanning).toBe(true);
  });

  it('a ceiling is labelled as a ceiling, not as expected revenue', () => {
    const d = load('solicitation-verified.json');
    expect(d.value.published.valueType).toBe('ceiling');
    expect(d.value.published.currency).toBe('USD');
    expect(Number.isInteger(d.value.published.amountMinorUnits)).toBe(true);
  });
});

describe('gov-opportunity.v1 — requirement invariants', () => {
  it.each(fixtureNames)('%s: not_applicable is always evidenced', (name) => {
    for (const r of load(name).requirements) {
      if (r.applicability === 'not_applicable') {
        expect(r.applicabilityEvidenceRef).not.toBeNull();
      }
    }
  });

  it.each(fixtureNames)('%s: every requirement carries an evidence locator', (name) => {
    for (const r of load(name).requirements) {
      expect(r.evidenceRef).toBeTruthy();
      expect(typeof r.evidenceRef.docId).toBe('string');
    }
  });

  it.each(fixtureNames)('%s: evidence locators point at a document in this envelope', (name) => {
    const d = load(name);
    const ids = new Set(d.documents.items.map((i) => i.docId));
    for (const r of d.requirements) {
      expect(ids.has(r.evidenceRef.docId)).toBe(true);
    }
  });

  it('an empty requirements array does not imply "no requirements"', () => {
    const d = load('courtesy-posting-naspo-sw1045.json');
    expect(d.requirements).toEqual([]);
    // coverage says why the array is empty
    expect(['partial', 'inaccessible', 'none_published', 'unknown']).toContain(d.documents.coverage);
  });

  it('the RFI separates all four binding statuses', () => {
    const d = load('rfi-va-enterprise-ai.json');
    const statuses = new Set(d.requirements.map((r) => r.bindingStatus));
    expect(statuses.has('mandatory_response_instruction')).toBe(true);
    expect(statuses.has('draft_future_obligation')).toBe(true);
    expect(statuses.has('rfi_question')).toBe(true);
    // ...and nothing in an RFI is a binding solicitation requirement.
    expect(statuses.has('binding_solicitation_requirement')).toBe(false);
  });
});

describe('gov-opportunity.v1 — notice axis separation', () => {
  it('an RFI is response-invited but never binding, even with a detailed draft PWS', () => {
    const d = load('rfi-va-enterprise-ai.json');
    expect(d.notice.noticeType.value).toBe('sources_sought');
    expect(d.notice.noticeType.isResponseInvited).toBe(true);
    expect(d.notice.noticeType.isBindingSolicitation).toBe(false);
    expect(d.notice.procurementType.value).toBe('not_yet_determined');
    expect(d.documents.items.some((i) => i.role === 'draft_pws')).toBe(true);
  });

  it('an RFI may still describe mixed future work', () => {
    const d = load('rfi-va-enterprise-ai.json');
    const kinds = d.notice.procurementType.components.map((c) => c.value);
    expect(kinds).toEqual(expect.arrayContaining(['custom_development', 'managed_services']));
  });

  it('a master agreement is a VEHICLE, not a notice type', () => {
    const d = load('courtesy-posting-naspo-sw1045.json');
    expect(d.notice.contractVehicle.value).toBe('cooperative_master_agreement');
    expect(d.notice.noticeType.value).toBe('courtesy_posting');
  });

  it.each(fixtureNames)('%s: an award/justification never invites a response', (name) => {
    const { noticeType } = load(name).notice;
    if (['award_notice', 'justification'].includes(noticeType.value)) {
      expect(noticeType.isResponseInvited).toBe(false);
    }
  });

  it.each(fixtureNames)('%s: a title-only basis is never claimed as document-grade', (name) => {
    const d = load(name);
    if (d.notice.procurementType.basis === 'title') {
      expect(d.notice.procurementType.evidenceRef).toBeNull();
    }
  });
});

describe('gov-opportunity.v1 — publisher separation', () => {
  it('the NASPO courtesy posting keeps poster, lead buyer and submission portal distinct', () => {
    const d = load('courtesy-posting-naspo-sw1045.json');
    expect(d.publisher.isCourtesyPosting).toBe(true);
    expect(d.publisher.postingSource.name).toMatch(/Utah/);
    expect(d.publisher.leadBuyer.name).toMatch(/Oklahoma/);
    expect(d.publisher.officialSourceUrl).toMatch(/naspovaluepoint\.org/);
    expect(d.publisher.submissionPortal.url).toMatch(/financials\.ok\.gov/);
    // All three are different hosts — the whole reason these are separate fields.
    const hosts = new Set([
      new URL(d.publisher.postingSource.url).host,
      new URL(d.publisher.officialSourceUrl).host,
      new URL(d.publisher.submissionPortal.url).host,
    ]);
    expect(hosts.size).toBe(3);
  });
});

describe('gov-opportunity.v1 — identity and duplicates', () => {
  it.each(fixtureNames)('%s: canonical id is opaque and carries no source semantics', (name) => {
    const d = load(name);
    expect(d.canonicalOpportunityId).toMatch(/^op:gov:[0-9a-f]{32}$/);
    // must not embed the solicitation number or a title
    const soln = d.solicitationFamily && d.solicitationFamily.solicitationNumber;
    if (soln) expect(d.canonicalOpportunityId).not.toContain(soln);
  });

  it('duplicates are recorded as aliases, not merged away', () => {
    const d = load('duplicate-source-aliases.json');
    expect(d.sourceAliases.length).toBeGreaterThanOrEqual(3);
    expect(d.solicitationFamily.memberSourceRecordIds.length).toBeGreaterThanOrEqual(2);
    // divergent enrichment across duplicates is captured in the alias notes
    expect(d.sourceAliases.some((a) => /divergent enrichment/i.test(a.note || ''))).toBe(true);
  });

  it('a title-derived external id survives only as an alias, never as the key', () => {
    const d = load('courtesy-posting-naspo-sw1045.json');
    const alias = d.sourceAliases.find((a) => a.idType === 'external_id');
    expect(alias.idValue).toContain('NASPO Courtesy Posting');
    expect(d.canonicalOpportunityId).not.toContain('NASPO');
  });

  it('linking a solicitation family is not deduplication', () => {
    const d = load('duplicate-source-aliases.json');
    expect(d.solicitationFamily.linkBasis).toBe('solicitation_number');
    expect(d.solicitationFamily.confidence).toBe('high');
    expect(d.sourceRecordId).toBeTruthy(); // the notice keeps its own identity
  });
});

describe('gov-opportunity.v1 — documents and coverage', () => {
  it.each(fixtureNames)('%s: counts are internally consistent', (name) => {
    const { documents } = load(name);
    const { counts, items } = documents;
    expect(counts.downloaded).toBeLessThanOrEqual(Math.max(counts.listed, items.length));
    expect(counts.parsed).toBeLessThanOrEqual(Math.max(counts.downloaded, items.length));
    const parsedItems = items.filter((i) => i.extraction && i.extraction.status === 'parsed').length;
    expect(parsedItems).toBeLessThanOrEqual(Math.max(counts.parsed, items.length));
  });

  it.each(fixtureNames)('%s: hashes are full-length or absent', (name) => {
    for (const i of load(name).documents.items) {
      if (i.sha256 !== null) expect(i.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('"inaccessible" and "none_published" are not interchangeable', () => {
    const blocked = load('missing-documents-bonfire-403.json');
    expect(blocked.documents.coverage).toBe('inaccessible');
    expect(blocked.documents.accessBarrier).toBe('bot_protection');
    expect(blocked.documents.items).toEqual([]);
    // and the record is honest that classification is title-only
    expect(blocked.notice.procurementType.basis).toBe('title');
  });

  it('a not-attempted document is still listed with its retrieval route', () => {
    const d = load('courtesy-posting-naspo-sw1045.json');
    const pkg = d.documents.items.find((i) => i.retrieval.status === 'not_attempted');
    expect(pkg).toBeDefined();
    expect(pkg.retrieval.failureReason).toMatch(/interactive session|403/i);
    expect(pkg.extraction).toBeNull();
  });
});

describe('gov-opportunity.v1 — timestamps and versions are independent', () => {
  it.each(fixtureNames)('%s: the four clocks are distinct fields', (name) => {
    const t = load(name).timestamps;
    for (const k of ['sourceObservedAt', 'fetchedAt', 'enrichedAt', 'documentReviewedAt', 'lastVerifiedAtSource']) {
      expect(Object.prototype.hasOwnProperty.call(t, k)).toBe(true);
    }
  });

  it('schemaVersion and sourceSnapshotVersion are independent of enrichmentVersion', () => {
    const d = load('rfi-va-enterprise-ai.json');
    expect(d.schemaVersion).toBe('gov-opportunity.v1');
    expect(d.sourceSnapshotVersion).toBe(3);
    expect(d.legacy.enrichmentVersion).toBe(1);
    expect(d.sourceSnapshotVersion).not.toBe(d.legacy.enrichmentVersion);
  });

  it('document review can be newer than enrichment', () => {
    const t = load('rfi-va-enterprise-ai.json').timestamps;
    expect(new Date(t.documentReviewedAt).getTime()).toBeGreaterThan(new Date(t.enrichedAt).getTime());
  });
});

describe('gov-opportunity.v1 — legacy preservation', () => {
  it('legacy scores are passed through, NOT nulled', () => {
    const withScores = fixtureNames
      .map(load)
      .filter((d) => d.legacy && d.legacy.fitScore !== null);
    expect(withScores.length).toBeGreaterThan(0);
    for (const d of withScores) {
      expect(typeof d.legacy.fitScore).toBe('number');
      expect(d.legacy.deprecation.status).not.toBe('deprecated');
    }
  });

  it('a legacy verdict keeps its method and its missing evidence visible', () => {
    const d = load('declined-with-legacy-verdict.json');
    const v = d.sourceAssessment.legacyVerdict;
    expect(v.status).toBe('no_bid');
    expect(v.method).toBe('title_regex');
    expect(v.evidence).toBeNull(); // asserted without evidence — and it shows
    expect(v.scope).toBe('this_notice'); // not a universal bid/no-bid
  });

  it('a declined pursuitStatus is OP-local, not a consumer decision', () => {
    const d = load('declined-with-legacy-verdict.json');
    expect(d.legacy.pursuitStatus).toBe('declined');
    expect(d.companyQualification).toBeNull();
    expect(d.legacy.deprecation.guidance).toMatch(/not an authoritative decision/i);
  });

  it('a null legacyVerdict means NOT VETTED, and the fixture says so', () => {
    const d = load('missing-verdict.json');
    expect(d.sourceAssessment.legacyVerdict).toBeNull();
    expect(d.legacy.deprecation.guidance).toMatch(/not vetted/i);
  });
});

describe('gov-opportunity.v1 — source outage', () => {
  it('an unavailable source is flagged rather than served as current', () => {
    const d = load('source-outage.json');
    expect(d.sourceAvailability.status).toBe('unavailable');
    expect(d.sourceAvailability.servingLastKnownSnapshot).toBe(false);
    expect(d.timestamps.lastVerifiedAtSource).toBeNull();
    expect(d.documents.accessBarrier).toBe('source_outage');
  });
});

describe('gov-opportunity.v1 — rejection is a source fact, not a bid decision', () => {
  it('a rejected procurement type is evidenced and still carries no qualification', () => {
    const d = load('rejected-procurement-type.json');
    expect(d.notice.procurementType.value).toBe('existing_product_license');
    expect(d.notice.procurementType.basis).toBe('document');
    expect(d.notice.procurementType.evidenceRef.quote).toMatch(/copier/i);
    expect(d.companyQualification).toBeNull();
    expect(d.sourceAssessment.isNotEligibilityDetermination).toBe(true);
  });
});
