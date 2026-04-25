const { isChallengeHtml } = require('../../../src/bonfire/scraper/cloudflare');

describe('scraper/cloudflare.isChallengeHtml', () => {
  it('detects the canonical Cloudflare title', () => {
    expect(isChallengeHtml('<html></html>', 'Just a moment...')).toBe(true);
  });

  it('detects "Attention Required" titles', () => {
    expect(isChallengeHtml('<html></html>', 'Attention Required! | Cloudflare')).toBe(true);
  });

  it('detects challenge body markers regardless of case', () => {
    const html = '<html><body><div id="cf-challenge-running">...</div></body></html>';
    expect(isChallengeHtml(html, 'Some Title')).toBe(true);
  });

  it('detects the cdn-cgi/challenge-platform marker', () => {
    const html = '<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/jsd/v1/x"></script>';
    expect(isChallengeHtml(html, '')).toBe(true);
  });

  it('detects "Performing security verification" copy', () => {
    expect(isChallengeHtml('<p>Performing security verification...</p>', '')).toBe(true);
  });

  it('returns false for a normal Bonfire dashboard page', () => {
    const html = `
      <html><head><title>Bonfire | Vendor Hub</title></head>
      <body><div class="dashboard">270 invitations</div></body></html>`;
    expect(isChallengeHtml(html, 'Bonfire | Vendor Hub')).toBe(false);
  });

  it('returns false for empty input', () => {
    expect(isChallengeHtml('', '')).toBe(false);
    expect(isChallengeHtml(null, null)).toBe(false);
  });
});
