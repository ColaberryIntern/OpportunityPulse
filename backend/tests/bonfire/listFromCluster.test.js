// bonfire.service.listOpportunities — fromCluster drilldown tests.
//
// The cluster-drilldown feature lets the Strategic Opportunities drawer link
// "View matching Bonfire bids →" through to /bonfire?fromCluster=<recId>.
// Backend must:
//   1. Resolve (aiCategory, value-bracket) from the cluster's source opps.
//   2. Build a WHERE = (id IN sourceIds) OR (aiCategory=X AND est_val in bracket).
//   3. Apply the existing active-only filter on top (closed bids drop unless
//      pursuing/submitted).
//   4. Tag each result row with _origin: 'source' | 'matched'.
//   5. Surface clusterContext metadata to the caller.

const { Op } = require('sequelize');

jest.mock('../../src/models', () => ({
  sequelize: { literal: (s) => ({ __literal: s }) },
  BonfireOpportunity: {
    findAndCountAll: jest.fn(async () => ({ rows: [], count: 0 })),
    findOne: jest.fn(),
  },
  BonfireOpportunityTag: {},
  BonfireStrategicOpportunity: {
    findByPk: jest.fn(),
  },
}));

const { BonfireOpportunity, BonfireStrategicOpportunity } = require('../../src/models');
const svc = require('../../src/bonfire/bonfire.service');

beforeEach(() => {
  BonfireOpportunity.findAndCountAll.mockClear();
  BonfireOpportunity.findOne.mockReset();
  BonfireStrategicOpportunity.findByPk.mockReset();
});

function lastFindCall() {
  return BonfireOpportunity.findAndCountAll.mock.calls.at(-1)?.[0] || {};
}

describe('valueBracketBoundsFromCents', () => {
  test('classifies the four brackets correctly', () => {
    const { valueBracketBoundsFromCents } = svc;
    expect(valueBracketBoundsFromCents(null)).toEqual({ bracket: 'unknown', lo: null, hi: null });
    expect(valueBracketBoundsFromCents(10_000_000)).toEqual({ bracket: 'sub-250k', lo: 0,             hi: 25_000_000 });
    expect(valueBracketBoundsFromCents(50_000_000)).toEqual({ bracket: '250k-1m',  lo: 25_000_000,    hi: 100_000_000 });
    expect(valueBracketBoundsFromCents(200_000_000)).toEqual({ bracket: '1m-5m',    lo: 100_000_000,  hi: 500_000_000 });
    expect(valueBracketBoundsFromCents(800_000_000)).toEqual({ bracket: '5m+',     lo: 500_000_000,  hi: null });
  });

  test('mirrors strategist clustering thresholds (sub-250k → 250k-1m at exactly $250k)', () => {
    const { valueBracketBoundsFromCents } = svc;
    expect(valueBracketBoundsFromCents(24_999_999).bracket).toBe('sub-250k');
    expect(valueBracketBoundsFromCents(25_000_000).bracket).toBe('250k-1m');
  });
});

describe('resolveClusterMatchKey', () => {
  test('returns null when the strategic rec does not exist', async () => {
    BonfireStrategicOpportunity.findByPk.mockResolvedValueOnce(null);
    const out = await svc.resolveClusterMatchKey('missing-id');
    expect(out).toBeNull();
  });

  test('returns null inputs when sourceOpportunityIds is missing/empty', async () => {
    BonfireStrategicOpportunity.findByPk.mockResolvedValueOnce({
      id: 'r1', title: 'T', sourceOpportunityIds: [],
    });
    const out = await svc.resolveClusterMatchKey('r1');
    expect(out.sourceIds).toEqual([]);
    expect(out.aiCategory).toBeNull();
  });

  test('falls back to bracket=unknown when no source opp survives', async () => {
    BonfireStrategicOpportunity.findByPk.mockResolvedValueOnce({
      id: 'r1', sourceOpportunityIds: ['gone-1', 'gone-2'],
    });
    BonfireOpportunity.findOne.mockResolvedValueOnce(null);
    const out = await svc.resolveClusterMatchKey('r1');
    expect(out.bracket).toBe('unknown');
    expect(out.aiCategory).toBeNull();
  });

  test('derives aiCategory + bracket from a surviving source opp', async () => {
    BonfireStrategicOpportunity.findByPk.mockResolvedValueOnce({
      id: 'r1', sourceOpportunityIds: ['op-1', 'op-2'],
    });
    BonfireOpportunity.findOne.mockResolvedValueOnce({
      id: 'op-1', aiCategory: 'AI Staffing', estimatedValue: 60_000_000, // $600k → 250k-1m bracket
    });
    const out = await svc.resolveClusterMatchKey('r1');
    expect(out.aiCategory).toBe('AI Staffing');
    expect(out.bracket).toBe('250k-1m');
    expect(out.lo).toBe(25_000_000);
    expect(out.hi).toBe(100_000_000);
  });
});

describe('listOpportunities — fromCluster', () => {
  // Standard happy-path mocks: strategic rec exists, one source opp survives,
  // findAndCountAll returns a mix of source + matched rows.
  function primeHappyPath({ sourceIds, aiCategory = 'AI Staffing', estimatedValue = 60_000_000, rows } = {}) {
    BonfireStrategicOpportunity.findByPk.mockResolvedValueOnce({
      id: 'rec-1', title: 'AI Staffing Cluster', patternType: 'cluster',
      sourceOpportunityIds: sourceIds,
    });
    BonfireOpportunity.findOne.mockResolvedValueOnce({
      id: sourceIds[0], aiCategory, estimatedValue,
    });
    BonfireOpportunity.findAndCountAll.mockResolvedValueOnce({
      rows: (rows || []).map((r) => ({ ...r, dataValues: { ...r } })),
      count: (rows || []).length,
    });
  }

  test('unknown strategic rec id returns empty result + error-marked clusterContext', async () => {
    BonfireStrategicOpportunity.findByPk.mockResolvedValueOnce(null);
    const out = await svc.listOpportunities({ fromCluster: 'nope' });
    expect(out.rows).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.clusterContext.error).toBe('not_found');
    expect(BonfireOpportunity.findAndCountAll).not.toHaveBeenCalled();
  });

  test('builds WHERE = (id IN sourceIds) OR (aiCategory=X AND estimatedValue in bracket)', async () => {
    primeHappyPath({ sourceIds: ['s1', 's2', 's3'], rows: [] });
    await svc.listOpportunities({ fromCluster: 'rec-1' });
    const call = lastFindCall();
    const andClauses = call.where[Op.and];
    // The fromCluster OR ends up as one of the AND branches.
    const orBranch = andClauses.find((c) => c[Op.or] && c[Op.or].some((b) => b.id));
    expect(orBranch).toBeDefined();
    const branches = orBranch[Op.or];
    expect(branches.find((b) => b.id && b.id[Op.in])).toEqual({ id: { [Op.in]: ['s1', 's2', 's3'] } });
    const matched = branches.find((b) => b[Op.and]);
    expect(matched[Op.and][0]).toEqual({ aiCategory: 'AI Staffing' });
    expect(matched[Op.and][1].estimatedValue[Op.gte]).toBe(25_000_000);
    expect(matched[Op.and][1].estimatedValue[Op.lt]).toBe(100_000_000);
  });

  test('respects the active-only filter (closed bids hidden unless pursuing/submitted)', async () => {
    primeHappyPath({ sourceIds: ['s1'], rows: [] });
    await svc.listOpportunities({ fromCluster: 'rec-1' });
    const call = lastFindCall();
    const andClauses = call.where[Op.and];
    // The expiry-or-pursued clause is the v0.11 OR block; check it survives.
    const expiryOr = andClauses.find((c) => c[Op.or] && c[Op.or].some((b) => b.closeDate === null));
    expect(expiryOr).toBeDefined();
    const pursuingBranch = expiryOr[Op.or].find((b) => b.pursuitStatus);
    expect(pursuingBranch.pursuitStatus[Op.in]).toEqual(['pursuing', 'submitted']);
  });

  test('includeExpired=true skips active filter but keeps the cluster OR', async () => {
    primeHappyPath({ sourceIds: ['s1'], rows: [] });
    await svc.listOpportunities({ fromCluster: 'rec-1', includeExpired: 'true' });
    const call = lastFindCall();
    const andClauses = call.where[Op.and];
    // Only the fromCluster OR branch should remain; no active-only block.
    const branches = andClauses.flatMap((c) => (c[Op.or] || []));
    const hasNullClose = branches.some((b) => b.closeDate === null);
    expect(hasNullClose).toBe(false);
  });

  test('tags each row with _origin (source vs matched)', async () => {
    primeHappyPath({
      sourceIds: ['s1', 's2'],
      rows: [
        { id: 's1', title: 'Was a source' },
        { id: 'new-3', title: 'Newly ingested matching bid' },
        { id: 's2', title: 'Also a source' },
      ],
    });
    const out = await svc.listOpportunities({ fromCluster: 'rec-1' });
    expect(out.rows.find((r) => r.id === 's1').dataValues._origin).toBe('source');
    expect(out.rows.find((r) => r.id === 's2').dataValues._origin).toBe('source');
    expect(out.rows.find((r) => r.id === 'new-3').dataValues._origin).toBe('matched');
  });

  test('returns clusterContext with title + counts', async () => {
    primeHappyPath({
      sourceIds: ['s1', 's2', 's3', 's4'],
      rows: [
        { id: 's1', title: 'A' }, // source
        { id: 'm1', title: 'B' }, // matched (new bid)
        { id: 'm2', title: 'C' }, // matched
      ],
    });
    const out = await svc.listOpportunities({ fromCluster: 'rec-1' });
    expect(out.clusterContext.title).toBe('AI Staffing Cluster');
    expect(out.clusterContext.patternType).toBe('cluster');
    expect(out.clusterContext.originalSourceCount).toBe(4);
    expect(out.clusterContext.sourceShownInPage).toBe(1);
    expect(out.clusterContext.matchedShownInPage).toBe(2);
    expect(out.clusterContext.aiCategory).toBe('AI Staffing');
    expect(out.clusterContext.valueBracket).toBe('250k-1m');
  });

  test('default order flips to cluster_default when fromCluster is set (pursuing first)', async () => {
    primeHappyPath({ sourceIds: ['s1'], rows: [] });
    await svc.listOpportunities({ fromCluster: 'rec-1' });
    const call = lastFindCall();
    // First sort tuple references the projected _pursuitOrder virtual column.
    expect(call.order[0][0].__literal).toContain('_pursuitOrder');
    expect(call.order[0][1]).toBe('ASC');
    // The virtual column is projected into the inner SELECT so it survives
    // Sequelize's subquery wrapping.
    expect(call.attributes).toBeDefined();
    expect(call.attributes.include[0][0].__literal).toContain('pursuit_status');
    expect(call.attributes.include[0][1]).toBe('_pursuitOrder');
  });

  test('explicit order=close_asc overrides the cluster default', async () => {
    primeHappyPath({ sourceIds: ['s1'], rows: [] });
    await svc.listOpportunities({ fromCluster: 'rec-1', order: 'close_asc' });
    const call = lastFindCall();
    expect(call.order[0]).toEqual(['closeDate', 'ASC']);
  });

  test('without fromCluster, no clusterContext is returned (back-compat)', async () => {
    BonfireOpportunity.findAndCountAll.mockResolvedValueOnce({ rows: [], count: 0 });
    const out = await svc.listOpportunities({});
    expect(out.clusterContext).toBeUndefined();
  });
});
