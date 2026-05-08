// v0.4 — pure-function tests for the Bonfire opp detail-page parser.
// Cheerio against fixture HTML; no browser needed.

const detail = require('../../src/bonfire/scraper/pages/opportunityDetail');

describe('opportunityDetail.parseHtml', () => {
  it('extracts /file/ download links with names', () => {
    const html = `
      <html><body>
        <div class="documents-tab">
          <table>
            <tr>
              <td><a href="/portal/opportunities/123/file/abc">RFP Document.pdf</a></td>
              <td>2.3 MB</td>
            </tr>
            <tr>
              <td><a href="/portal/opportunities/123/file/xyz">Q&A Round 1.pdf</a></td>
              <td>456 KB</td>
            </tr>
          </table>
        </div>
      </body></html>`;
    const out = detail.parseHtml(html, { baseUrl: 'https://dhantx.bonfirehub.com/portal/opp/123' });
    expect(out).toHaveLength(2);
    expect(out[0].url).toMatch(/\/file\/abc$/);
    expect(out[0].name).toBe('RFP Document.pdf');
    expect(out[0].size_hint).toBe('2.3 MB');
    expect(out[1].url).toMatch(/\/file\/xyz$/);
    expect(out[1].name).toBe('Q&A Round 1.pdf');
  });

  it('dedupes the same URL across multiple selectors', () => {
    const html = `
      <a href="/document/123.pdf">Doc.pdf</a>
      <a href="/document/123.pdf">Doc.pdf duplicate</a>`;
    const out = detail.parseHtml(html, { baseUrl: 'https://dhantx.bonfirehub.com/' });
    expect(out).toHaveLength(1);
  });

  it('falls back to URL filename when link text is generic', () => {
    const html = `<a href="/file/abc/SOW-2026.pdf">Download</a>`;
    const out = detail.parseHtml(html, { baseUrl: 'https://dhantx.bonfirehub.com/' });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('SOW-2026.pdf');
  });

  it('returns empty for HTML without download links', () => {
    const html = `<html><body><h1>No documents tab here</h1></body></html>`;
    expect(detail.parseHtml(html)).toEqual([]);
  });

  it('handles an empty / nullish input safely', () => {
    expect(detail.parseHtml('')).toEqual([]);
    expect(detail.parseHtml(null)).toEqual([]);
  });

  it('captures direct PDF/DOCX/XLSX anchors', () => {
    const html = `
      <a href="https://s3.amazonaws.com/bonfire/RFP-Tech-Specs.pdf">Tech Specs</a>
      <a href="/portal/Pricing-Schedule.xlsx">Pricing</a>
      <a href="/portal/Terms.docx">Terms</a>
    `;
    const out = detail.parseHtml(html, { baseUrl: 'https://dhantx.bonfirehub.com/' });
    const urls = out.map((x) => x.url);
    expect(urls.some((u) => u.includes('Tech-Specs.pdf'))).toBe(true);
    expect(urls.some((u) => u.includes('Pricing-Schedule.xlsx'))).toBe(true);
    expect(urls.some((u) => u.includes('Terms.docx'))).toBe(true);
  });
});
