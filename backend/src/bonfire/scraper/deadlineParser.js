/**
 * Deadline parsing for scraped procurement portals.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The previous implementation (agencyOpportunities.tryParseDate) stripped the
 * timezone token off the portal string and handed the remainder to
 * `new Date(...)`. In a container running TZ=UTC that silently reinterprets a
 * local wall-clock time as a UTC instant.
 *
 *   Portal text : "Oct 15th 2026, 2:00 PM MDT"   (= 2026-10-15T20:00:00Z)
 *   Old result  : 2026-10-15T14:00:00.000Z        (six hours early)
 *
 * Two independent defects: the offset was discarded, and the result depended on
 * the server's TZ environment variable. Both are fixed here.
 *
 * DESIGN
 * ------
 * 1. Wall-clock components are parsed with an explicit regex. We never hand a
 *    bare local-time string to `new Date()`, because that is engine- and
 *    TZ-dependent.
 * 2. A US timezone ABBREVIATION already encodes its offset (CDT is always
 *    UTC-5; CST is always UTC-6). Where the portal prints one we use it
 *    directly -- no zone database, no DST inference, no ambiguity.
 * 3. A bare zone NAME ("Central Time", "CT") does not encode an offset, so we
 *    resolve it against the IANA zone for that date using Intl. That is the
 *    only path that can be DST-ambiguous, and we flag it when it is.
 * 4. When the timezone is missing or unresolvable we return an explicit
 *    uncertainty and `utc: null`. We do NOT guess an instant. A wrong deadline
 *    is worse than a known-unknown: it silently drops live bids out of
 *    close-date windows.
 *
 * FAILURE MODES
 *   unparseable            - no recognisable date/time in the input
 *   invalid_time           - hour/minute/second out of range, or a 12-hour clock
 *                            value that cannot exist (e.g. "13:00 PM")
 *   invalid_offset         - numeric offset outside the real-world range
 *   unsupported_precision  - more sub-second precision than we can represent
 *                            without altering the instant
 *   missing_timezone       - wall clock parsed, no zone token present
 *   ambiguous_timezone     - zone token present but not resolvable to one offset
 *   dst_ambiguous          - named zone lands in a REPEATED local hour (fall
 *                            back): two real instants match the wall clock
 *   dst_nonexistent        - named zone lands in a SKIPPED local hour (spring
 *                            forward): no real instant matches the wall clock
 * In every case `utc` is null and `confidence` is 'unknown'; the original text
 * and whatever components we did recover are preserved for later re-resolution.
 *
 * WHY WE VALIDATE BEFORE Date.UTC
 * Date.UTC silently NORMALISES out-of-range components: Date.UTC(2026,9,7,25)
 * is 8 Oct 01:00, not an error. Accepting that would turn a malformed portal
 * string into a confident, wrong instant. Every component is therefore range-
 * checked first.
 */

// Real-world UTC offsets span -12:00..+14:00. Anything outside that is not a
// timezone, it is a parse error.
const MIN_OFFSET_MINUTES = -12 * 60;
const MAX_OFFSET_MINUTES = 14 * 60;
// We represent instants to millisecond precision. More digits than this cannot
// be carried without changing the instant, so we refuse rather than truncate.
const MAX_FRACTIONAL_DIGITS = 3;

// US portal abbreviations map directly to a fixed offset in minutes.
// This is deliberately explicit rather than zone-derived: an abbreviation that
// names its DST state is unambiguous, which removes the whole DST problem.
const ABBREVIATION_OFFSETS = {
  UTC: 0, GMT: 0, Z: 0,
  EST: -300, EDT: -240,
  CST: -360, CDT: -300,
  MST: -420, MDT: -360,
  PST: -480, PDT: -420,
  AKST: -540, AKDT: -480,
  HST: -600,
  AST: -240, ADT: -180,
};

// Bare zone names carry no DST state, so they need a date-aware lookup.
const NAMED_ZONES = {
  'EASTERN TIME': 'America/New_York', ET: 'America/New_York',
  'CENTRAL TIME': 'America/Chicago', CT: 'America/Chicago',
  'MOUNTAIN TIME': 'America/Denver', MT: 'America/Denver',
  'PACIFIC TIME': 'America/Los_Angeles', PT: 'America/Los_Angeles',
  'ALASKA TIME': 'America/Anchorage',
  'HAWAII TIME': 'Pacific/Honolulu',
};

const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function result(fields) {
  return {
    originalText: null,
    wallClock: null,
    timezoneLabel: null,
    timezoneSource: 'none', // offset | abbreviation | named_zone | none
    resolvedZone: null,
    offsetMinutes: null,
    utc: null,
    confidence: 'unknown', // high | unknown
    uncertainty: null,
    // Populated only for dst_ambiguous: the real instants the wall clock could
    // mean. Surfaced so a consumer can show both rather than be told "unknown".
    candidates: null,
    ...fields,
  };
}

const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');

/** Serialize wall-clock components to a naive ISO-like string (no zone). */
function toWallClock({ year, month, day, hour, minute, second = 0, ms = 0 }) {
  const frac = ms ? `.${pad(ms, 3)}` : '';
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${frac}`;
}

/** Naive wall clock as a millisecond value, treating components as if UTC. */
function naiveMs({ year, month, day, hour, minute, second = 0, ms = 0 }) {
  return Date.UTC(year, month - 1, day, hour, minute, second, ms);
}

/** Wall clock + offset -> UTC instant. Pure arithmetic; no local-time APIs. */
function toUtcIso(parts, offsetMinutes) {
  const asUtcMs = naiveMs(parts);
  if (Number.isNaN(asUtcMs)) return null;
  return new Date(asUtcMs - offsetMinutes * 60000).toISOString();
}

/**
 * Offset (in minutes) that an IANA zone was at a given UTC instant.
 * Uses Intl only -- no dependency on the process TZ.
 */
function zoneOffsetMinutesAt(zone, utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  // Intl renders hour 24 for midnight in some ICU versions; normalise to 0.
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    hour, Number(parts.minute), Number(parts.second),
  );
  return Math.round((asIfUtc - utcMs) / 60000);
}

/**
 * Resolve a wall clock in a named zone to UTC.
 *
 * A single fixed-point pass is NOT sufficient. During a DST fall-back the same
 * local time maps to TWO real instants, and a fixed-point check will happily
 * settle on one of them and report high confidence -- which is exactly the
 * defect this replaces. So we enumerate every offset the zone uses around that
 * date, build a candidate instant for each, and keep only those candidates that
 * actually render back as the requested wall clock.
 *
 * Returns one of:
 *   { utc, offsetMinutes }        exactly one candidate matched
 *   { ambiguous: true }           two or more matched (repeated local hour)
 *   { nonexistent: true }         none matched (skipped local hour)
 */
function resolveInZone(parts, zone) {
  const naive = naiveMs(parts);
  const DAY = 86400000;

  // Sample well outside any transition so both the standard and DST offsets are
  // represented, plus the naive instant itself for zones with unusual rules.
  const candidateOffsets = new Set([
    zoneOffsetMinutesAt(zone, naive - 200 * DAY),
    zoneOffsetMinutesAt(zone, naive - 10 * DAY),
    zoneOffsetMinutesAt(zone, naive),
    zoneOffsetMinutesAt(zone, naive + 10 * DAY),
    zoneOffsetMinutesAt(zone, naive + 200 * DAY),
  ]);

  const matches = new Map(); // utcMs -> offsetMinutes
  for (const off of candidateOffsets) {
    const candidateMs = naive - off * 60000;
    // Does this instant genuinely present as the requested wall clock in `zone`?
    if (zoneOffsetMinutesAt(zone, candidateMs) === off) matches.set(candidateMs, off);
  }

  if (matches.size === 0) return { nonexistent: true };
  if (matches.size > 1) {
    return {
      ambiguous: true,
      candidates: [...matches.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([ms, off]) => ({ utc: new Date(ms).toISOString(), offsetMinutes: off })),
    };
  }
  const [[ms, off]] = [...matches.entries()];
  return { utc: new Date(ms).toISOString(), offsetMinutes: off };
}

/** Pull a trailing zone token off the string. Returns {rest, token, kind}. */
function extractZoneToken(text) {
  let s = text.trim();

  // Explicit numeric offset: -04:00 / -0400 / +00:00, optionally after 'UTC'.
  const off = s.match(/(?:UTC|GMT)?\s*([+-])(\d{2}):?(\d{2})\s*$/i);
  if (off) {
    const sign = off[1] === '-' ? -1 : 1;
    const oh = Number(off[2]);
    const om = Number(off[3]);
    const minutes = sign * (oh * 60 + om);
    const rest = s.slice(0, off.index).trim();
    // An offset whose components or total are out of range is a malformed
    // string, not a timezone. Date arithmetic would happily absorb it.
    if (om > 59 || minutes < MIN_OFFSET_MINUTES || minutes > MAX_OFFSET_MINUTES) {
      return { rest, kind: 'invalid_offset', label: off[0].trim() };
    }
    return { rest, kind: 'offset', offsetMinutes: minutes, label: off[0].trim() };
  }

  // Trailing Z on an ISO timestamp.
  if (/\dZ$/.test(s)) {
    return { rest: s.replace(/Z$/, '').trim(), kind: 'offset', offsetMinutes: 0, label: 'Z' };
  }

  // Alphabetic abbreviation, e.g. "CDT", "MST", "UTC".
  const abbr = s.match(/\b([A-Z]{2,4})\s*$/);
  if (abbr && Object.prototype.hasOwnProperty.call(ABBREVIATION_OFFSETS, abbr[1].toUpperCase())) {
    const label = abbr[1].toUpperCase();
    return {
      rest: s.slice(0, abbr.index).trim(),
      kind: 'abbreviation',
      offsetMinutes: ABBREVIATION_OFFSETS[label],
      label,
    };
  }

  // Named zone, e.g. "Central Time", "CT".
  const named = s.match(/\b(EASTERN TIME|CENTRAL TIME|MOUNTAIN TIME|PACIFIC TIME|ALASKA TIME|HAWAII TIME|ET|CT|MT|PT)\s*$/i);
  if (named) {
    const label = named[1].toUpperCase();
    return { rest: s.slice(0, named.index).trim(), kind: 'named_zone', zone: NAMED_ZONES[label], label };
  }

  return { rest: s, kind: 'none' };
}

/**
 * Range-check time components. Must run BEFORE Date.UTC, which normalises
 * out-of-range values into a different (valid-looking) instant.
 */
function isValidTime({ hour, minute, second = 0, ms = 0 }) {
  return Number.isInteger(hour) && hour >= 0 && hour <= 23
    && Number.isInteger(minute) && minute >= 0 && minute <= 59
    && Number.isInteger(second) && second >= 0 && second <= 59
    && Number.isInteger(ms) && ms >= 0 && ms <= 999;
}

/** Parse wall-clock components from the zone-stripped remainder. */
function extractWallClock(text) {
  const s = text
    .replace(/(\d+)(st|nd|rd|th)\b/gi, '$1') // "27th" -> "27"
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // ISO-ish: 2026-10-07T10:00[:00[.sss]] / 2026-10-07 10:00:00
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$/);
  if (iso) {
    const frac = iso[7];
    if (frac !== undefined && frac.length > MAX_FRACTIONAL_DIGITS) {
      // Truncating would move the instant. Refuse explicitly instead.
      return { invalid: 'unsupported_precision' };
    }
    const parts = {
      year: +iso[1], month: +iso[2], day: +iso[3],
      hour: +iso[4], minute: +iso[5], second: iso[6] ? +iso[6] : 0,
      ms: frac === undefined ? 0 : Number(frac.padEnd(3, '0')),
    };
    if (!isValidTime(parts)) return { invalid: 'invalid_time' };
    return parts;
  }
  // Date-only ISO
  const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return {
      year: +isoDate[1], month: +isoDate[2], day: +isoDate[3], hour: 0, minute: 0, second: 0, ms: 0, dateOnly: true,
    };
  }

  // Bonfire style: "Apr 27 2026 2:00[:00] PM" (comma already removed)
  const m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toUpperCase()];
    if (!month) return null;
    const rawHour = +m[4];
    const mer = (m[7] || '').toUpperCase();
    let hour = rawHour;
    if (mer) {
      // A 12-hour clock only admits 1..12. "13:00 PM" / "0:00 AM" are malformed
      // and must NOT be silently coerced into a valid instant.
      if (rawHour < 1 || rawHour > 12) return { invalid: 'invalid_time' };
      if (mer === 'PM' && rawHour !== 12) hour = rawHour + 12;
      if (mer === 'AM' && rawHour === 12) hour = 0;
    }
    const parts = {
      year: +m[3], month, day: +m[2], hour, minute: +m[5], second: m[6] ? +m[6] : 0, ms: 0,
    };
    if (!isValidTime(parts)) return { invalid: 'invalid_time' };
    return parts;
  }

  // Date-only: "Apr 27 2026"
  const d = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})$/);
  if (d) {
    const month = MONTHS[d[1].slice(0, 3).toUpperCase()];
    if (!month) return null;
    return {
      year: +d[3], month, day: +d[2], hour: 0, minute: 0, dateOnly: true,
    };
  }

  return null;
}

/** Reject component sets that are not real calendar dates (e.g. Feb 30). */
function isRealDate({ year, month, day }) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day;
}

/**
 * Parse a portal deadline string into an explicit, server-TZ-independent result.
 *
 * @param {string} input raw text exactly as scraped
 * @returns {object} see `result()` for the shape. `utc` is null whenever the
 *   instant cannot be established without guessing.
 */
function parseDeadline(input) {
  if (input === null || input === undefined || String(input).trim() === '') {
    return result({ originalText: input == null ? null : String(input), uncertainty: 'unparseable' });
  }
  const originalText = String(input).trim();

  const zone = extractZoneToken(originalText);
  const parts = extractWallClock(zone.rest);

  // Component-level rejections carry their own reason so the caller can tell a
  // malformed time from a missing timezone.
  if (parts && parts.invalid) {
    return result({ originalText, timezoneLabel: zone.label || null, uncertainty: parts.invalid });
  }
  if (!parts || !isRealDate(parts)) {
    return result({ originalText, uncertainty: 'unparseable' });
  }

  const wallClock = toWallClock(parts);
  const base = {
    originalText,
    wallClock,
    timezoneLabel: zone.label || null,
    timezoneSource: zone.kind === 'invalid_offset' ? 'unresolvable' : zone.kind,
  };

  if (zone.kind === 'invalid_offset') {
    return result({ ...base, uncertainty: 'invalid_offset' });
  }

  if (zone.kind === 'offset' || zone.kind === 'abbreviation') {
    return result({
      ...base,
      offsetMinutes: zone.offsetMinutes,
      utc: toUtcIso(parts, zone.offsetMinutes),
      confidence: 'high',
    });
  }

  if (zone.kind === 'named_zone') {
    if (!zone.zone) {
      return result({ ...base, uncertainty: 'ambiguous_timezone' });
    }
    const r = resolveInZone(parts, zone.zone);
    // A repeated local hour has two real instants and a skipped one has none.
    // Either way we refuse to pick: an explicit offset or DST designation
    // (e.g. "EST"/"EDT") is what disambiguates, and it was not supplied.
    if (r.ambiguous) {
      return result({
        ...base,
        resolvedZone: zone.zone,
        uncertainty: 'dst_ambiguous',
        candidates: r.candidates,
      });
    }
    if (r.nonexistent) {
      return result({ ...base, resolvedZone: zone.zone, uncertainty: 'dst_nonexistent' });
    }
    return result({
      ...base,
      resolvedZone: zone.zone,
      offsetMinutes: r.offsetMinutes,
      utc: r.utc,
      confidence: 'high',
    });
  }

  // Wall clock understood, zone absent. Explicitly uncertain -- never guessed.
  return result({ ...base, uncertainty: 'missing_timezone' });
}

module.exports = {
  parseDeadline,
  ABBREVIATION_OFFSETS,
  NAMED_ZONES,
  // exported for tests
  zoneOffsetMinutesAt,
};
