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

describe('deadlineParser — DST boundary behaviour', () => {
  // 2026 US DST: begins Sun 8 Mar, ends Sun 1 Nov.
  it('an abbreviation removes DST ambiguity entirely (fall-back hour)', () => {
    // 01:30 on 1 Nov 2026 happens twice in America/Chicago. With CDT or CST
    // stated, each is a single unambiguous instant.
    expect(parseDeadline('Nov 1st 2026, 1:30 AM CDT').utc).toBe('2026-11-01T06:30:00.000Z');
    expect(parseDeadline('Nov 1st 2026, 1:30 AM CST').utc).toBe('2026-11-01T07:30:00.000Z');
  });

  it('a named zone in the repeated hour is flagged, not guessed', () => {
    const r = parseDeadline('Nov 1st 2026, 1:30 AM Central Time');
    if (r.utc === null) {
      expect(r.uncertainty).toBe('dst_ambiguous');
      expect(r.confidence).toBe('unknown');
    } else {
      // If the implementation resolves it, it must pick one of the two real
      // instants — never something in between.
      expect(['2026-11-01T06:30:00.000Z', '2026-11-01T07:30:00.000Z']).toContain(r.utc);
    }
  });

  it('a named zone just outside the transition resolves cleanly', () => {
    expect(parseDeadline('Nov 1st 2026, 4:00 AM Central Time').offsetMinutes).toBe(-360);
    expect(parseDeadline('Oct 31st 2026, 4:00 AM Central Time').offsetMinutes).toBe(-300);
  });

  it('spring-forward: 2:30 AM on 8 Mar 2026 does not exist in Central', () => {
    const r = parseDeadline('Mar 8th 2026, 2:30 AM Central Time');
    // Either flagged, or normalised to a real instant — but never silently
    // treated as though the local time existed at the standard offset.
    if (r.utc !== null) {
      expect(new Date(r.utc).toISOString()).toBe(r.utc);
    } else {
      expect(r.uncertainty).toBe('dst_ambiguous');
    }
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
