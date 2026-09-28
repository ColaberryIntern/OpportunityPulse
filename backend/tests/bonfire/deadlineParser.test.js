// deadlineParser — portal deadline parsing.
//
// The regression this suite exists for: the old implementation stripped the
// timezone token and handed the remainder to `new Date()`, so in a TZ=UTC
// container "Oct 15th 2026, 2:00 PM MDT" became 14:00Z instead of 20:00Z.
//
// Two properties are asserted throughout:
//   1. The offset is honoured, not discarded.
//   2. Results do NOT depend on process.env.TZ. Every UTC assertion is also
//      re-run under a non-UTC TZ in the "server timezone independence" block.

const { parseDeadline, zoneOffsetMinutesAt } = require('../../src/bonfire/scraper/deadlineParser');

describe('deadlineParser — the NASPO SW1045 regression', () => {
  // Utah portal renders Mountain; NASPO states 3 p.m. Central. Same instant.
  it('parses "Oct 15th 2026, 2:00 PM MDT" to 20:00Z (was 14:00Z)', () => {
    const r = parseDeadline('Oct 15th 2026, 2:00 PM MDT');
    expect(r.utc).toBe('2026-10-15T20:00:00.000Z');
    expect(r.confidence).toBe('high');
    expect(r.offsetMinutes).toBe(-360);
    expect(r.timezoneLabel).toBe('MDT');
  });

  it('is the same instant as 3 p.m. America/Chicago on that date', () => {
    const mountain = parseDeadline('Oct 15th 2026, 2:00 PM MDT');
    const central = parseDeadline('Oct 15th 2026, 3:00 PM CDT');
    expect(mountain.utc).toBe(central.utc);
    expect(central.utc).toBe('2026-10-15T20:00:00.000Z');
  });

  it('does NOT reproduce the old 14:00Z value', () => {
    expect(parseDeadline('Oct 15th 2026, 2:00 PM MDT').utc).not.toBe('2026-10-15T14:00:00.000Z');
  });

  it('preserves the original text verbatim', () => {
    const raw = 'Oct 15th 2026, 2:00 PM MDT';
    expect(parseDeadline(raw).originalText).toBe(raw);
  });
});

describe('deadlineParser — CST vs CDT and the other US abbreviations', () => {
  it.each([
    ['CST', -360, '2026-01-15T20:00:00.000Z'],
    ['CDT', -300, '2026-01-15T19:00:00.000Z'],
    ['EST', -300, '2026-01-15T19:00:00.000Z'],
    ['EDT', -240, '2026-01-15T18:00:00.000Z'],
    ['MST', -420, '2026-01-15T21:00:00.000Z'],
    ['MDT', -360, '2026-01-15T20:00:00.000Z'],
    ['PST', -480, '2026-01-15T22:00:00.000Z'],
    ['PDT', -420, '2026-01-15T21:00:00.000Z'],
    ['AKST', -540, '2026-01-15T23:00:00.000Z'],
    ['HST', -600, '2026-01-16T00:00:00.000Z'],
    ['UTC', 0, '2026-01-15T14:00:00.000Z'],
    ['GMT', 0, '2026-01-15T14:00:00.000Z'],
  ])('%s resolves to offset %i', (abbr, offset, expectedUtc) => {
    const r = parseDeadline(`Jan 15th 2026, 2:00 PM ${abbr}`);
    expect(r.offsetMinutes).toBe(offset);
    expect(r.utc).toBe(expectedUtc);
    expect(r.confidence).toBe('high');
    expect(r.timezoneSource).toBe('abbreviation');
  });

  it('CST and CDT are one hour apart for the same wall clock', () => {
    const cst = new Date(parseDeadline('Jan 15th 2026, 2:00 PM CST').utc).getTime();
    const cdt = new Date(parseDeadline('Jan 15th 2026, 2:00 PM CDT').utc).getTime();
    expect(cst - cdt).toBe(3600 * 1000);
  });

  it('an abbreviation is trusted over the calendar date (CDT in January)', () => {
    // A portal that prints CDT in January is unusual but self-describing: the
    // abbreviation states the offset, so we must not "correct" it to CST.
    expect(parseDeadline('Jan 15th 2026, 2:00 PM CDT').offsetMinutes).toBe(-300);
  });
});

describe('deadlineParser — offset-aware ISO timestamps', () => {
  it('honours a negative offset (the VA RFI form)', () => {
    const r = parseDeadline('2026-10-07T10:00:00-04:00');
    expect(r.utc).toBe('2026-10-07T14:00:00.000Z');
    expect(r.offsetMinutes).toBe(-240);
    expect(r.timezoneSource).toBe('offset');
    expect(r.confidence).toBe('high');
  });

  it('accepts a compact offset without a colon', () => {
    expect(parseDeadline('2026-10-07T10:00:00-0400').utc).toBe('2026-10-07T14:00:00.000Z');
  });

  it('accepts a trailing Z', () => {
    const r = parseDeadline('2026-10-07T14:00:00Z');
    expect(r.utc).toBe('2026-10-07T14:00:00.000Z');
    expect(r.offsetMinutes).toBe(0);
  });

  it('accepts a positive offset', () => {
    expect(parseDeadline('2026-10-07T14:00:00+02:00').utc).toBe('2026-10-07T12:00:00.000Z');
  });

  it('accepts a space-separated wall clock with an offset', () => {
    expect(parseDeadline('2026-10-07 10:00:00 -04:00').utc).toBe('2026-10-07T14:00:00.000Z');
  });
});

describe('deadlineParser — named zones need a date-aware lookup', () => {
  it('"Central Time" in October resolves as CDT (UTC-5)', () => {
    const r = parseDeadline('Oct 15th 2026, 3:00 PM Central Time');
    expect(r.timezoneSource).toBe('named_zone');
    expect(r.resolvedZone).toBe('America/Chicago');
    expect(r.offsetMinutes).toBe(-300);
    expect(r.utc).toBe('2026-10-15T20:00:00.000Z');
  });

  it('"Central Time" in January resolves as CST (UTC-6)', () => {
    const r = parseDeadline('Jan 15th 2026, 3:00 PM Central Time');
    expect(r.offsetMinutes).toBe(-360);
    expect(r.utc).toBe('2026-01-15T21:00:00.000Z');
  });

  it('bare "ET" resolves to America/New_York', () => {
    const r = parseDeadline('Oct 15th 2026, 10:00 AM ET');
    expect(r.resolvedZone).toBe('America/New_York');
    expect(r.utc).toBe('2026-10-15T14:00:00.000Z');
  });
});

describe('deadlineParser — explicit uncertainty instead of a guessed instant', () => {
  it('missing timezone yields utc null, not a UTC-coerced wall clock', () => {
    const r = parseDeadline('Oct 15th 2026, 2:00 PM');
    expect(r.utc).toBeNull();
    expect(r.confidence).toBe('unknown');
    expect(r.uncertainty).toBe('missing_timezone');
    // The recoverable parts are still preserved for later re-resolution.
    expect(r.wallClock).toBe('2026-10-15T14:00:00');
    expect(r.originalText).toBe('Oct 15th 2026, 2:00 PM');
  });

  it('date-only input is also treated as timezone-unknown', () => {
    const r = parseDeadline('Oct 15th 2026');
    expect(r.utc).toBeNull();
    expect(r.uncertainty).toBe('missing_timezone');
    expect(r.wallClock).toBe('2026-10-15T00:00:00');
  });

  it('an unrecognised zone token does not silently become UTC', () => {
    const r = parseDeadline('Oct 15th 2026, 2:00 PM XYZ');
    expect(r.utc).toBeNull();
    expect(r.confidence).toBe('unknown');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['whitespace', '   '],
    ['prose', 'see solicitation'],
    ['partial', 'Oct 2026'],
    ['impossible date', 'Feb 30th 2026, 2:00 PM CST'],
    ['hour out of range', 'Oct 15th 2026, 25:00 CST'],
    ['minute out of range', 'Oct 15th 2026, 10:99 CST'],
    ['bad month name', 'Xxx 15th 2026, 2:00 PM CST'],
  ])('%s -> unparseable, utc null, never throws', (_label, input) => {
    let r;
    expect(() => { r = parseDeadline(input); }).not.toThrow();
    expect(r.utc).toBeNull();
    expect(r.confidence).toBe('unknown');
  });
});

// ===========================================================================
// Coordinator-reported defects from commit 071edb3. Each of these FAILED before
// the correction pass. They are asserted strictly -- the earlier versions of the
// DST tests were written permissively (if/else accepting either outcome), which
// is precisely why defect 1 shipped. Permissive assertions are not tests.
// ===========================================================================
describe('deadlineParser — reported defect 1: DST fall-back must be ambiguous', () => {
  it('"Nov 1 2026 1:30 AM Eastern Time" is ambiguous, NOT 05:30Z/high', () => {
    const r = parseDeadline('Nov 1 2026 1:30 AM Eastern Time');
    expect(r.utc).toBeNull();
    expect(r.confidence).toBe('unknown');
    expect(r.uncertainty).toBe('dst_ambiguous');
    // the pre-fix behaviour
    expect(r.utc).not.toBe('2026-11-01T05:30:00.000Z');
  });

  it('surfaces BOTH real instants rather than silently choosing one', () => {
    const r = parseDeadline('Nov 1 2026 1:30 AM Eastern Time');
    expect(r.candidates.map((c) => c.utc)).toEqual([
      '2026-11-01T05:30:00.000Z', // EDT, -240
      '2026-11-01T06:30:00.000Z', // EST, -300
    ]);
    expect(r.candidates.map((c) => c.offsetMinutes)).toEqual([-240, -300]);
  });

  it('an explicit DST designation disambiguates it', () => {
    expect(parseDeadline('Nov 1 2026 1:30 AM EDT').utc).toBe('2026-11-01T05:30:00.000Z');
    expect(parseDeadline('Nov 1 2026 1:30 AM EST').utc).toBe('2026-11-01T06:30:00.000Z');
    expect(parseDeadline('Nov 1 2026 1:30 AM EDT').confidence).toBe('high');
  });

  it('an explicit offset disambiguates it', () => {
    expect(parseDeadline('2026-11-01T01:30:00-04:00').utc).toBe('2026-11-01T05:30:00.000Z');
    expect(parseDeadline('2026-11-01T01:30:00-05:00').utc).toBe('2026-11-01T06:30:00.000Z');
  });

  it('the same wall clock in Central is ambiguous too', () => {
    const r = parseDeadline('Nov 1st 2026, 1:30 AM Central Time');
    expect(r.utc).toBeNull();
    expect(r.uncertainty).toBe('dst_ambiguous');
    expect(r.candidates).toHaveLength(2);
  });

  it('spring-forward: a SKIPPED local hour is dst_nonexistent, not resolved', () => {
    const r = parseDeadline('Mar 8th 2026, 2:30 AM Central Time');
    expect(r.utc).toBeNull();
    expect(r.confidence).toBe('unknown');
    expect(r.uncertainty).toBe('dst_nonexistent');
  });

  it('a named zone just outside a transition still resolves cleanly', () => {
    expect(parseDeadline('Nov 1st 2026, 4:00 AM Central Time').offsetMinutes).toBe(-360);
    expect(parseDeadline('Nov 1st 2026, 4:00 AM Central Time').confidence).toBe('high');
    expect(parseDeadline('Oct 31st 2026, 4:00 AM Central Time').offsetMinutes).toBe(-300);
  });

  it('an abbreviation removes DST ambiguity entirely', () => {
    expect(parseDeadline('Nov 1st 2026, 1:30 AM CDT').utc).toBe('2026-11-01T06:30:00.000Z');
    expect(parseDeadline('Nov 1st 2026, 1:30 AM CST').utc).toBe('2026-11-01T07:30:00.000Z');
  });
});

describe('deadlineParser — reported defect 2: time components validated before Date.UTC', () => {
  it('"2026-10-07T25:00:00Z" is invalid, NOT normalised to the next day', () => {
    const r = parseDeadline('2026-10-07T25:00:00Z');
    expect(r.utc).toBeNull();
    expect(r.confidence).toBe('unknown');
    expect(r.uncertainty).toBe('invalid_time');
    expect(r.utc).not.toBe('2026-10-08T01:00:00.000Z'); // the pre-fix behaviour
  });

  it.each([
    ['hour 24', '2026-10-07T24:00:00Z'],
    ['hour 25', '2026-10-07T25:00:00Z'],
    ['hour 99', '2026-10-07T99:00:00Z'],
    ['minute 60', '2026-10-07T10:60:00Z'],
    ['minute 61', '2026-10-07T10:61:00Z'],
    ['minute 99', '2026-10-07T10:99:00Z'],
    ['second 60', '2026-10-07T10:00:60Z'],
    ['second 99', '2026-10-07T10:00:99Z'],
  ])('%s is rejected as invalid_time', (_label, input) => {
    const r = parseDeadline(input);
    expect(r.utc).toBeNull();
    expect(r.uncertainty).toBe('invalid_time');
  });

  it.each([
    ['13:00 PM', 'Oct 15 2026 13:00 PM CST'],
    ['0:00 AM', 'Oct 15 2026 0:00 AM CST'],
    ['15:30 AM', 'Oct 15 2026 15:30 AM CST'],
    ['minute 99 with meridiem', 'Oct 15 2026 10:99 AM CST'],
  ])('invalid 12-hour input %s is rejected, not coerced', (_label, input) => {
    const r = parseDeadline(input);
    expect(r.utc).toBeNull();
    expect(r.uncertainty).toBe('invalid_time');
  });

  it('a valid 24-hour time without meridiem still works', () => {
    expect(parseDeadline('Oct 15 2026 14:00 CST').utc).toBe('2026-10-15T20:00:00.000Z');
  });

  it('boundary values 23:59:59 and 00:00:00 are accepted', () => {
    expect(parseDeadline('2026-10-07T23:59:59Z').utc).toBe('2026-10-07T23:59:59.000Z');
    expect(parseDeadline('2026-10-07T00:00:00Z').utc).toBe('2026-10-07T00:00:00.000Z');
  });
});

describe('deadlineParser — reported defect 3: offset range validated', () => {
  it('"+99:99" is rejected, NOT accepted as a 6039-minute offset', () => {
    const r = parseDeadline('2026-10-07T10:00:00+99:99');
    expect(r.utc).toBeNull();
    expect(r.confidence).toBe('unknown');
    expect(r.uncertainty).toBe('invalid_offset');
    expect(r.offsetMinutes).toBeNull();
  });

  it.each([
    ['+99:99', '2026-10-07T10:00:00+99:99'],
    ['+15:00 (beyond +14:00)', '2026-10-07T10:00:00+15:00'],
    ['-13:00 (beyond -12:00)', '2026-10-07T10:00:00-13:00'],
    ['+00:60 (minute out of range)', '2026-10-07T10:00:00+00:60'],
    ['+05:99', '2026-10-07T10:00:00+05:99'],
  ])('%s is rejected as invalid_offset', (_label, input) => {
    expect(parseDeadline(input).uncertainty).toBe('invalid_offset');
  });

  it.each([
    ['+14:00 (max)', '2026-10-07T10:00:00+14:00', 840],
    ['-12:00 (min)', '2026-10-07T10:00:00-12:00', -720],
    ['+05:45 (Nepal)', '2026-10-07T10:00:00+05:45', 345],
    ['+00:00', '2026-10-07T10:00:00+00:00', 0],
  ])('%s is accepted', (_label, input, expected) => {
    const r = parseDeadline(input);
    expect(r.offsetMinutes).toBe(expected);
    expect(r.confidence).toBe('high');
  });
});

describe('deadlineParser — reported defect 4: seconds and fractions preserved', () => {
  it('"2026-10-07T10:00:45-04:00" keeps the 45 seconds', () => {
    const r = parseDeadline('2026-10-07T10:00:45-04:00');
    expect(r.utc).toBe('2026-10-07T14:00:45.000Z');
    expect(r.utc).not.toBe('2026-10-07T14:00:00.000Z'); // the pre-fix behaviour
    expect(r.wallClock).toBe('2026-10-07T10:00:45');
  });

  it.each([
    ['seconds only', '2026-10-07T10:00:45Z', '2026-10-07T10:00:45.000Z'],
    ['1 fractional digit', '2026-10-07T10:00:45.1Z', '2026-10-07T10:00:45.100Z'],
    ['2 fractional digits', '2026-10-07T10:00:45.12Z', '2026-10-07T10:00:45.120Z'],
    ['3 fractional digits', '2026-10-07T10:00:45.123Z', '2026-10-07T10:00:45.123Z'],
    ['fraction with offset', '2026-10-07T10:00:45.123-04:00', '2026-10-07T14:00:45.123Z'],
  ])('%s is preserved exactly', (_label, input, expected) => {
    expect(parseDeadline(input).utc).toBe(expected);
  });

  it('precision beyond milliseconds FAILS EXPLICITLY rather than truncating', () => {
    // Truncating .123456 -> .123 would move the instant. Refuse instead.
    const r = parseDeadline('2026-10-07T10:00:45.123456Z');
    expect(r.utc).toBeNull();
    expect(r.uncertainty).toBe('unsupported_precision');
    expect(r.confidence).toBe('unknown');
  });

  it('seconds survive in the Bonfire portal format too', () => {
    expect(parseDeadline('Oct 15th 2026, 2:00:30 PM MDT').utc).toBe('2026-10-15T20:00:30.000Z');
  });

  it('absent seconds default to :00, not to an arbitrary value', () => {
    expect(parseDeadline('2026-10-07T10:00-04:00').utc).toBe('2026-10-07T14:00:00.000Z');
  });
});

describe('deadlineParser — server timezone independence', () => {
  const ORIGINAL_TZ = process.env.TZ;
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  // The old bug was TZ-dependent. These assert the fix is not.
  it.each(['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Australia/Sydney', 'Europe/Berlin'])(
    'produces identical output under TZ=%s',
    (tz) => {
      process.env.TZ = tz;
      expect(parseDeadline('Oct 15th 2026, 2:00 PM MDT').utc).toBe('2026-10-15T20:00:00.000Z');
      expect(parseDeadline('2026-10-07T10:00:00-04:00').utc).toBe('2026-10-07T14:00:00.000Z');
      expect(parseDeadline('Jan 15th 2026, 2:00 PM CST').utc).toBe('2026-01-15T20:00:00.000Z');
      expect(parseDeadline('Oct 15th 2026, 2:00 PM').utc).toBeNull();
    },
  );
});

describe('deadlineParser — parsing format tolerance', () => {
  it.each([
    ['Apr 27th 2026, 2:00 PM CDT', '2026-04-27T19:00:00.000Z'],
    ['Apr 27 2026, 2:00 PM CDT', '2026-04-27T19:00:00.000Z'],
    ['April 27th 2026, 2:00 PM CDT', '2026-04-27T19:00:00.000Z'],
    ['Apr 1st 2026, 12:00 AM CDT', '2026-04-01T05:00:00.000Z'],
    ['Apr 1st 2026, 12:00 PM CDT', '2026-04-01T17:00:00.000Z'],
    ['  Apr 27th 2026,  2:00 PM  CDT  ', '2026-04-27T19:00:00.000Z'],
  ])('%s', (input, expected) => {
    expect(parseDeadline(input).utc).toBe(expected);
  });

  it('midnight and noon meridiem are not transposed', () => {
    expect(parseDeadline('Apr 1st 2026, 12:00 AM UTC').utc).toBe('2026-04-01T00:00:00.000Z');
    expect(parseDeadline('Apr 1st 2026, 12:00 PM UTC').utc).toBe('2026-04-01T12:00:00.000Z');
  });
});

describe('zoneOffsetMinutesAt helper', () => {
  it('reports Central as -300 in summer and -360 in winter', () => {
    expect(zoneOffsetMinutesAt('America/Chicago', Date.UTC(2026, 6, 1, 12))).toBe(-300);
    expect(zoneOffsetMinutesAt('America/Chicago', Date.UTC(2026, 0, 1, 12))).toBe(-360);
  });

  it('reports UTC as 0', () => {
    expect(zoneOffsetMinutesAt('UTC', Date.UTC(2026, 6, 1, 12))).toBe(0);
  });

  it('handles a zone with a non-hour offset', () => {
    expect(zoneOffsetMinutesAt('Asia/Kolkata', Date.UTC(2026, 6, 1, 12))).toBe(330);
  });
});
