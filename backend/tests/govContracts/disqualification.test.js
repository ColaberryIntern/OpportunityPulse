const { verdictFor, autoFlag } = require('../../src/govContracts/disqualification.service');

describe('disqualification verdictFor', () => {
  test('known no-bid wins (building automation)', () => {
    const v = verdictFor({ title: '26-024 (BS) Jefferson High School Building Automation System (BAS)' });
    expect(v.status).toBe('no_bid');
    expect(v.disqualifier).toBe('DOMAIN_MISMATCH');
    expect(v.auto).toBe(false);
  });
  test('known cert-wall (UTD housing software)', () => {
    const v = verdictFor({ title: 'Community Development Software for Housing' });
    expect(v.disqualifier).toBe('CERT_WALL');
  });
  test('known conditional (infill housing -> Que)', () => {
    const v = verdictFor({ title: 'INFILL HOUSING STRATEGY CONSULTING SERVICES' });
    expect(v.status).toBe('conditional');
    expect(v.unblocked_by).toMatch(/Que/);
  });
  test('falls back to auto-flag on cert keywords', () => {
    const v = verdictFor({ title: 'Some New Hosted Platform', agency: 'Texas Department of Housing and Community Affairs' });
    expect(v.auto).toBe(true);
    expect(v.disqualifier).toBe('CERT_WALL');
    expect(v.status).toBe('needs_review');
  });
  test('clean candidate returns null (no verdict yet)', () => {
    expect(verdictFor({ title: 'AI Readiness Assessment Advisory Services', agency: 'City of Plano' })).toBeNull();
  });
  test('autoFlag catches physical-install language', () => {
    expect(autoFlag({ title: 'Curbside Digital Signage Install', description: 'bid bond required' }).disqualifier).toBe('PHYSICAL_INSTALL');
  });
  test('autoFlag catches construction / trades', () => {
    expect(autoFlag({ title: 'Gerrish Pump Station Improvements' }).disqualifier).toBe('PHYSICAL_INSTALL');
    expect(autoFlag({ title: 'Job Order Contracting - General Contractor Services' }).disqualifier).toBe('PHYSICAL_INSTALL');
    expect(autoFlag({ title: 'Plumbing Services' }).disqualifier).toBe('PHYSICAL_INSTALL');
  });
  test('autoFlag catches non-IT goods/services', () => {
    expect(autoFlag({ title: 'Armed Security Guard Services - TxDOT' }).disqualifier).toBe('DOMAIN_MISMATCH');
    expect(autoFlag({ title: 'New Light Rail Vehicles' }).disqualifier).toBe('DOMAIN_MISMATCH');
    expect(autoFlag({ title: 'Solid Waste and Recycling Services' }).disqualifier).toBe('DOMAIN_MISMATCH');
  });
  test('does NOT flag a real IT/AI services row', () => {
    expect(autoFlag({ title: 'AI Readiness Assessment and Data Analytics Advisory' })).toBeNull();
    expect(autoFlag({ title: 'Custom Software Development Services' })).toBeNull();
  });
});
