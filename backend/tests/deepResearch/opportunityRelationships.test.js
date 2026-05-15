// Deep Research Phase 7 — opportunityRelationships.service pure-logic tests.

const svc = require('../../src/deepResearch/opportunityRelationships.service');

describe('opportunityRelationships.extractAgency', () => {
  it('prefers agency_name in sourceData', () => {
    expect(svc.extractAgency({ sourceData: { agency_name: 'DOD' } })).toBe('DOD');
  });
  it('falls back to other fields', () => {
    expect(svc.extractAgency({ sourceData: { department: 'HHS' } })).toBe('HHS');
    expect(svc.extractAgency({ sourceData: { client: 'NIH' } })).toBe('NIH');
  });
  it('returns null when no agency-ish field is present', () => {
    expect(svc.extractAgency({ sourceData: {} })).toBeNull();
  });
});

describe('opportunityRelationships.extractTechnologies', () => {
  it('finds known tech terms in title + description', () => {
    const opp = {
      title: 'RAG-based summarization for federal agencies',
      description: 'Looking for a vendor with experience in machine learning and aws cloud.',
    };
    const hits = svc.extractTechnologies(opp);
    expect(hits).toEqual(expect.arrayContaining(['rag', 'machine learning', 'aws', 'cloud']));
  });
  it('returns empty when nothing matches', () => {
    expect(svc.extractTechnologies({ title: 'lunchtime sandwich procurement', description: '' })).toEqual([]);
  });
});

describe('opportunityRelationships.extractNaicsList', () => {
  it('returns codes from sourceData', () => {
    expect(svc.extractNaicsList({ sourceData: { naics_codes: ['541512', '518210'] } }))
      .toEqual(expect.arrayContaining(['541512', '518210']));
  });
  it('finds 6-digit codes in text when not in sourceData', () => {
    expect(svc.extractNaicsList({ title: 'Procurement under NAICS 541611', description: '', sourceData: {} }))
      .toContain('541611');
  });
  it('drops malformed codes', () => {
    expect(svc.extractNaicsList({ title: 'NAICS 12345', description: 'NAICS 1234567', sourceData: {} }))
      .toEqual([]);
  });
});

describe('opportunityRelationships.buildRelationships', () => {
  it('drops singletons below minOccurrence', () => {
    const opps = [
      { id: 1, sourceData: { agency_name: 'DOD' }, title: 'one' },
      { id: 2, sourceData: { agency_name: 'HHS' }, title: 'two' },
    ];
    const rel = svc.buildRelationships(opps, { minOccurrence: 2 });
    expect(rel).toEqual([]);
  });
  it('aggregates recurring agencies + counts opps', () => {
    const opps = [
      { id: 1, sourceData: { agency_name: 'DOD' }, title: 'one' },
      { id: 2, sourceData: { agency_name: 'DOD' }, title: 'two' },
      { id: 3, sourceData: { agency_name: 'DOD' }, title: 'three' },
    ];
    const rel = svc.buildRelationships(opps, { minOccurrence: 2 });
    expect(rel).toHaveLength(1);
    expect(rel[0]).toMatchObject({
      relationshipType: 'agency',
      value: 'DOD',
      occurrenceCount: 3,
    });
  });
  it('sorts by occurrenceCount descending', () => {
    const opps = [
      { id: 1, title: 'machine learning ai aws', description: '' },
      { id: 2, title: 'machine learning aws', description: '' },
      { id: 3, title: 'ai aws', description: '' },
      { id: 4, title: 'aws', description: '' },
    ];
    const rel = svc.buildRelationships(opps, { minOccurrence: 2 });
    expect(rel[0].value).toBe('aws');
  });
});
