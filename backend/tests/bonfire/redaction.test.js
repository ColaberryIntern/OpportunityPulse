const { redactForRole, redactListForRole, ADMIN_ONLY_FIELDS } = require('../../src/bonfire/bonfire.util');

const sampleRow = {
  id: 'abc-123',
  title: 'Example',
  sourceUrl: 'https://example.com/secret',
  rawText: 'CONFIDENTIAL RFP TEXT',
  aiCategory: 'Staffing',
  priorityScore: 80,
};

describe('Bonfire role-based redaction', () => {
  it('returns full row for admin', () => {
    const out = redactForRole(sampleRow, { role: 'admin' });
    expect(out.sourceUrl).toBe('https://example.com/secret');
    expect(out.rawText).toBe('CONFIDENTIAL RFP TEXT');
  });

  it('nulls admin-only fields for non-admin role', () => {
    const out = redactForRole(sampleRow, { role: 'consultant' });
    expect(out.sourceUrl).toBeNull();
    expect(out.rawText).toBeNull();
    expect(out.title).toBe('Example'); // untouched
    expect(out.aiCategory).toBe('Staffing');
  });

  it('nulls admin-only fields when user is missing', () => {
    const out = redactForRole(sampleRow, null);
    expect(out.sourceUrl).toBeNull();
    expect(out.rawText).toBeNull();
  });

  it('supports Sequelize-like rows via toJSON()', () => {
    const instance = {
      toJSON: () => ({ ...sampleRow }),
    };
    const out = redactForRole(instance, { role: 'consultant' });
    expect(out.sourceUrl).toBeNull();
    expect(out.title).toBe('Example');
  });

  it('leaves input row unmutated', () => {
    const copy = { ...sampleRow };
    redactForRole(sampleRow, { role: 'consultant' });
    expect(sampleRow).toEqual(copy);
  });

  it('redacts list responses', () => {
    const rows = [sampleRow, { ...sampleRow, id: 'def-456' }];
    const out = redactListForRole(rows, { role: 'consultant' });
    expect(out).toHaveLength(2);
    out.forEach((r) => {
      expect(r.sourceUrl).toBeNull();
      expect(r.rawText).toBeNull();
    });
  });

  it('ADMIN_ONLY_FIELDS covers both camelCase and snake_case', () => {
    expect(ADMIN_ONLY_FIELDS).toEqual(expect.arrayContaining(['sourceUrl', 'rawText', 'source_url', 'raw_text']));
  });
});
