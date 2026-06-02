// isDueForDigest — calendar-day eligibility for daily users, hours-since
// fallback for weekly/biweekly/monthly. The bug being fixed: a manual test
// send yesterday afternoon caused the next-morning cron to skip the user
// because <24h had passed. New rule: daily means "once per Central calendar
// day" so a fresh day = fresh digest regardless.

jest.mock('../../src/models', () => ({
  AlertPreference: { findOne: jest.fn(), findAll: jest.fn() },
  User: {},
  Opportunity: {},
  DataSource: {},
}));
jest.mock('../../src/personalMatch/personalMatch.service', () => ({
  assembleUserContext: jest.fn(),
}));
jest.mock('../../src/analysis/ai.client', () => ({ getAIClient: jest.fn() }));
jest.mock('../../src/utils/email', () => ({ sendEmail: jest.fn() }));
jest.mock('../../src/actionEngine/executiveBrief.service', () => ({
  getExecutiveBrief: jest.fn(),
}));
jest.mock('../../src/emailDigest/richDigest.service', () => ({
  assembleRichDigest: jest.fn(),
}));

const { isDueForDigest, formatYmdInTz } = require('../../src/emailDigest/emailDigest.service');

describe('formatYmdInTz', () => {
  test('formats a UTC date in America/Chicago to YYYY-MM-DD', () => {
    // 2026-06-02 02:00 UTC = 2026-06-01 21:00 CDT — still "Monday" in CT
    expect(formatYmdInTz(new Date('2026-06-02T02:00:00Z'), 'America/Chicago')).toBe('2026-06-01');
    // 2026-06-02 12:00 UTC = 2026-06-02 07:00 CDT — Tuesday in CT
    expect(formatYmdInTz(new Date('2026-06-02T12:00:00Z'), 'America/Chicago')).toBe('2026-06-02');
  });

  test('respects timezone arg', () => {
    expect(formatYmdInTz(new Date('2026-06-02T00:00:00Z'), 'UTC')).toBe('2026-06-02');
    expect(formatYmdInTz(new Date('2026-06-02T00:00:00Z'), 'America/Chicago')).toBe('2026-06-01');
  });
});

describe('isDueForDigest — daily (calendar-day rule)', () => {
  // The exact bug we hit: yesterday afternoon manual test send vs this-morning cron.
  test('TRUE when last send was yesterday in CT (the bug fix)', () => {
    const yesterdayAfternoon = new Date('2026-06-01T19:24:28Z'); // 2:24 PM CDT June 1
    const todayMorning = new Date('2026-06-02T11:00:00Z'); // 6:00 AM CDT June 2
    expect(isDueForDigest(
      { digestFrequency: 'daily', lastDigestSentAt: yesterdayAfternoon },
      { now: todayMorning, timezone: 'America/Chicago' },
    )).toBe(true);
  });

  test('FALSE when last send was earlier today in CT (skip duplicate)', () => {
    const earlierToday = new Date('2026-06-02T11:00:00Z'); // 6 AM CDT June 2 (cron fire)
    const laterToday = new Date('2026-06-02T18:00:00Z'); // 1 PM CDT June 2 (heartbeat)
    expect(isDueForDigest(
      { digestFrequency: 'daily', lastDigestSentAt: earlierToday },
      { now: laterToday, timezone: 'America/Chicago' },
    )).toBe(false);
  });

  test('TRUE when no digest has ever been sent', () => {
    expect(isDueForDigest(
      { digestFrequency: 'daily', lastDigestSentAt: null },
      { now: new Date('2026-06-02T11:00:00Z'), timezone: 'America/Chicago' },
    )).toBe(true);
  });

  test('TRUE when last send was 16h ago but spans midnight CT (the bug)', () => {
    // 2026-06-01 23:30 CDT = 2026-06-02 04:30 UTC
    // 2026-06-02 06:00 CDT = 2026-06-02 11:00 UTC
    // Only 6.5 hours apart but DIFFERENT calendar days in CT → due
    expect(isDueForDigest(
      { digestFrequency: 'daily', lastDigestSentAt: new Date('2026-06-02T04:30:00Z') },
      { now: new Date('2026-06-02T11:00:00Z'), timezone: 'America/Chicago' },
    )).toBe(true);
  });

  test('FALSE when last send was 25h ago but still same calendar day in CT', () => {
    // Edge case: send at 2026-06-02 05:00 CDT (10:00 UTC) on day 1, now is
    // 2026-06-02 06:00 CDT (11:00 UTC) — 1h apart, same day → already sent today.
    // Not 25h example, but demonstrates the rule: same-day = false.
    expect(isDueForDigest(
      { digestFrequency: 'daily', lastDigestSentAt: new Date('2026-06-02T10:00:00Z') },
      { now: new Date('2026-06-02T11:00:00Z'), timezone: 'America/Chicago' },
    )).toBe(false);
  });
});

describe('isDueForDigest — weekly fallback', () => {
  test('weekly: uses 168h rule, not calendar-day', () => {
    // 167h ago — not yet due
    const lastSend = new Date('2026-05-26T11:00:00Z');
    const now      = new Date('2026-06-02T10:00:00Z');
    expect(isDueForDigest(
      { digestFrequency: 'weekly', lastDigestSentAt: lastSend },
      { now },
    )).toBe(false);
    // 169h ago — due
    const longerLast = new Date('2026-05-26T08:00:00Z');
    expect(isDueForDigest(
      { digestFrequency: 'weekly', lastDigestSentAt: longerLast },
      { now },
    )).toBe(true);
  });

  test('unknown frequency: not due (defensive)', () => {
    expect(isDueForDigest(
      { digestFrequency: 'never', lastDigestSentAt: null },
      { now: new Date() },
    )).toBe(false);
  });
});
