// Deep Research Intelligence Engine — emailBriefing.service tests.

jest.mock('../../src/utils/email', () => ({ sendEmail: jest.fn() }));

const { sendEmail } = require('../../src/utils/email');
const svc = require('../../src/deepResearch/emailBriefing.service');

beforeEach(() => {
  sendEmail.mockReset();
  delete process.env.DEEP_RESEARCH_BRIEFING_TO;
});

const reports = [
  {
    id: 10, searchTerm: 'AI agents', origin: 'daily_scan', executiveSummary: 'Agents are hot.',
    marketStage: 'emerging', sourceCount: 12,
    ventureIdeas: [
      { title: 'Memory SDK', description: 'A memory layer', revenuePotential: 'high', marketTiming: 'emerging' },
    ],
  },
];

describe('emailBriefing.buildBriefingHtml', () => {
  it('renders report blocks with venture ideas and a report link', () => {
    const html = svc.buildBriefingHtml(reports);
    expect(html).toMatch(/Deep Research — Executive Briefing/);
    expect(html).toMatch(/AI agents/);
    expect(html).toMatch(/Memory SDK/);
    expect(html).toMatch(/\/admin\/deep-research\/10/);
  });

  it('escapes HTML in report fields', () => {
    const html = svc.buildBriefingHtml([{ id: 1, searchTerm: '<script>x</script>', ventureIdeas: [] }]);
    expect(html).not.toMatch(/<script>x<\/script>/);
    expect(html).toMatch(/&lt;script&gt;/);
  });

  it('renders an empty-state message for no reports', () => {
    const html = svc.buildBriefingHtml([]);
    expect(html).toMatch(/No new research reports today/);
  });
});

describe('emailBriefing.sendDailyBriefing', () => {
  it('does not send when no recipient is configured', async () => {
    const result = await svc.sendDailyBriefing(reports);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('no_recipient');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends when a recipient is configured', async () => {
    sendEmail.mockResolvedValue({ sent: true, messageId: 'abc' });
    const result = await svc.sendDailyBriefing(reports, { to: 'ali@colaberry.com' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('ali@colaberry.com');
    expect(result.sent).toBe(true);
  });

  it('honors the DEEP_RESEARCH_BRIEFING_TO env recipient', async () => {
    process.env.DEEP_RESEARCH_BRIEFING_TO = 'env@colaberry.com';
    sendEmail.mockResolvedValue({ sent: true });
    await svc.sendDailyBriefing(reports);
    expect(sendEmail.mock.calls[0][0].to).toBe('env@colaberry.com');
  });
});
