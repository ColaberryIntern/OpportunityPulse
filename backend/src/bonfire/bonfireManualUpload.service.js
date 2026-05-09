// Submission Readiness Engine v0.8 — manual RFP attachment upload.
//
// The Cloudflare-bypass: a human opens the Bonfire portal, downloads
// every file from the Documents tab, and drops them into our drop-zone
// here. We extract text, persist to opportunity_attachments with
// source='manual', and stamp last_attachment_fetch on the opp so the
// readiness panel can move from "pursuing-no-attachments" → "attachments-only".
//
// Reuses the same storage layout + extraction layer as the v0.4
// Playwright fetcher; only the source-of-bytes differs.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../logging/logger');
const { BonfireOpportunity, OpportunityAttachment } = require('../models');
const classifier = require('./attachmentClassifier.service');

const STORAGE_ROOT = process.env.DOCUMENT_STORAGE_ROOT
  ? path.resolve(process.env.DOCUMENT_STORAGE_ROOT, '..', 'attachments')
  : path.resolve(process.cwd(), 'uploads', 'attachments');

const MAX_BYTES_PER_FILE = 50 * 1024 * 1024; // 50 MB

const MIME_FROM_EXT = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
  txt:  'text/plain',
  csv:  'text/csv',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  zip:  'application/zip',
};

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function safeFilename(name) {
  const safe = String(name).replace(/[^\w.\-() ]+/g, '_').slice(0, 240) || 'file';
  return safe;
}

function inferMimeFromName(name, headerMime) {
  if (headerMime && headerMime !== 'application/octet-stream') return headerMime;
  const m = (name || '').match(/\.(\w{2,6})(?:\?|$)/);
  if (!m) return null;
  return MIME_FROM_EXT[m[1].toLowerCase()] || null;
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
    if (mime && (mime.startsWith('text/') || mime === 'text/csv')) {
      return fs.readFileSync(fileAbs, 'utf8').slice(0, 200_000).trim();
    }
  } catch (e) {
    logger.warn('manualUpload: text extraction failed', { fileAbs, mime, error: e.message });
  }
  return null;
}

// v0.9 — when the user drops a .zip on the upload zone (which is what
// Bonfire portals hand out for whole RFPs), we transparently expand it
// into one attachment row per inner file. Otherwise the ZIP would land
// as a single opaque blob and downstream extraction / classification
// would never see the actual RFP / SOW / forms.
async function expandZips(files) {
  // eslint-disable-next-line global-require
  const JSZip = require('jszip');
  const expanded = [];
  for (const f of files) {
    const isZip = /\.zip$/i.test(f.originalname || '') ||
      f.mimetype === 'application/zip' ||
      f.mimetype === 'application/x-zip-compressed';
    if (!isZip || !Buffer.isBuffer(f.buffer)) {
      expanded.push(f);
      continue; // eslint-disable-line no-continue
    }
    try {
      const zip = await JSZip.loadAsync(f.buffer);
      let count = 0;
      for (const [innerName, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue; // eslint-disable-line no-continue
        if (innerName.startsWith('__MACOSX')) continue; // eslint-disable-line no-continue
        const innerBuf = await entry.async('nodebuffer');
        // Use only the file's basename — Bonfire ZIPs typically don't have
        // nested directories, but guard against it anyway.
        const baseName = path.posix.basename(innerName);
        if (!baseName) continue; // eslint-disable-line no-continue
        expanded.push({
          originalname: baseName,
          buffer: innerBuf,
          mimetype: null,
          // Track provenance so the UI / manifest can show "extracted from <zip>".
          fromZip: f.originalname,
        });
        count += 1;
      }
      logger.info('manualUpload: expanded zip', { zipName: f.originalname, count });
    } catch (e) {
      // ZIP wouldn't open — fall back to treating it as a regular file.
      logger.warn('manualUpload: zip expand failed, keeping as opaque', {
        zipName: f.originalname, error: e.message,
      });
      expanded.push(f);
    }
  }
  return expanded;
}

async function ingestFiles({ bonfireOpportunityId, files, uploadedBy = null }) {
  const opp = await BonfireOpportunity.findByPk(bonfireOpportunityId);
  if (!opp) {
    const err = new Error('Bonfire opportunity not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // v0.9 — expand any ZIPs on the way in.
  const flatFiles = await expandZips(files);

  const dirRel = path.posix.join('opportunities', String(bonfireOpportunityId));
  const dirAbs = path.join(STORAGE_ROOT, dirRel);
  ensureDir(dirAbs);

  const result = {
    bonfire_opportunity_id: bonfireOpportunityId,
    received: flatFiles.length,
    received_raw: files.length,
    expanded_from_zip: flatFiles.length - files.length,
    saved: 0,
    failed: 0,
    skipped: 0,
    files: [],
  };

  for (const f of flatFiles) {
    const originalName = f.originalname || f.filename || 'upload';
    const buf = f.buffer;
    if (!buf || !Buffer.isBuffer(buf)) {
      result.failed += 1;
      result.files.push({ name: originalName, status: 'failed', reason: 'no_buffer' });
      continue; // eslint-disable-line no-continue
    }
    if (buf.length > MAX_BYTES_PER_FILE) {
      result.failed += 1;
      result.files.push({ name: originalName, status: 'failed', reason: 'oversize', size: buf.length });
      continue; // eslint-disable-line no-continue
    }

    const safe = safeFilename(originalName);
    const fileRel = path.posix.join(dirRel, `${crypto.randomBytes(4).toString('hex')}-${safe}`);
    const fileAbs = path.join(STORAGE_ROOT, fileRel);
    try {
      fs.writeFileSync(fileAbs, buf);
    } catch (e) {
      result.failed += 1;
      result.files.push({ name: originalName, status: 'failed', reason: 'fs_write_error', error: e.message });
      continue; // eslint-disable-line no-continue
    }
    const mime = inferMimeFromName(originalName, f.mimetype);
    const parsedText = await extractText(fileAbs, mime);

    // Idempotency: dedupe by (bonfire_opportunity_id, name) for manual uploads
    // since they don't carry a stable url_original. Re-uploading the same
    // filename replaces the stored bytes + parsed text.
    const existing = await OpportunityAttachment.findOne({
      where: {
        bonfireOpportunityId,
        source: 'manual',
        name: safe,
      },
    });
    if (existing) {
      // Best-effort cleanup of the prior bytes.
      try {
        const priorAbs = path.join(STORAGE_ROOT, existing.filePath);
        if (fs.existsSync(priorAbs) && priorAbs !== fileAbs) fs.unlinkSync(priorAbs);
      } catch (e) {
        logger.warn('manualUpload: prior file cleanup failed', { fileAbs, error: e.message });
      }
      existing.filePath = fileRel;
      existing.mime = mime;
      existing.sizeBytes = buf.length;
      existing.parsedText = parsedText;
      existing.metadata = {
        ...(existing.metadata || {}),
        uploaded_by: uploadedBy,
        uploaded_via: 'manual_drop_zone',
        ...(f.fromZip ? { extracted_from_zip: f.fromZip } : {}),
      };
      existing.downloadedAt = new Date();
      await existing.save();
      // v0.9 — auto-classify on (re-)upload so the panel shows the right
      // chip + Phase B form-filler has the field list ready.
      const cls = await classifier.classifyOne({ attachmentId: existing.id })
        .catch((e) => { logger.warn('classifier: failed for ' + existing.id + ': ' + e.message); return null; });
      result.files.push({
        id: existing.id, name: safe, status: 'updated',
        has_parsed_text: !!parsedText,
        classification: cls?.classification || null,
      });
    } else {
      // eslint-disable-next-line no-unused-vars -- block scope; row used below
      const row = await OpportunityAttachment.create({
        bonfireOpportunityId,
        source: 'manual',
        name: safe,
        filePath: fileRel,
        mime,
        sizeBytes: buf.length,
        urlOriginal: null,
        parsedText,
        metadata: {
          uploaded_by: uploadedBy,
          uploaded_via: 'manual_drop_zone',
          ...(f.fromZip ? { extracted_from_zip: f.fromZip } : {}),
        },
        downloadedAt: new Date(),
      });
      const cls = await classifier.classifyOne({ attachmentId: row.id })
        .catch((e) => { logger.warn('classifier: failed for ' + row.id + ': ' + e.message); return null; });
      result.files.push({
        id: row.id, name: safe, status: 'created',
        has_parsed_text: !!parsedText,
        classification: cls?.classification || null,
      });
    }
    result.saved += 1;
  }

  // Stamp the opp so the readiness panel knows attachments are present.
  // If a prior Cloudflare-blocked attempt is on record, the manual upload
  // overrides the status (we now have the bytes).
  opp.attachmentsFetchedAt = new Date();
  const sr = opp.submissionRequirements && typeof opp.submissionRequirements === 'object'
    ? { ...opp.submissionRequirements }
    : {};
  sr.last_attachment_fetch = {
    status: result.saved > 0 ? 'manual_upload' : (sr.last_attachment_fetch?.status || 'none'),
    at: new Date().toISOString(),
    found: result.received,
    saved: result.saved,
    failed: result.failed,
    blocked: false,
    via: 'manual',
  };
  opp.submissionRequirements = sr;
  opp.changed('submissionRequirements', true);
  await opp.save();

  logger.info('manualUpload: complete', {
    bonfireOpportunityId, received: result.received, saved: result.saved, failed: result.failed,
  });

  return result;
}

module.exports = {
  ingestFiles,
};
