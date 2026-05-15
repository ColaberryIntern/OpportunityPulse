// Deep Research Phase 5 — directional-dependency additions to
// ventureDependency.service tests.

const svc = require('../../src/deepResearch/ventureDependency.service');

describe('ventureDependency.proposeFromOverlap', () => {
  it('picks the more-advanced venture as blocker', () => {
    const ventureMap = new Map([
      [1, { id: 1, title: 'A', lifecycleState: 'discovered' }],
      [2, { id: 2, title: 'B', lifecycleState: 'building' }],
    ]);
    const edge = svc.proposeFromOverlap({
      venture_a_id: 1, venture_b_id: 2, overlap_score: 0.5, shared_components: ['arch:vector', 'stack:postgres'],
    }, ventureMap);
    expect(edge.blockerVentureId).toBe(2);
    expect(edge.blockedVentureId).toBe(1);
    expect(edge.cascadeRisk).toBeGreaterThan(0);
    expect(edge.prerequisite).toMatch(/B ships its shared components/);
  });
  it('returns null when ventures are at the same lifecycle position', () => {
    const ventureMap = new Map([
      [1, { id: 1, title: 'A', lifecycleState: 'evaluating' }],
      [2, { id: 2, title: 'B', lifecycleState: 'evaluating' }],
    ]);
    expect(svc.proposeFromOverlap({
      venture_a_id: 1, venture_b_id: 2, overlap_score: 0.6, shared_components: [],
    }, ventureMap)).toBeNull();
  });
});

describe('ventureDependency.computeCriticalPath', () => {
  it('finds the longest directional chain', () => {
    const edges = [
      { blockerVentureId: 1, blockedVentureId: 2 },
      { blockerVentureId: 2, blockedVentureId: 3 },
      { blockerVentureId: 3, blockedVentureId: 4 },
      { blockerVentureId: 5, blockedVentureId: 6 },
    ];
    const path = svc.computeCriticalPath(edges);
    expect(path).toEqual([1, 2, 3, 4]);
  });
  it('is cycle-safe', () => {
    const edges = [
      { blockerVentureId: 1, blockedVentureId: 2 },
      { blockerVentureId: 2, blockedVentureId: 1 },
    ];
    const path = svc.computeCriticalPath(edges);
    expect(path.length).toBeGreaterThan(0);
  });
});

describe('ventureDependency.identifyBottlenecksOnGraph', () => {
  it('finds top blockers + most-blocked ventures', () => {
    const edges = [
      { blockerVentureId: 1, blockedVentureId: 2 },
      { blockerVentureId: 1, blockedVentureId: 3 },
      { blockerVentureId: 1, blockedVentureId: 4 },
      { blockerVentureId: 5, blockedVentureId: 4 },
      { blockerVentureId: 6, blockedVentureId: 4 },
    ];
    const out = svc.identifyBottlenecksOnGraph(edges);
    expect(out.top_blockers[0].venture_id).toBe(1);
    expect(out.top_blockers[0].blocks).toBe(3);
    expect(out.most_blocked[0].venture_id).toBe(4);
    expect(out.most_blocked[0].blocked_by).toBe(3);
  });
});
