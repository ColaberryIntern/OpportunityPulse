const {
  verdictFor, autoFlag, validateTeamingConditional,
} = require('../../src/govContracts/disqualification.service');

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

  // Change A — the broadened out-of-lane screen (gov-bid experiment 2026-06): the #1
  // killer was physical / hardware / field-labor scope still reaching the pipeline.
  test('autoFlag catches data-center / server hardware buildout', () => {
    expect(autoFlag({ title: 'Data Center Hardware Buildout' }).disqualifier).toBe('PHYSICAL_INSTALL');
    expect(autoFlag({ title: 'Server Room Cabling and Equipment' }).disqualifier).toBe('PHYSICAL_INSTALL');
  });
  test('autoFlag catches field maintenance of physical sensors (TxDOT flood sensors)', () => {
    expect(autoFlag({ title: 'Field Maintenance of Flood Warning Sensors' }).disqualifier).toBe('PHYSICAL_INSTALL');
  });
  test('autoFlag catches in-person survey / interviewer field labor (DFW airport)', () => {
    expect(autoFlag({ title: 'In-Person Airport Survey Interviewers' }).disqualifier).toBe('DOMAIN_MISMATCH');
  });
  test('the broadened screen does NOT swallow data/sensor ANALYTICS software', () => {
    expect(autoFlag({ title: 'Data Center Consolidation Analytics Platform' })).toBeNull();
    expect(autoFlag({ title: 'Sensor Data Analytics Dashboard' })).toBeNull();
    expect(autoFlag({ title: 'Field Service Management Software' })).toBeNull();
  });
});

// Change C — professional-license gates (PE / appraiser) are their own code, distinct
// from CERT_WALL (a buyable cert) and DOMAIN_MISMATCH (a domain we don't own).
describe('LICENSE_GATE auto-flag (Change C)', () => {
  test('catches a required Texas Professional Engineer (Frisco SS4A)', () => {
    expect(autoFlag({ title: 'SS4A Action Plan', description: 'Plan must be sealed by a Texas Professional Engineer.' }).disqualifier).toBe('LICENSE_GATE');
  });
  test('catches a Certified General Appraiser (Grand County)', () => {
    expect(autoFlag({ title: 'Real Property Appraisal — Certified General Appraiser required' }).disqualifier).toBe('LICENSE_GATE');
  });
  test('does NOT fire on software/“professional engineering services”', () => {
    expect(autoFlag({ title: 'Professional Engineering Services for a Web Application' })).toBeNull();
  });
});

// Change D — the refined teaming rule. A partner clears eligibility gates, not fit gates.
describe('validateTeamingConditional (Change D)', () => {
  test('a conditional on a DOMAIN_MISMATCH + partner is forced to no_bid (Baltimore-class)', () => {
    const v = validateTeamingConditional({ status: 'conditional', disqualifier: 'DOMAIN_MISMATCH', unblocked_by: 'Que: property management', label: 'maybe via Que' });
    expect(v.status).toBe('no_bid');
    expect(v.unblocked_by).toBeNull();
  });
  test('a conditional on a PRODUCT_REQUIRED + partner is forced to no_bid', () => {
    const v = validateTeamingConditional({ status: 'conditional', disqualifier: 'PRODUCT_REQUIRED', unblocked_by: 'a partner product', label: 'x' });
    expect(v.status).toBe('no_bid');
  });
  test('an EXPERIENCE_GATE conditional (Que clears a real eligibility gate) stays conditional', () => {
    const v = validateTeamingConditional({ status: 'conditional', disqualifier: 'EXPERIENCE_GATE', unblocked_by: 'Que: 5-yr infill-housing experience', label: 'infill' });
    expect(v.status).toBe('conditional');
  });
  test('the SOC 2 watchlist conditional (CERT_WALL) is not touched', () => {
    const v = validateTeamingConditional({ status: 'conditional', disqualifier: 'CERT_WALL', unblocked_by: 'SOC 2 — in progress', label: 'watchlist' });
    expect(v.status).toBe('conditional');
  });
  test('verdictFor keeps the infill-housing Que conditional alive end-to-end', () => {
    const v = verdictFor({ title: 'INFILL HOUSING STRATEGY CONSULTING SERVICES' });
    expect(v.status).toBe('conditional');
    expect(v.unblocked_by).toMatch(/Que/);
  });
});

// Change B — cert-acquisition posture flows through verdictFor (default posture: SOC 2
// is acquiring, every other cert not_pursuing).
describe('verdictFor cert posture (SOC 2 watchlist)', () => {
  test('a SOC-2-only known no-bid surfaces as a conditional WATCHLIST row', () => {
    const v = verdictFor({ title: 'Salt Lake City Agenda Management Platform' });
    expect(v.status).toBe('conditional');
    expect(v.unblocked_by).toMatch(/SOC 2/);
    expect(v.disqualifier).toBe('CERT_WALL'); // still a cert gate for the cert-ROI report
    expect(v.auto).toBe(false);
  });
  test('a wall that also needs a not-pursued cert (SOC 2 + USRA, Harris) stays no_bid', () => {
    const v = verdictFor({ title: 'Agenda and Meeting Management System' });
    expect(v.status).toBe('no_bid');
    expect(v.disqualifier).toBe('CERT_WALL');
  });
  test('a TX-RAMP + SOC 2 wall (TDHCA) stays no_bid', () => {
    const v = verdictFor({ title: 'Multifamily Management System' });
    expect(v.status).toBe('no_bid');
  });
});
