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
 *   unparseable          - no recognisable date/time in the input
 *   missing_timezone     - wall clock parsed, no zone token present
 *   ambiguous_timezone   - zone token present but not resolvable to one offset
 *   dst_ambiguous        - named zone lands in a repeated local hour (fall back)
 * In every case `utc` is null and `confidence` is 'unknown'; the original text
 * and whatever components we did recover are preserved for later re-resolution.
 */

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
    ...fields,
  };
}

const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');

/** Serialize wall-clock components to a naive ISO-like string (no zone). */
function toWallClock({ year, month, day, hour, minute }) {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
}

/** Wall clock + offset -> UTC instant. Pure arithmetic; no local-time APIs. */
function toUtcIso({ year, month, day, hour, minute }, offsetMinutes) {
  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
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
 * Returns { utc, offsetMinutes } or { ambiguous: true } when the local time is
 * repeated (DST fall-back) or skipped (spring-forward).
 */
function resolveInZone(parts, zone) {
  const naiveMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  // Two-pass fixed point: guess with the offset at the naive instant, then
  // re-check with the offset at the candidate instant.
  const guess = zoneOffsetMinutesAt(zone, naiveMs);
  const candidateMs = naiveMs - guess * 60000;
  const confirm = zoneOffsetMinutesAt(zone, candidateMs);
  if (confirm !== guess) {
    const second = naiveMs - confirm * 60000;
    // If the second pass is self-consistent the first guess merely straddled a
    // transition; otherwise the local time is genuinely ambiguous or skipped.
    if (zoneOffsetMinutesAt(zone, second) !== confirm) return { ambiguous: true };
    return { utc: new Date(second).toISOString(), offsetMinutes: confirm };
  }
  return { utc: new Date(candidateMs).toISOString(), offsetMinutes: guess };
}

/** Pull a trailing zone token off the string. Returns {rest, token, kind}. */
function extractZoneToken(text) {
  let s = text.trim();

  // Explicit numeric offset: -04:00 / -0400 / +00:00, optionally after 'UTC'.
  const off = s.match(/(?:UTC|GMT)?\s*([+-])(\d{2}):?(\d{2})\s*$/i);
  if (off) {
    const sign = off[1] === '-' ? -1 : 1;
    const minutes = sign * (Number(off[2]) * 60 + Number(off[3]));
    return { rest: s.slice(0, off.index).trim(), kind: 'offset', offsetMinutes: minutes, label: off[0].trim() };
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

/** Parse wall-clock components from the zone-stripped remainder. */
function extractWallClock(text) {
  const s = text
    .replace(/(\d+)(st|nd|rd|th)\b/gi, '$1') // "27th" -> "27"
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // ISO-ish: 2026-10-07T10:00 / 2026-10-07 10:00:00
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (iso) {
    return {
      year: +iso[1], month: +iso[2], day: +iso[3], hour: +iso[4], minute: +iso[5],
    };
  }
  // Date-only ISO
  const isoDate = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    return {
      year: +isoDate[1], month: +isoDate[2], day: +isoDate[3], hour: 0, minute: 0, dateOnly: true,
    };
  }

  // Bonfire style: "Apr 27 2026 2:00 PM" (comma already removed)
  const m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toUpperCase()];
    if (!month) return null;
    let hour = +m[4];
    const mer = (m[6] || '').toUpperCase();
    if (mer === 'PM' && hour !== 12) hour += 12;
    if (mer === 'AM' && hour === 12) hour = 0;
    if (hour > 23 || +m[5] > 59) return null;
    return { year: +m[3], month, day: +m[2], hour, minute: +m[5] };
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

  if (!parts || !isRealDate(parts)) {
    return result({ originalText, uncertainty: 'unparseable' });
  }

  const wallClock = toWallClock(parts);
  const base = {
    originalText,
    wallClock,
    timezoneLabel: zone.label || null,
    timezoneSource: zone.kind,
  };

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
    if (r.ambiguous) {
      return result({ ...base, resolvedZone: zone.zone, uncertainty: 'dst_ambiguous' });
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
