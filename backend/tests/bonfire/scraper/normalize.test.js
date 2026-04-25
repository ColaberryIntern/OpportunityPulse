const {
  shortHash,
  agencyLabel,
  fromVendorRecCard,
  fromAgencyOpportunity,
} = require('../../../src/bonfire/scraper/normalize');

describe('scraper/normalize', () => {
  describe('shortHash', () => {
    it('returns a 16-char hex string', () => {
      const h = shortHash('hello');
      expect(h).toMatch(/^[0-9a-f]{16}$/);
    });
    it('is deterministic', () => {
      expect(shortHash('x')).toBe(shortHash('x'));
    });
    it('changes when input changes', () => {
      expect(shortHash('a')).not.toBe(shortHash('b'));
    });
  });

  describe('agencyLabel', () => {
    it('combines name + subdomain when they differ', () => {
      expect(agencyLabel('dhantx', 'DHA')).toBe('DHA (dhantx)');
    });
    it('returns just the name when name and subdomain are equivalent', () => {
      expect(agencyLabel('dhantx', 'dhantx')).toBe('dhantx');
    });
    it('falls back to subdomain when name is empty', () => {
      expect(agencyLabel('dhantx', '')).toBe('dhantx');
    });
    it('returns null when both inputs are empty', () => {
      expect(agencyLabel('', '')).toBeNull();
    });
  });

  describe('fromVendorRecCard', () => {
    it('produces the vendor-rec external_id prefix', () => {
      const row = fromVendorRecCard({
        title: 'AI Platform Modernization',
        agency: 'City of Austin',
        description: 'Build an AI platform.',
      });
      expect(row.external_id).toMatch(/^bonfire:vendor-rec:[0-9a-f]{16}$/);
      expect(row.title).toBe('AI Platform Modernization');
      expect(row.agency).toBe('City of Austin');
    });

    it('returns null when title is empty', () => {
      expect(fromVendorRecCard({ title: '', agency: 'X' })).toBeNull();
    });

    it('uses description as raw_text when present, falls back to title', () => {
      expect(fromVendorRecCard({ title: 'T', agency: 'A', description: 'D' }).raw_text).toBe('D');
      expect(fromVendorRecCard({ title: 'T', agency: 'A', description: '' }).raw_text).toBe('T');
    });

    it('produces stable external_id for the same title+agency', () => {
      const a = fromVendorRecCard({ title: 'T', agency: 'A' });
      const b = fromVendorRecCard({ title: 'T', agency: 'A' });
      expect(a.external_id).toBe(b.external_id);
    });

    it('produces different external_id when title differs', () => {
      const a = fromVendorRecCard({ title: 'T1', agency: 'A' });
      const b = fromVendorRecCard({ title: 'T2', agency: 'A' });
      expect(a.external_id).not.toBe(b.external_id);
    });
  });

  describe('fromAgencyOpportunity', () => {
    it('produces the agency external_id prefix with subdomain and ref', () => {
      const row = fromAgencyOpportunity(
        { refNumber: 'RFP-25-007', projectName: 'Title I Compliance' },
        'dhantx',
        { agencyName: 'DHA' },
      );
      expect(row.external_id).toBe('bonfire:agency:dhantx:RFP-25-007');
      expect(row.title).toBe('Title I Compliance');
      expect(row.agency).toBe('DHA (dhantx)');
    });

    it('returns null when ref or projectName is missing', () => {
      expect(fromAgencyOpportunity({ refNumber: '', projectName: 'T' }, 'sub')).toBeNull();
      expect(fromAgencyOpportunity({ refNumber: 'R', projectName: '' }, 'sub')).toBeNull();
    });

    it('builds an absolute portal URL when given a relative href', () => {
      const row = fromAgencyOpportunity(
        { refNumber: 'R', projectName: 'T', portalUrl: '/portal/bid/1' },
        'dhantx',
      );
      expect(row.source_url).toBe('https://dhantx.bonfirehub.com/portal/bid/1');
    });

    it('keeps absolute portal URLs intact', () => {
      const row = fromAgencyOpportunity(
        { refNumber: 'R', projectName: 'T', portalUrl: 'https://other.example.com/x' },
        'dhantx',
      );
      expect(row.source_url).toBe('https://other.example.com/x');
    });

    it('falls back to a default portal URL when none is given', () => {
      const row = fromAgencyOpportunity(
        { refNumber: 'R', projectName: 'T' },
        'dhantx',
      );
      expect(row.source_url).toContain('dhantx.bonfirehub.com');
    });
  });
});
