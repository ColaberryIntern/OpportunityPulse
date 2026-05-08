// v0.6 Phase 6 — loadVaultExcerpts pure-ish tests. Mocks Document model
// + storage adapter + extractor libs to keep this fast.

jest.mock('../../src/models', () => ({
  sequelize: {},
  Document: { findAll: jest.fn() },
}));
jest.mock('../../src/documents/storage.adapter', () => ({
  absolutePathFor: jest.fn(() => '/tmp/fake-doc'),
  writeBuffer: jest.fn(),
  readStream: jest.fn(),
  removeFile: jest.fn(),
}));
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(() => 'Plain markdown content from a vault doc with at least one **bold** word.'),
  };
});

const { Document } = require('../../src/models');
const docSvc = require('../../src/documents/document.service');

function makeDoc(overrides = {}) {
  return Object.assign({
    id: 'doc-' + Math.random().toString(36).slice(2, 7),
    type: 'capability_statement',
    name: 'CapStmt 2026',
    filePath: 'org/capability_statement/foo.md',
    mime: 'text/markdown',
    version: 1,
    metadata: {},
    scope: 'global',
    save: jest.fn(async function () { return this; }),
    changed: jest.fn(),
  }, overrides);
}

beforeEach(() => {
  Document.findAll.mockReset();
});

describe('loadVaultExcerpts', () => {
  it('returns [] when no types are passed', async () => {
    const out = await docSvc.loadVaultExcerpts({ organizationId: 1, types: [] });
    expect(out).toEqual([]);
    expect(Document.findAll).not.toHaveBeenCalled();
  });

  it('dedupes by type — first row (bid scope) wins', async () => {
    // Document.findAll is supposed to return rows ordered with bid first.
    Document.findAll.mockResolvedValue([
      makeDoc({ type: 'capability_statement', name: 'Bid-local CapStmt', scope: 'bid' }),
      makeDoc({ type: 'capability_statement', name: 'Global CapStmt', scope: 'global' }),
    ]);
    const out = await docSvc.loadVaultExcerpts({
      organizationId: 1, types: ['capability_statement'],
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Bid-local CapStmt');
    expect(out[0].scope).toBe('bid');
  });

  it('uses cached extracted_text when available', async () => {
    const fs = require('fs');
    fs.readFileSync.mockClear();
    Document.findAll.mockResolvedValue([
      makeDoc({
        type: 'capability_statement',
        metadata: { extracted_text: 'Cached extraction text', extracted_at: '2026-05-01T00:00:00Z' },
      }),
    ]);
    const out = await docSvc.loadVaultExcerpts({
      organizationId: 1, types: ['capability_statement'],
    });
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('Cached extraction text');
    // Cache hit means no fs read.
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('skips docs whose file is missing on disk', async () => {
    const fs = require('fs');
    fs.existsSync.mockReturnValueOnce(false);
    Document.findAll.mockResolvedValue([
      makeDoc({ type: 'capability_statement', metadata: {} }),
    ]);
    const out = await docSvc.loadVaultExcerpts({
      organizationId: 1, types: ['capability_statement'],
    });
    expect(out).toEqual([]);
    fs.existsSync.mockReset();
    fs.existsSync.mockReturnValue(true);
  });

  it('respects capTotal — stops adding once budget is exhausted', async () => {
    Document.findAll.mockResolvedValue([
      makeDoc({ type: 'capability_statement', name: 'A' }),
      makeDoc({ type: 'past_performance', name: 'B' }),
      makeDoc({ type: 'references', name: 'C' }),
    ]);
    const out = await docSvc.loadVaultExcerpts({
      organizationId: 1, types: ['capability_statement', 'past_performance', 'references'],
      capPerDoc: 100, capTotal: 150,
    });
    // First doc takes 100. Remaining = 50 — but we require >200 to keep going,
    // so we stop after the first.
    expect(out.length).toBeLessThanOrEqual(2);
    const total = out.reduce((acc, x) => acc + x.text.length, 0);
    expect(total).toBeLessThanOrEqual(150);
  });
});
