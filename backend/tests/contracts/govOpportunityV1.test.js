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

// ---------------------------------------------------------------- validator
function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref: ${ref}`);
  return ref.slice(2).split('/').reduce((acc, k) => acc[k], root);
}

function typeOk(value, t) {
  switch (t) {
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: throw new Error(`unknown type ${t}`);
  }
}

function validate(value, schema, root, pathStr, errors) {
  if (schema.$ref) return validate(value, resolveRef(schema.$ref, root), root, pathStr, errors);

  if (schema.oneOf) {
    const matches = schema.oneOf.filter((s) => {
      const sub = [];
      validate(value, s, root, pathStr, sub);
      return sub.length === 0;
    });
    if (matches.length !== 1) errors.push(`${pathStr}: matched ${matches.length} oneOf branches, expected exactly 1`);
    return errors;
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    if (value !== schema.const) errors.push(`${pathStr}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
    return errors;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(value, t))) {
      errors.push(`${pathStr}: expected type ${types.join('|')}, got ${value === null ? 'null' : typeof value}`);
      return errors; // no point checking further
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${pathStr}: ${JSON.stringify(value)} not in enum`);
  }
  if (schema.pattern && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${pathStr}: ${JSON.stringify(value)} fails pattern ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${pathStr}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${pathStr}: ${value} > maximum ${schema.maximum}`);
  }

  if (typeOk(value, 'object')) {
    for (const req of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, req)) errors.push(`${pathStr}: missing required "${req}"`);
    }
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(props, k)) errors.push(`${pathStr}: unexpected property "${k}"`);
      }
    }
    for (const [k, sub] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(value, k)) validate(value[k], sub, root, `${pathStr}.${k}`, errors);
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => validate(item, schema.items, root, `${pathStr}[${i}]`, errors));
  }

  return errors;
}

const validateFixture = (doc) => validate(doc, SCHEMA, SCHEMA, '$', []);

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

describe('gov-opportunity.v1 — the validator itself rejects bad documents', () => {
  // A validator that never fails proves nothing.
  const good = () => load('rfi-va-enterprise-ai.json');

  it('rejects a wrong schemaVersion', () => {
    const d = good(); d.schemaVersion = 'gov-opportunity.v2';
    expect(validateFixture(d).length).toBeGreaterThan(0);
  });

  it('rejects a missing required block', () => {
    const d = good(); delete d.deadline;
    expect(validateFixture(d)).toContain('$: missing required "deadline"');
  });

  it('rejects an unknown enum value', () => {
    const d = good(); d.notice.noticeType.value = 'invitation_to_tea';
    expect(validateFixture(d).length).toBeGreaterThan(0);
  });

  it('rejects an unexpected property (additionalProperties:false)', () => {
    const d = good(); d.notAField = 1;
    expect(validateFixture(d)).toContain('$: unexpected property "notAField"');
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
