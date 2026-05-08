// v0.5 — submissionPackage README + manifest builder tests (pure functions).

jest.mock('archiver', () => () => ({
  pipe: jest.fn(),
  append: jest.fn(),
  file: jest.fn(),
  finalize: jest.fn(async () => undefined),
  on: jest.fn(),
}));

jest.mock('../../src/models', () => ({
  sequelize: {},
  Document: {},
  OpportunityAttachment: {},
  BonfireOpportunity: {},
  Opportunity: {},
  OpportunityOutput: {},
}));
jest.mock('../../src/oied/profile.service', () => ({
  resolveOrgId: jest.fn(async () => 1),
}));
jest.mock('../../src/bonfire/bonfireReadiness.service', () => ({
  computeReadiness: jest.fn(),
}));
jest.mock('../../src/bonfire/attachmentFetcher.service', () => ({
  attachmentAbsolutePath: jest.fn(),
}));
jest.mock('../../src/documents/storage.adapter', () => ({
  absolutePathFor: jest.fn(),
}));
jest.mock('../../src/documents/documentRenderer.service', () => ({
  renderMarkdownToPdf: jest.fn(),
}));

const svc = require('../../src/bonfire/submissionPackage.service');

const sampleOpp = {
  id: 'opp-uuid', title: 'DHA Roof RFP', agency: 'DHA',
  sourceUrl: 'https://dhantx.bonfirehub.com/opp/123',
  closeDate: new Date('2026-06-01T00:00:00Z'),
};
const sampleVault = [
  { id: 'd1', type: 'capability_statement', name: 'CapStmt 2026', version: 3, scope: 'global', source: 'manual', mime: 'application/pdf', sizeBytes: 4567, expiresAt: null, lineageId: null },
  { id: 'd2', type: 'cover_letter_template', name: 'Cover Letter — DHA Roof', version: 1, scope: 'bid', source: 'ai_generated', mime: 'text/markdown', sizeBytes: 1500, expiresAt: null, lineageId: 'lin-1' },
];
const sampleAttachments = [
  { id: 'a1', name: 'SOW.pdf', mime: 'application/pdf', sizeBytes: 234567, urlOriginal: 'https://x/SOW.pdf', downloadedAt: new Date() },
];
const sampleReadiness = {
  completion_pct: 67,
  counts: { total: 6, satisfied: 4, expiring: 0, expired: 0, gaps: 2 },
  checklist: [
    { type: 'capability_statement', type_label: 'Capability Statement', status: 'satisfied', source: 'baseline', reason: null },
    { type: 'coi', type_label: 'Certificate of Insurance (COI)', status: 'gap', source: 'baseline', reason: null },
    { type: 'cert_bid_bond', type_label: 'Bid Bond', status: 'gap', source: 'ai', reason: 'Bid bond required at 5%' },
  ],
};

describe('submissionPackage.buildReadme', () => {
  it('includes opp title + agency + readiness line + content sections', () => {
    const out = svc.buildReadme({
      opp: sampleOpp,
      vault: sampleVault,
      attachments: sampleAttachments,
      readinessOut: sampleReadiness,
      generatedAt: new Date('2026-05-08T20:00:00Z'),
    });
    expect(out).toMatch(/# Submission Package — DHA Roof RFP/);
    expect(out).toMatch(/\*\*Agency\*\*: DHA/);
    expect(out).toMatch(/Readiness: 67% complete · 4\/6 required docs · 2 gaps/);
    expect(out).toMatch(/### \/vault/);
    expect(out).toMatch(/### \/attachments/);
    expect(out).toMatch(/Capability Statement/);
    expect(out).toMatch(/Cover Letter Template — Cover Letter — DHA Roof \(v1, AI-generated\)/);
    expect(out).toMatch(/SOW\.pdf/);
  });

  it('marks AI-flagged checklist items', () => {
    const out = svc.buildReadme({
      opp: sampleOpp,
      vault: [],
      attachments: [],
      readinessOut: sampleReadiness,
      generatedAt: new Date(),
    });
    expect(out).toMatch(/\[x\] Capability Statement/);
    expect(out).toMatch(/\[ \] Certificate of Insurance \(COI\)/);
    expect(out).toMatch(/\[ \] Bid Bond \(AI-flagged\) — Bid bond required at 5%/);
  });
});

describe('submissionPackage.buildManifest', () => {
  it('returns a structured manifest with schema_version + readiness summary', () => {
    const out = svc.buildManifest({
      opp: sampleOpp,
      vault: sampleVault,
      attachments: sampleAttachments,
      readinessOut: sampleReadiness,
      generatedAt: new Date('2026-05-08T20:00:00Z'),
    });
    expect(out.schema_version).toBe(1);
    expect(out.opportunity.id).toBe('opp-uuid');
    expect(out.opportunity.agency).toBe('DHA');
    expect(out.readiness.completion_pct).toBe(67);
    expect(out.readiness.checklist).toHaveLength(3);
    expect(out.vault).toHaveLength(2);
    expect(out.vault[0]).toHaveProperty('lineage_id');
    expect(out.attachments).toHaveLength(1);
    expect(out.attachments[0].url_original).toBe('https://x/SOW.pdf');
  });
});

describe('submissionPackage.safeName', () => {
  it('strips disallowed characters', () => {
    expect(svc.safeName('Hello / world: <test>')).toBe('Hello _ world_ _test_');
  });
  it('caps length at 200 chars', () => {
    const long = 'x'.repeat(300);
    expect(svc.safeName(long)).toHaveLength(200);
  });
  it('handles null/undefined safely', () => {
    expect(svc.safeName(null)).toBe('untitled');
    expect(svc.safeName(undefined)).toBe('untitled');
  });
});
