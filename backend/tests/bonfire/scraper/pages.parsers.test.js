// Parser unit tests via cheerio against fixture HTML modeled on the live
// Bonfire markup we captured (see backend/.bonfire-session/capture/*.html).

const vendorDashboard = require('../../../src/bonfire/scraper/pages/vendorDashboard');
const networkList = require('../../../src/bonfire/scraper/pages/networkList');
const agencyOpportunities = require('../../../src/bonfire/scraper/pages/agencyOpportunities');

describe('pages/vendorDashboard.parseHtml', () => {
  it('extracts counts from data-testid count tiles', () => {
    const html = `
      <html><body>
        <div data-testid="dashboard-overview-invitations-count">271</div>
        <div data-testid="dashboard-overview-submitted-count">9</div>
        <div data-testid="dashboard-overview-awarded-count">0</div>
        <div data-testid="dashboard-overview-wip-count">3</div>
        <div data-testid="dashboard-overview-contracts-count">2</div>
      </body></html>`;
    const result = vendorDashboard.parseHtml(html);
    expect(result.counts.invitations).toBe(271);
    expect(result.counts.submitted).toBe(9);
    expect(result.counts.awarded).toBe(0);
    expect(result.counts.workInProgress).toBe(3);
    expect(result.counts.contracts).toBe(2);
  });

  it('returns empty counts object when no tiles match', () => {
    const result = vendorDashboard.parseHtml('<html><body>nothing</body></html>');
    expect(result.counts).toEqual({});
  });

  it('finds the AI-recommended page link when present', () => {
    const html = `
      <html><body>
        <a href="/opportunities/recommended" data-testid="ai-recommendations-button">View</a>
      </body></html>`;
    const result = vendorDashboard.parseHtml(html);
    expect(result.aiRecommendedHref).toBe('/opportunities/recommended');
  });

  it('falls back to inline AI cards when Bonfire ships them inline', () => {
    const html = `
      <html><body>
        <div data-testid="ai-recommended-card">
          <h3 data-testid="card-title">AI Platform Modernization</h3>
          <div data-testid="card-agency">City of Austin</div>
          <p data-testid="card-description">desc</p>
          <a href="/opportunities/123">View</a>
        </div>
      </body></html>`;
    const result = vendorDashboard.parseHtml(html);
    expect(result.aiRecommended).toHaveLength(1);
    expect(result.aiRecommended[0].title).toBe('AI Platform Modernization');
  });
});

describe('pages/networkList.parseHtml (DOM fallback)', () => {
  it('extracts subdomains from agency-link hrefs', () => {
    const html = `
      <html><body>
        <a href="https://dhantx.bonfirehub.com/login?email=x">Go to agency</a>
        <a href="https://austintx.bonfirehub.com/portal">Go to agency</a>
      </body></html>`;
    const agencies = networkList.parseHtml(html);
    const subs = agencies.map((a) => a.subdomain);
    expect(subs).toContain('dhantx');
    expect(subs).toContain('austintx');
  });

  it('filters out marketing subdomains', () => {
    const html = `
      <html><body>
        <a href="https://vendor.bonfirehub.com/x">Vendor</a>
        <a href="https://account.bonfirehub.com/y">Account</a>
        <a href="https://realagency.bonfirehub.com/portal">Real</a>
      </body></html>`;
    const subs = networkList.parseHtml(html).map((a) => a.subdomain);
    expect(subs).not.toContain('vendor');
    expect(subs).not.toContain('account');
    expect(subs).toContain('realagency');
  });

  it('deduplicates the same subdomain', () => {
    const html = `
      <html><body>
        <a href="https://dhantx.bonfirehub.com/x">A</a>
        <a href="https://dhantx.bonfirehub.com/y">B</a>
      </body></html>`;
    const agencies = networkList.parseHtml(html);
    expect(agencies.filter((a) => a.subdomain === 'dhantx')).toHaveLength(1);
  });
});

describe('pages/networkList API mappers', () => {
  it('extractSubdomain parses the leftmost subdomain', () => {
    expect(networkList.extractSubdomain('https://dhantx.bonfirehub.com/foo')).toBe('dhantx');
    expect(networkList.extractSubdomain('https://example.com/x')).toBeNull();
    expect(networkList.extractSubdomain(null)).toBeNull();
  });

  it('recordFromApi maps various API field shapes', () => {
    expect(networkList.recordFromApi({ subdomain: 'dhantx', name: 'DHA' })).toEqual({
      subdomain: 'dhantx', name: 'DHA', status: null, registeredAt: null,
    });
    expect(networkList.recordFromApi({ shortName: 'AUSTINTX', agencyName: 'Austin' })).toMatchObject({
      subdomain: 'austintx', name: 'Austin',
    });
    expect(networkList.recordFromApi({ url: 'https://x.bonfirehub.com/portal' })).toMatchObject({
      subdomain: 'x',
    });
    expect(networkList.recordFromApi({})).toBeNull();
  });

  it('findAgenciesArray finds the agencies array deep in a payload', () => {
    const payload = { data: { network: { agencies: [{ subdomain: 'a' }, { subdomain: 'b' }] } } };
    const arr = networkList.findAgenciesArray(payload);
    expect(arr).toHaveLength(2);
  });
});

describe('pages/agencyOpportunities.parseHtml (DataTables structure)', () => {
  // Mirrors the live DHA portal layout: columns are
  // [Status, Ref. #, Project, Close Date, Days Left, Action].
  const liveLikeHtml = `
    <html><body>
      <table class="dataTable">
        <thead><tr>
          <th>Status</th><th>Ref. #</th><th>Project</th>
          <th>Close Date</th><th>Days Left</th><th>Action</th>
        </tr></thead>
        <tbody>
          <tr>
            <td>Open</td>
            <td>20266-11</td>
            <td>Legal Services</td>
            <td>Apr 27th 2026, 2:00 PM CDT</td>
            <td>2</td>
            <td><a href="/portal/bid/123">View Opportunity</a></td>
          </tr>
          <tr>
            <td>Open</td>
            <td>20266-15</td>
            <td>HVAC Maintenance</td>
            <td>May 14th 2026, 5:00 PM CDT</td>
            <td>19</td>
            <td><a href="/portal/bid/124">View Opportunity</a></td>
          </tr>
        </tbody>
      </table>
    </body></html>`;

  it('extracts all opportunity rows via DataTables structure', () => {
    const records = agencyOpportunities.parseHtml(liveLikeHtml);
    expect(records).toHaveLength(2);
    expect(records[0].refNumber).toBe('20266-11');
    expect(records[0].projectName).toBe('Legal Services');
    expect(records[0].status).toBe('Open');
    expect(records[0].daysLeft).toBe(2);
    expect(records[0].portalUrl).toBe('/portal/bid/123');
  });

  it('parses Bonfire date strings (Apr 27th 2026, 2:00 PM CDT)', () => {
    const records = agencyOpportunities.parseHtml(liveLikeHtml);
    expect(records[0].closeDate).toMatch(/^2026-04-27/);
  });

  it('deduplicates identical refNumbers across multiple DataTables', () => {
    // Bonfire ships several DataTables on the page (one per tab); they may
    // contain overlapping rows.
    const html = `
      <html><body>
        <table class="dataTable">
          <thead><tr><th>Status</th><th>Ref. #</th><th>Project</th><th>Close Date</th><th>Days Left</th><th>Action</th></tr></thead>
          <tbody><tr><td>Open</td><td>R1</td><td>P1</td><td></td><td>1</td><td></td></tr></tbody>
        </table>
        <table class="dataTable">
          <thead><tr><th>Status</th><th>Ref. #</th><th>Project</th><th>Close Date</th><th>Days Left</th><th>Action</th></tr></thead>
          <tbody><tr><td>Open</td><td>R1</td><td>P1</td><td></td><td>1</td><td></td></tr></tbody>
        </table>
      </body></html>`;
    expect(agencyOpportunities.parseHtml(html)).toHaveLength(1);
  });

  it('skips DataTables whose headers do NOT match (Ref + Project)', () => {
    const html = `
      <html><body>
        <table class="dataTable">
          <thead><tr><th>Foo</th><th>Bar</th></tr></thead>
          <tbody><tr><td>x</td><td>y</td></tr></tbody>
        </table>
      </body></html>`;
    expect(agencyOpportunities.parseHtml(html)).toEqual([]);
  });

  it('returns empty when no DataTables present', () => {
    expect(agencyOpportunities.parseHtml('<html><body></body></html>')).toEqual([]);
  });
});
