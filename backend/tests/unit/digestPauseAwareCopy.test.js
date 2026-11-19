// The digest must not tell the reader to wait for a cron that is disarmed.
//
// Regression context: INGESTION_SCHEDULER_ENABLED was set to false on
// 2026-10-01 as a pre-migration write freeze and never lifted. The digest's
// empty-state copy was a hardcoded string — "sources refresh on cron",
// "yet — sources refresh on cron" — with no awareness of pause state, so six
// consecutive daily briefs reported zero new items AND reassured the reader
// that the sources would refresh on their own. The freeze was intentional;
// the silence about it was not. A zero-ingest day under a pause and a
// zero-ingest day under a broken adapter rendered identically.

const { buildSummaryParagraph } = require('../../src/emailDigest/richDigest.service');
const { richDigestEmailTemplate } = require('../../src/utils/emailTemplates');

const EMPTY_DAY = { todayCounts: { byType: {}, total: 0 } };

function render(data) {
  return richDigestEmailTemplate({ name: 'Ali', data, frontendUrl: 'https://example.test' }).html;
}

describe('digest empty-state copy is pause-aware', () => {
  describe('buildSummaryParagraph', () => {
    it('says ingestion is PAUSED when it is, and does not promise a cron refresh', () => {
      const text = buildSummaryParagraph({ ...EMPTY_DAY, ingestionPaused: true });
      expect(text).toContain('PAUSED');
      expect(text).not.toContain('sources refresh on cron');
    });

    it('keeps the original cron wording when ingestion is running', () => {
      const text = buildSummaryParagraph({ ...EMPTY_DAY, ingestionPaused: false });
      expect(text).toContain('sources refresh on cron');
      expect(text).not.toContain('PAUSED');
    });

    it('defaults to the cron wording when the flag is absent, so old callers are unchanged', () => {
      expect(buildSummaryParagraph(EMPTY_DAY)).toContain('sources refresh on cron');
    });

    it('never mentions the pause on a day that actually ingested, even while paused', () => {
      // A pause can be lifted mid-day: rows exist, the flag is still false at
      // render time. Counts are the stronger signal, so they win.
      const text = buildSummaryParagraph({
        todayCounts: { byType: { ai_job: 4 }, total: 4 },
        ingestionPaused: true,
      });
      expect(text).toContain('4 new items');
      expect(text).not.toContain('PAUSED');
    });
  });

  describe('richDigestEmailTemplate', () => {
    it('renders the paused notice in both empty states', () => {
      const html = render({ ...EMPTY_DAY, ingestionPaused: true, summaryText: '' });
      expect(html).toContain('PAUSED');
      expect(html).not.toContain('sources refresh on cron');
    });

    it('renders the cron wording when not paused', () => {
      const html = render({ ...EMPTY_DAY, ingestionPaused: false, summaryText: '' });
      expect(html).toContain('sources refresh on cron');
    });

    it('defaults to not-paused when the field is absent', () => {
      const html = render({ ...EMPTY_DAY, summaryText: '' });
      expect(html).toContain('sources refresh on cron');
      expect(html).not.toContain('PAUSED');
    });

    it('escapes summaryText rather than interpolating it raw', () => {
      const html = render({ ...EMPTY_DAY, summaryText: '<img src=x onerror=alert(1)>' });
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img');
    });
  });
});
