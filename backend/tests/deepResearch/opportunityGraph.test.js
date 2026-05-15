// Deep Research Phase 7 — opportunityGraph.service pure-logic tests.

const svc = require('../../src/deepResearch/opportunityGraph.service');

describe('opportunityGraph.buildEntityEdges', () => {
  it('returns empty array for empty input', () => {
    expect(svc.buildEntityEdges([])).toEqual([]);
  });
  it('emits one edge per opportunity per relationship row', () => {
    const rows = [
      {
        relationshipType: 'agency', value: 'DOD',
        opportunityIds: [1, 2, 3], occurrenceCount: 3,
      },
      {
        relationship_type: 'technology', value: 'rag',
        opportunity_ids: [2, 3], occurrence_count: 2,
      },
    ];
    const edges = svc.buildEntityEdges(rows);
    expect(edges).toHaveLength(5);
    expect(edges[0]).toMatchObject({ fromKind: 'agency', toKind: 'opportunity', edgeType: 'mentions' });
    expect(edges.find((e) => e.fromValue === 'rag').weight).toBe(2);
  });
  it('caps per entity', () => {
    const rows = [{
      relationshipType: 'agency', value: 'DOD',
      opportunityIds: Array.from({ length: 20 }, (_, i) => i + 1),
      occurrenceCount: 20,
    }];
    const edges = svc.buildEntityEdges(rows, { capPerEntity: 5 });
    expect(edges).toHaveLength(5);
  });
});
