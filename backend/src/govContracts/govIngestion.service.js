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
const { buildObservationPatch } = require('../bonfire/deadlineEvidence.service');
const { canonicalIdFor } = require('./govOpportunityV1.mapper');

const ALIAS_PRIMARY = 'bonfire_opportunity_id';

/**
 * Hash over SOURCE facts only.
 *
 * Deliberately excludes every enrichment field. If scores or AI categories fed
 * this, re-running enrichment would advance a *source* version and claim the
 * buyer changed something they did not.
 */
function sourceContentHash(sourceFacts) {
  const canonical = {
    deadlineText: sourceFacts.deadlineText ?? null,
    absentConfirmed: sourceFacts.absentConfirmed === true,
    title: sourceFacts.title ?? null,
    agency: sourceFacts.agency ?? null,
    sourceUrl: sourceFacts.sourceUrl ?? null,
    externalId: sourceFacts.externalId ?? null,
  };
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
    // eslint-disable-next-line no-await-in-loop
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
    // eslint-disable-next-line no-await-in-loop
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
      const contentHash = sourceContentHash(sourceFacts);
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
    await row.update(patch, { transaction });

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
  resolveOrCreateIdentity,
  sourceContentHash,
  ALIAS_PRIMARY,
};
