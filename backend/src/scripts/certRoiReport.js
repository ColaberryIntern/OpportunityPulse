#!/usr/bin/env node
/**
 * Cert-ROI report (Strategic Expansion Plan §4, P0).
 *
 * Reads OP's existing deep-vet verdicts and answers: which certifications /
 * set-aside registrations block the most winnable pipeline dollars? Turns cert
 * acquisition into an ROI decision ("getting TX-RAMP unblocks $X across N bids").
 *
 * READ-ONLY. No writes, no external calls. Safe to re-run.
 *
 * Run (local dev DB):   node src/scripts/certRoiReport.js
 * Run (prod container):  docker exec op-backend node src/scripts/certRoiReport.js
 * JSON output:           node src/scripts/certRoiReport.js --json
 */

const { Op } = require('sequelize');
const { sequelize, BonfireOpportunity, Opportunity } = require('../models');
const { aggregateCertRoi } = require('./lib/certRoi');

const GOV_TYPES = ['gov_contract', 'grant', 'research'];

function usd(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

async function loadRows() {
  const rows = [];

  // 1. Bonfire (state/local) — verdict on the column, value in cents.
  const bonfire = await BonfireOpportunity.findAll({
    where: { vetVerdict: { [Op.ne]: null } },
    attributes: ['id', 'title', 'estimatedValue', 'vetVerdict'],
    raw: true,
  });
  for (const b of bonfire) {
    rows.push({
      id: b.id,
      title: b.title,
      valueUsd: b.estimatedValue != null ? Number(b.estimatedValue) / 100 : null,
      source: 'bonfire',
      verdict: b.vetVerdict,
    });
  }

  // 2. Federal / grant (SAM, SBIR, grants) — verdict nested in ai_analysis, value in dollars.
  const gov = await Opportunity.findAll({
    where: { type: { [Op.in]: GOV_TYPES } },
    attributes: ['id', 'title', 'value', 'source', 'aiAnalysis'],
    raw: true,
  });
  for (const g of gov) {
    const verdict = g.aiAnalysis && g.aiAnalysis.vetVerdict;
    if (!verdict) continue;
    rows.push({
      id: g.id,
      title: g.title,
      valueUsd: g.value != null ? Number(g.value) : null,
      source: g.source || 'gov',
      verdict,
    });
  }

  return rows;
}

function printReport(result, rowCount) {
  const { credentials, disqualifiers, totals } = result;
  const line = '='.repeat(72);

  console.log(`\n${line}`);
  console.log('  CERT-ROI REPORT — winnable pipeline blocked by acquirable credentials');
  console.log(`  ${new Date().toISOString().slice(0, 10)}  ·  ${rowCount} vetted opportunities scanned`);
  console.log(line);

  console.log(`\n  Total blocked pipeline:              ${usd(totals.totalBlockedValueUsd)}  (${totals.totalBlockedCount} opps)`);
  console.log(`  Credential-addressable (all):       ${usd(totals.credentialAddressableValueUsd)}  (${totals.credentialAddressableCount} opps)`);
  console.log(`  Credential-addressable (VERIFIED):  ${usd(totals.credentialAddressableVerifiedValueUsd)}  (${totals.credentialAddressableVerifiedCount} opps)`);
  console.log('  ^ VERIFIED = confirmed by reading the actual RFP docs (the honest ROI number).');
  console.log('    "all" includes cheap pre-download agency-name heuristics — discount these.\n');

  console.log('  ── Dollars unblocked per credential (ranked by VERIFIED $) ─────────');
  if (!credentials.length) {
    console.log('    (none — no cert/set-aside-gated opportunities found)');
  } else {
    console.log('    ' + 'CREDENTIAL'.padEnd(34) + 'VERIFIED $'.padStart(15) + 'TOTAL $'.padStart(15) + 'OPPS'.padStart(7));
    for (const c of credentials) {
      console.log('    ' + c.cert.padEnd(34) + usd(c.verifiedValueUsd).padStart(15) + usd(c.blockedValueUsd).padStart(15) + `${c.verifiedCount}/${c.count}`.padStart(7));
    }
  }

  console.log('\n  ── Full disqualifier breakdown (context; not all cert-fixable) ──────');
  console.log('    ' + 'DISQUALIFIER'.padEnd(26) + 'BLOCKED $'.padStart(16) + 'OPPS'.padStart(7));
  for (const d of disqualifiers) {
    console.log('    ' + String(d.disqualifier).padEnd(26) + usd(d.blockedValueUsd).padStart(16) + String(d.count).padStart(7));
  }

  // Top blocked opps for the top 3 credentials, so the $ is auditable.
  const top = credentials.slice(0, 3);
  if (top.length) {
    console.log('\n  ── Top blocked opportunities per leading credential ────────────────');
    for (const c of top) {
      console.log(`\n    ▸ ${c.cert} — VERIFIED ${usd(c.verifiedValueUsd)} (${c.verifiedCount} opps) · total ${usd(c.blockedValueUsd)} (${c.count})`);
      for (const o of c.opps.slice(0, 5)) {
        const tag = o.verified ? '✓verified' : '~heuristic';
        console.log(`        ${usd(o.valueUsd).padStart(14)}  ${tag.padEnd(10)} [${o.status}]  ${String(o.title).slice(0, 54)}`);
        if (o.evidence) console.log(`                        ↳ "${o.evidence.slice(0, 90)}"`);
      }
    }
  }
  console.log(`\n${line}\n`);
}

(async () => {
  const asJson = process.argv.includes('--json');
  const rows = await loadRows();
  const result = aggregateCertRoi(rows);
  if (asJson) {
    console.log(JSON.stringify({ scanned: rows.length, ...result }, null, 2));
  } else {
    printReport(result, rows.length);
  }
  await sequelize.close();
})().catch(async (e) => {
  console.error('certRoiReport FAILED:', e.message);
  try { await sequelize.close(); } catch (_) { /* noop */ }
  process.exit(1);
});
