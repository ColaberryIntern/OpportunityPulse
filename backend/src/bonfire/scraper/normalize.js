// Pure functions: page-record shape -> ingestJsonArray() row shape.
// No I/O, no logging, no env reads — fully unit-testable.
//
// External ID prefix scheme (must match what `bonfire.service.upsertJsonArray`
// expects for ON CONFLICT to work):
//   bonfire:agency:{subdomain}:{refNumber}    — durable, stable per agency portal
//   bonfire:vendor-rec:{sha1(title+agency)}   — stable enough for the dashboard's
//                                                rotating AI-recommended cards

const crypto = require('crypto');

function shortHash(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 16);
}

function clean(str) {
  return typeof str === 'string' ? str.replace(/\s+/g, ' ').trim() : '';
}

// Shared agency display label. Subdomain in parentheses helps admins disambiguate.
function agencyLabel(subdomain, name) {
  const n = clean(name);
  const s = clean(subdomain);
  if (n && s && n.toLowerCase() !== s.toLowerCase()) return `${n} (${s})`;
  return n || s || null;
}

// Vendor-hub AI-recommended card -> ingest row.
function fromVendorRecCard(card) {
  const title = clean(card.title);
  const agency = clean(card.agency);
  if (!title) return null;
  const desc = clean(card.description);
  const raw = desc || title;
  return {
    external_id: `bonfire:vendor-rec:${shortHash(`${title}|${agency}`)}`,
    title,
    agency: agency || null,
    description: desc || null,
    category_raw: card.categoryRaw ? clean(card.categoryRaw) : null,
    estimated_value: card.estimatedValue || null,
    close_date: card.closeDate || null,
    source_url: card.url || null,
    raw_text: raw,
  };
}

// Agency portal "My Opportunities" row -> ingest row.
// `subdomain` is required to namespace the external_id correctly.
//
// Bonfire portals render every tab (Open / Closed / Awarded / Cancelled / Past)
// as a separate DataTable into the same DOM. The parser collects from all of
// them, so we filter to status="Open" here. Anything missing or non-Open
// status drops out — only actionable bids land in the DB.
function fromAgencyOpportunity(record, subdomain, { agencyName } = {}) {
  const ref = clean(record.refNumber);
  const title = clean(record.projectName);
  if (!ref || !title) return null;
  const status = clean(record.status);
  if (!status || !/^open$/i.test(status)) return null;
  const portalUrl =
    record.portalUrl
      ? (record.portalUrl.startsWith('http')
          ? record.portalUrl
          : `https://${subdomain}.bonfirehub.com${record.portalUrl}`)
      : `https://${subdomain}.bonfirehub.com/portal/?tab=openOpportunities`;
  const desc = clean(record.description);
  const raw = desc || `${ref} — ${title}`;
  return {
    external_id: `bonfire:agency:${clean(subdomain)}:${ref}`,
    title,
    agency: agencyLabel(subdomain, agencyName),
    description: desc || null,
    category_raw: record.categoryRaw ? clean(record.categoryRaw) : null,
    estimated_value: record.estimatedValue || null,
    close_date: record.closeDate || null,
    source_url: portalUrl,
    raw_text: raw,
  };
}

module.exports = {
  shortHash,
  agencyLabel,
  fromVendorRecCard,
  fromAgencyOpportunity,
};
