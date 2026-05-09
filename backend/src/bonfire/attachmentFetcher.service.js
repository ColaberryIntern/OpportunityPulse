// Submission Readiness Engine v0.4 — per-opp Bonfire attachment fetcher.
//
// Flow for one Bonfire opp:
//   1. Launch browser + restore session (existing scraper module).
//   2. Navigate to opp.sourceUrl (the Bonfire detail page).
//   3. Parse the Documents tab → list of {name, url}.
//   4. For each link, fetch via the authenticated context.request so the
//      session cookies travel along.
//   5. Save bytes to disk under storage/opportunities/<oppId>/<filename>.
//   6. Extract text via pdf-parse / mammoth (cached on the row).
//   7. Upsert OpportunityAttachment rows (idempotent on
//      (bonfire_opportunity_id, url_original)).
//   8. Stamp bonfire_opportunities.attachments_fetched_at.
//
// Failure modes:
//   - LOGIN_FAILED: existing scraper credentials missing/wrong.
//   - CLOUDFLARE_BLOCKED: detail page hits a CF challenge — abort, mark.
//   - NO_LINKS: the page parses but no attachment links — return empty,
//     stamp the row so we don't keep retrying.
//   - PARTIAL: some downloads fail — keep the ones that worked.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../logging/logger');
const {
  BonfireOpportunity, OpportunityAttachment, sequelize,
} = require('../models');
const { Op } = require('sequelize');

const STORAGE_ROOT = process.env.DOCUMENT_STORAGE_ROOT
  ? path.resolve(process.env.DOCUMENT_STORAGE_ROOT, '..', 'attachments')
  : path.resolve(process.cwd(), 'uploads', 'attachments');

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50 MB ceiling per file

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function buildAbsolutePath(bonfireOppId, filename) {
  const safe = String(filename).replace(/[^\w.\-() ]+/g, '_').slice(0, 240) || 'file';
  const dirRel = path.posix.join('opportunities', String(bonfireOppId));
  const fileRel = path.posix.join(dirRel, `${crypto.randomBytes(4).toString('hex')}-${safe}`);
  const dirAbs = path.join(STORAGE_ROOT, dirRel);
  const fileAbs = path.join(STORAGE_ROOT, fileRel);
  ensureDir(dirAbs);
  return { fileRel, fileAbs };
}

function inferMime(name, headerMime) {
  if (headerMime && headerMime !== 'application/octet-stream') return headerMime;
  const ext = (name.match(/\.(\w{2,6})(?:\?|$)/) || [])[1];
  if (!ext) return null;
  const map = {
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc:  'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls:  'application/vnd.ms-excel',
    txt:  'text/plain',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return map[ext.toLowerCase()] || null;
}

async function extractText(fileAbs, mime) {
  try {
    if (mime === 'application/pdf') {
      // eslint-disable-next-line global-require
      const { extractPdfText } = require('../utils/pdfText');
      const buf = fs.readFileSync(fileAbs);
      const text = await extractPdfText(buf);
      return text.replace(/\s+\n/g, '\n').trim();
    }
    if (mime && /wordprocessingml|msword/.test(mime)) {
      // eslint-disable-next-line global-require
      const mammoth = require('mammoth');
      const out = await mammoth.extractRawText({ path: fileAbs });
      return String(out.value || '').trim();
    }
    if (mime === 'text/plain') {
      return fs.readFileSync(fileAbs, 'utf8').slice(0, 200_000);
    }
  } catch (e) {
    logger.warn('attachmentFetcher: text extraction failed', { fileAbs, mime, error: e.message });
  }
  return null;
}

// Idempotent: same (bonfire_opportunity_id, url_original) replaces the row.
async function upsertAttachment({
  bonfireOpportunityId, source, name, fileRel, mime, sizeBytes, urlOriginal, parsedText, metadata,
}) {
  const existing = await OpportunityAttachment.findOne({
    where: { bonfireOpportunityId, urlOriginal },
  });
  if (existing) {
    existing.name = name;
    existing.filePath = fileRel;
    existing.mime = mime;
    existing.sizeBytes = sizeBytes;
    existing.parsedText = parsedText;
    existing.metadata = metadata || {};
    existing.downloadedAt = new Date();
    await existing.save();
    return { row: existing, action: 'updated' };
  }
  const row = await OpportunityAttachment.create({
    bonfireOpportunityId,
    source,
    name,
    filePath: fileRel,
    mime,
    sizeBytes,
    urlOriginal,
    parsedText,
    metadata: metadata || {},
    downloadedAt: new Date(),
  });
  return { row, action: 'created' };
}

// Persist the outcome of an attachment-fetch attempt on the opp row so the
// UI can show a truthful status on reload (without this, blocked-by-Cloudflare
// looks identical to "no attempt yet" once the toast disappears).
async function stampLastFetch(opp, { status, result }) {
  opp.attachmentsFetchedAt = new Date();
  const sr = opp.submissionRequirements && typeof opp.submissionRequirements === 'object'
    ? { ...opp.submissionRequirements }
    : {};
  sr.last_attachment_fetch = {
    status,                                // ok | blocked | no_links | failed
    at: new Date().toISOString(),
    found: result.attachments_found,
    saved: result.attachments_saved,
    failed: result.attachments_failed,
    blocked: !!result.blocked,
  };
  opp.submissionRequirements = sr;
  opp.changed('submissionRequirements', true);
  await opp.save();
}

async function fetchOneBonfireOpp({ bonfireOpportunityId, headless } = {}) {
  // v0.10 — default to headed mode for detail-page fetches because most agency
  // Bonfire portals run Cloudflare bot-fight-mode that headless Playwright
  // can't pass even with stealth. The container has Xvfb running on :99 from
  // the entrypoint so headed Chromium has a display to render into.
  // Call sites can still force headless via { headless: true } for tests.
  if (headless === undefined) {
    headless = process.env.BONFIRE_DETAIL_FETCHER_HEADLESS === 'true';
  }
  const opp = await BonfireOpportunity.findByPk(bonfireOpportunityId);
  if (!opp) {
    const err = new Error('Bonfire opportunity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const detailUrl = opp.sourceUrl;
  if (!detailUrl) {
    const err = new Error('Opportunity has no source_url to scrape');
    err.code = 'NO_SOURCE_URL';
    throw err;
  }

  // Lazy require so unit tests / non-scraper paths don't pay the cost.
  // eslint-disable-next-line global-require
  const { launchBrowser, createContext, jitter } = require('./scraper/browser');
  // eslint-disable-next-line global-require
  const { ensureLoggedIn } = require('./scraper/session');
  // eslint-disable-next-line global-require
  const { isChallengePage } = require('./scraper/cloudflare');
  // eslint-disable-next-line global-require
  const detailPage = require('./scraper/pages/opportunityDetail');

  const browser = await launchBrowser({ headless });
  let context;
  const result = {
    bonfire_opportunity_id: bonfireOpportunityId,
    detail_url: detailUrl,
    attachments_found: 0,
    attachments_saved: 0,
    attachments_failed: 0,
    blocked: false,
    errors: [],
  };
  try {
    context = await createContext(browser);
    await ensureLoggedIn(context);

    const page = await context.newPage();
    let links = [];
    try {
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await jitter(3000, 2000);
      if (await isChallengePage(page)) {
        result.blocked = true;
        result.errors.push({ stage: 'detail_nav', error: 'cloudflare' });
        // Stamp the row so the UI can show this on reload — without this,
        // the user sees "0 files" forever with no idea why.
        await stampLastFetch(opp, { status: 'blocked', result });
        return result;
      }
      const html = await page.content();
      links = detailPage.parseHtml(html, { baseUrl: page.url() });
    } finally {
      await page.close().catch(() => {});
    }

    result.attachments_found = links.length;
    if (links.length === 0) {
      logger.info('attachmentFetcher: no links found', { bonfireOpportunityId, detailUrl });
      // Still stamp fetched_at so we don't keep retrying empty pages.
      await stampLastFetch(opp, { status: 'no_links', result });
      return result;
    }

    // Use Playwright's authenticated context.request so session cookies
    // are sent on every download. No need for separate cookie wiring.
    for (const link of links) {
      try {
        const resp = await context.request.get(link.url, { timeout: 30000 });
        if (!resp.ok()) {
          result.attachments_failed += 1;
          result.errors.push({ stage: 'download', url: link.url, status: resp.status() });
          // eslint-disable-next-line no-continue
          continue;
        }
        const buf = await resp.body();
        if (buf.length > MAX_ATTACHMENT_BYTES) {
          result.attachments_failed += 1;
          result.errors.push({ stage: 'download', url: link.url, error: 'oversize', size: buf.length });
          // eslint-disable-next-line no-continue
          continue;
        }
        const headers = resp.headers();
        const headerMime = headers['content-type']
          ? String(headers['content-type']).split(';')[0].trim()
          : null;
        const mime = inferMime(link.name, headerMime);
        const { fileRel, fileAbs } = buildAbsolutePath(bonfireOpportunityId, link.name);
        fs.writeFileSync(fileAbs, buf);
        const parsedText = await extractText(fileAbs, mime);

        await upsertAttachment({
          bonfireOpportunityId,
          source: 'bonfire',
          name: link.name,
          fileRel,
          mime,
          sizeBytes: buf.length,
          urlOriginal: link.url,
          parsedText,
          metadata: { size_hint: link.size_hint || null, fetched_via: 'playwright_context_request' },
        });
        result.attachments_saved += 1;
      } catch (e) {
        result.attachments_failed += 1;
        result.errors.push({ stage: 'download', url: link.url, error: e.message });
        logger.warn('attachmentFetcher: download failed', { bonfireOpportunityId, url: link.url, error: e.message });
      }
    }

    await stampLastFetch(opp, {
      status: result.attachments_saved > 0 ? 'ok' : 'failed',
      result,
    });
    logger.info('attachmentFetcher: complete', {
      bonfireOpportunityId,
      found: result.attachments_found,
      saved: result.attachments_saved,
      failed: result.attachments_failed,
    });
    return result;
  } catch (e) {
    logger.error('attachmentFetcher: failed', { bonfireOpportunityId, error: e.message, stack: e.stack });
    result.errors.push({ stage: 'top', error: e.message });
    throw Object.assign(new Error('Attachment fetch failed: ' + e.message), {
      code: e.code || 'FETCH_FAILED',
      partial: result,
    });
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function listAttachments({ bonfireOpportunityId }) {
  return OpportunityAttachment.findAll({
    where: { bonfireOpportunityId },
    order: [['downloaded_at', 'DESC']],
    attributes: { exclude: ['parsedText'] }, // skip the heavy field on list
  });
}

async function getAttachmentRow({ bonfireOpportunityId, id }) {
  return OpportunityAttachment.findOne({
    where: { id, bonfireOpportunityId },
  });
}

function attachmentAbsolutePath(filePath) {
  const candidate = path.resolve(STORAGE_ROOT, filePath);
  if (!candidate.startsWith(STORAGE_ROOT + path.sep) && candidate !== STORAGE_ROOT) {
    throw new Error('Invalid file path');
  }
  return candidate;
}

module.exports = {
  fetchOneBonfireOpp,
  listAttachments,
  getAttachmentRow,
  attachmentAbsolutePath,
  upsertAttachment,
  STORAGE_ROOT,
  // exported for tests
  inferMime,
};
