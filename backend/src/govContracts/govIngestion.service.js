/**
 * Ingestion writer — the caller that makes Phase 2's tables real.
 *
 * One transaction per observation, doing four things atomically:
 *   1. resolve-or-create canonical identity + aliases
 *   2. decide whether the SOURCE changed, and if so append an immutable snapshot
 *      and advance source_snapshot_version
 *   3. apply the deadline observation to the opportunity row
 *   4. return a summary the caller can log
 *
 * VERSIONING RULE
 * source_snapshot_version advances only when SOURCE FACTS change. The content
 * hash is taken over source facts ONLY — deadline text, title, agency, source
 * URL, affirmed-absence — so an unchanged re-observation produces no snapshot,
 * and an enrichment-only change (scores, categories, AI output) cannot advance
 * a source version because none of it feeds the hash.
 *
 * SNAPSHOTS ARE OBSERVATION HISTORY, NOT ATTEMPT HISTORY.
 * A failed fetch observed nothing, so it writes no snapshot and advances no
 * version. It still updates the row's fetch columns, which is where attempt
 * history lives (close_date_fetch_attempted_at / _status / _error).
 *
 * IDENTITY STABILITY
 * canonical_public_id is derived once from the opportunity's primary key and
 * then PERSISTED and uniquely indexed. It therefore equals the id the read path
 * derives for rows that have no identity row yet, so an id handed out by list
 * before ingestion still resolves through detail after it.
 */

const crypto = require('crypto');
const logger = require('../logging/logger');
const { buildObservationPatch, AUTHORITY } = require('../bonfire/deadlineEvidence.service');
const { canonicalIdFor } = require('./govOpportunityV1.mapper');

const ALIAS_PRIMARY = 'bonfire_opportunity_id';

// The ONLY row columns an observation may rewrite, besides the deadline columns
// the evidence decision owns. Deliberately an allow-list held HERE rather than
// taken from the caller: a caller that could name its own columns could rewrite
// enrichment or scoring through the evidence path, and `enrichAllUnenriched()`
// depends on enriched_at surviving a re-scrape.
//
// closeDate is absent ON PURPOSE. The deadline decision publishes it; letting a
// source column carry it would restore the split-publication defect this
// transaction exists to remove.
const SOURCE_COLUMNS = ['title', 'agency', 'description', 'categoryRaw', 'sourceUrl', 'rawText'];

function pickSourceColumns(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of SOURCE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(input, k)) out[k] = input[k];
  }
  return out;
}

// A re-publisher announcing someone else's solicitation. Reading its deadline
// tells us what the re-publisher printed, not what the buyer set. NASPO SW1045
// is the live example: posted on Utah's Bonfire, lead buyer Oklahoma.
// NOTE on `naspo`: a NASPO ValuePoint solicitation carried on a state portal
// may be that state's OWN lead posting or a courtesy re-post, and the notice
// text alone does not distinguish them. Both classify as courtesy here, which
// is the safe direction: it withholds verification rather than inventing a
// confirmed authority we have no evidence for.
const COURTESY_RE = /(courtesy\s+post|courtesy\s+notice|on\s+behalf\s+of|\bnaspo\b|cooperative\s+post)/i;

/**
 * Classify who published this notice, from what we actually OBSERVED.
 *
 * Returns the classification AND the evidence for it. A populated basis string
 * proves nothing; the evidence is what a reviewer can check. Where evidence is
 * missing we return UNKNOWN rather than inventing a confirmed mapping — and
 * UNKNOWN cannot verify.
 */
function classifySourceAuthority({ title, sourceUrl, externalId } = {}) {
  const t = title ? String(title) : '';

  if (COURTESY_RE.test(t)) {
    const m = t.match(COURTESY_RE);
    return {
      authority: AUTHORITY.COURTESY_POSTING,
      evidence: `Title matched courtesy-posting phrase "${m[0]}": "${t.slice(0, 120)}". `
        + 'The posting portal is re-publishing a different body’s solicitation, so its '
        + 'rendering of the deadline is not the buyer’s.',
    };
  }

  // Publisher of record: the portal we read is the same body the notice is
  // namespaced under. Evidenced by comparing the URL host to the ingest
  // namespace, both of which we observed.
  const ns = String(externalId || '').match(/^bonfire:agency:([^:]+):/);
  let host = null;
  try { host = sourceUrl ? new URL(String(sourceUrl)).hostname : null; } catch { host = null; }
  if (ns && host) {
    const sub = host.split('.')[0].toLowerCase();
    if (sub === ns[1].toLowerCase()) {
      return {
        authority: AUTHORITY.PUBLISHER_OF_RECORD,
        evidence: `Portal host "${host}" matches the ingest namespace "${ns[1]}"; the agency `
          + 'operating the portal is the body soliciting, so it publishes its own deadline.',
      };
    }
    return {
      authority: AUTHORITY.UNKNOWN,
      evidence: `Portal host "${host}" does NOT match the ingest namespace "${ns[1]}". `
        + 'Unable to establish that the reader is the soliciting body.',
    };
  }

  return {
    authority: AUTHORITY.UNKNOWN,
    evidence: 'No source URL and/or no agency namespace observed; authority not established.',
  };
}

/**
 * Hash over SOURCE facts only.
 *
 * Deliberately excludes every enrichment field. If scores or AI categories fed
 * this, re-running enrichment would advance a *source* version and claim the
 * buyer changed something they did not.
 */
function sourceContentHash(sourceFacts, extra = {}) {
  // Sort so an ordering change in a candidate list is not mistaken for a
  // content change, while a changed READING genuinely is one.
  const candidates = Array.isArray(extra.candidates)
    ? extra.candidates
      .map((c) => ({ utc: c && c.utc ? String(c.utc) : null, source: c && c.source ? String(c.source) : null }))
      .sort((a1, b1) => String(a1.utc).localeCompare(String(b1.utc)))
    : null;

  const canonical = {
    // --- what the buyer published
    deadlineText: sourceFacts.deadlineText ?? null,
    absentConfirmed: sourceFacts.absentConfirmed === true,
    title: sourceFacts.title ?? null,
    agency: sourceFacts.agency ?? null,
    sourceUrl: sourceFacts.sourceUrl ?? null,
    externalId: sourceFacts.externalId ?? null,
    // --- material evidence used for qualification, which can change WITHOUT
    // any of the above changing. Omitting these let a changed competing
    // reading, or a changed authority determination, pass unversioned.
    candidates,
    authority: extra.authority ?? null,
    authorityEvidence: extra.authorityEvidence ?? null,
    // --- document identities/versions/hashes WHERE OBSERVED. null here means
    // ingestion has not observed any documents for this source; it is NOT a
    // claim that none exist. Bonfire portal scraping captures no documents.
    documents: Array.isArray(extra.documents) && extra.documents.length
      ? extra.documents
        .map((d) => ({
          id: d.id ?? null, version: d.version ?? null, sha256: d.sha256 ?? null,
        }))
        .sort((a1, b1) => String(a1.id).localeCompare(String(b1.id)))
      : null,
  };
  // Deliberately EXCLUDED: fetch timestamps, observation ids, and every
  // enrichment field. A re-fetch that sees the same page, and a re-run of
  // enrichment, must not advance a SOURCE version.
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Resolve an existing canonical identity, or mint one. Write path only. */
async function resolveOrCreateIdentity(models, opportunityId, sourceSystem, extraAliases, transaction) {
  const { GovCanonicalOpportunity, GovSourceAlias } = models;

  const existing = await GovSourceAlias.findOne({
    where: { idType: ALIAS_PRIMARY, idValue: String(opportunityId) },
    transaction,
  });
  if (existing) {
    const canonical = await GovCanonicalOpportunity.findByPk(existing.canonicalId, { transaction });
    return { canonical, created: false };
  }

  const canonical = await GovCanonicalOpportunity.create({
    // Equal to what the read path derives, so ids stay stable across the
    // transition from derived to persisted.
    canonicalPublicId: canonicalIdFor(opportunityId),
    sourceSystem,
    sourceSnapshotVersion: 0, // advanced to 1 by the first observed source state
  }, { transaction });

  await GovSourceAlias.create({
    canonicalId: canonical.canonicalId,
    idType: ALIAS_PRIMARY,
    idValue: String(opportunityId),
    observedAt: new Date(),
    note: 'Primary alias minted at first ingestion.',
  }, { transaction });

  for (const a of extraAliases || []) {
    if (!a || !a.idType || !a.idValue) continue;
    // Aliases RECORD duplicates. A collision means this identifier already
    // resolves elsewhere; that is data to keep, not an error to crash on.
    const clash = await GovSourceAlias.findOne({
      where: { idType: a.idType, idValue: String(a.idValue) }, transaction,
    });
    if (clash) {
      if (clash.canonicalId !== canonical.canonicalId) {
        logger.warn('gov ingestion: alias already bound to a different canonical record', {
          idType: a.idType, idValue: String(a.idValue),
        });
      }
      continue;
    }
    await GovSourceAlias.create({
      canonicalId: canonical.canonicalId,
      idType: a.idType,
      idValue: String(a.idValue),
      observedAt: a.observedAt || new Date(),
      note: a.note || null,
    }, { transaction });
  }

  return { canonical, created: true };
}

/**
 * Ingest one observation.
 *
 * @returns {{identityCreated, snapshotWritten, sourceSnapshotVersion, decision, contentHash}}
 */
async function ingestObservation(input, { models, sequelize }) {
  const {
    opportunityId,
    sourceSystem = 'bonfire',
    aliases = [],
    sourceFacts = {},
    fetch = {},
    parse = null,
    rawPresent,
    absentConfirmed,
    candidates = null,
    provenance = null,
    sourceColumns = null,
    now = new Date(),
  } = input;

  const { BonfireOpportunity, GovSourceSnapshot } = models;

  return sequelize.transaction(async (transaction) => {
    const row = await BonfireOpportunity.findByPk(opportunityId, {
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!row) return { applied: false, reason: 'not_found' };

    const { canonical, created } = await resolveOrCreateIdentity(
      models, opportunityId, sourceSystem, aliases, transaction,
    );

    // ---- snapshot / version decision -------------------------------------
    let snapshotWritten = false;
    let version = canonical.sourceSnapshotVersion;

    if (fetch.status === 'success') {
      const contentHash = sourceContentHash(sourceFacts, {
        candidates,
        authority: provenance ? provenance.authority : null,
        authorityEvidence: provenance ? provenance.authorityEvidence : null,
        documents: input.documents || null,
      });
      const latest = await GovSourceSnapshot.findOne({
        where: { canonicalId: canonical.canonicalId },
        order: [['sourceSnapshotVersion', 'DESC']],
        transaction,
      });

      // Unchanged source facts => no snapshot, no version bump. This is what
      // makes a re-scrape that sees the same page a no-op for versioning.
      if (!latest || latest.contentHash !== contentHash) {
        version = (latest ? latest.sourceSnapshotVersion : 0) + 1;
        await GovSourceSnapshot.create({
          canonicalId: canonical.canonicalId,
          sourceSnapshotVersion: version,
          contentHash,
          fetchAttemptedAt: fetch.attemptedAt || now,
          fetchStatus: 'success',
          fetchError: null,
          observedAt: now,
          payload: {
            sourceFacts,
            observation: {
              rawPresent: rawPresent === true,
              absentConfirmed: absentConfirmed === true,
              parsedUtc: parse ? parse.utc : null,
              parseConfidence: parse ? parse.confidence : null,
              parseUncertainty: parse ? parse.uncertainty : null,
              candidates: candidates || null,
            },
            provenance: provenance || null,
          },
        }, { transaction });
        await canonical.update({ sourceSnapshotVersion: version }, { transaction });
        snapshotWritten = true;
      }
    }

    // ---- deadline observation --------------------------------------------
    const { patch, decision } = buildObservationPatch(
      row.get ? row.get({ plain: true }) : row,
      {
        fetch, parse, rawPresent, absentConfirmed, candidates, provenance, now,
      },
    );
    // ONE write. The source columns the scrape saw and the deadline decision
    // derived from those same columns land together or not at all, so a
    // snapshot always describes a row that exists in that state. The patch is
    // applied LAST so the deadline decision wins over anything a source column
    // might carry.
    await row.update({ ...pickSourceColumns(sourceColumns), ...patch }, { transaction });

    return {
      applied: true,
      canonicalId: canonical.canonicalId,
      canonicalPublicId: canonical.canonicalPublicId,
      identityCreated: created,
      snapshotWritten,
      sourceSnapshotVersion: version,
      decision,
    };
  });
}

module.exports = {
  ingestObservation,
  SOURCE_COLUMNS,
  classifySourceAuthority,
  resolveOrCreateIdentity,
  sourceContentHash,
  ALIAS_PRIMARY,
};
