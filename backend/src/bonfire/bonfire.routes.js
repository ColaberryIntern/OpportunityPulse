const express = require('express');
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');
const { requireBonfireEnabled } = require('./bonfire.middleware');
const controller = require('./bonfire.controller');

const router = express.Router();

// ---- /flag is intentionally PUBLIC and NOT behind requireBonfireEnabled.
//      The frontend needs to be able to ask "is Bonfire on?" without being blocked.
router.get('/flag', controller.getFlag);

// ---- All other routes behind the feature flag.
router.use(requireBonfireEnabled);

// File upload — multer in-memory (matches resumeUpload.routes.js pattern).
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ok = ['text/csv', 'application/csv', 'application/json', 'text/plain']
      .includes(String(file.mimetype || '').toLowerCase())
      || /\.(csv|json)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Only .csv or .json files are accepted.'));
  },
});

// v0.8 — manual RFP upload accepts the actual procurement formats agencies
// post: PDF / DOCX / DOC / XLSX / XLS / TXT / CSV / ZIP / images. 50 MB cap
// per file (matches the v0.4 fetcher ceiling); up to 30 files per drop.
const rfpUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const ok = /\.(pdf|docx?|xlsx?|txt|csv|zip|png|jpe?g)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error('Only RFP-style files accepted (PDF, DOCX, XLSX, TXT, CSV, ZIP, PNG, JPG).'));
  },
});

// Route-local JSON parser with a 5 MB limit — the global express.json() is capped at 50 KB,
// which would reject bulk uploads. Mounted only on this route so the global cap still applies
// to every other endpoint in the app (security invariant).
const bulkJsonParser = express.json({ limit: '5mb' });

// ---- Reads (authenticated).
router.get('/opportunities', verifyToken, controller.listOpportunities);
router.get('/opportunities/:id', verifyToken, controller.getOpportunity);

// v0.1 Submission Readiness — per-bid checklist + bulk summaries for list pages.
router.get('/opportunities/:id/readiness', verifyToken, controller.getReadiness);
router.post('/opportunities/readiness-summaries', verifyToken, express.json({ limit: '64kb' }), controller.getReadinessSummaries);

// v0.2 AI tailoring — admin-only, runs Claude on the opp text. Body { force: true } regenerates.
router.post(
  '/opportunities/:id/tailor-requirements',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  express.json({ limit: '8kb' }),
  controller.tailorRequirements,
);

// v0.4 Attachment locker — admin-only fetch (Playwright); reads + downloads
// authenticated for any user.
router.post(
  '/opportunities/:id/fetch-attachments',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  controller.fetchAttachments,
);
router.get('/opportunities/:id/attachments', verifyToken, controller.listAttachments);
router.get('/opportunities/:id/attachments/:attachmentId/download', verifyToken, controller.downloadAttachment);

// v0.5 (Phase 4) — one-click submission package ZIP.
router.get(
  '/opportunities/:id/submission-package',
  verifyToken, checkPermissions(ROLES.ADMIN),
  controller.downloadSubmissionPackage,
);

// v0.8 — pursuit state machine. Until 'pursuing', readiness % is not computed.
router.get(
  '/opportunities/:id/pursuit',
  verifyToken,
  controller.getPursuitStatus,
);
router.post(
  '/opportunities/:id/pursue',
  verifyToken, checkPermissions(ROLES.ADMIN),
  controller.pursueBid,
);
router.post(
  '/opportunities/:id/cancel-pursuit',
  verifyToken, checkPermissions(ROLES.ADMIN),
  express.json({ limit: '4kb' }),
  controller.cancelPursuit,
);

// v0.8 — manual RFP attachment upload (Cloudflare bypass: human downloads
// from the portal, drops files here). Multi-file, multipart.
router.post(
  '/opportunities/:id/attachments',
  verifyToken, checkPermissions(ROLES.ADMIN),
  rfpUpload.array('files', 30),
  controller.uploadAttachments,
);

// v0.9 — re-classify all attachments (read_only_reference / vendor_form /
// vendor_schedule / other). Used to backfill rows uploaded before v0.9 or
// after a prompt change. Idempotent.
router.post(
  '/opportunities/:id/reclassify-attachments',
  verifyToken, checkPermissions(ROLES.ADMIN),
  controller.reclassifyAttachments,
);

// v0.10 — portal screenshot upload (vision extraction of Required Information).
// Single PNG/JPG/WEBP up to 20 MB.
const portalShotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(String(file.mimetype || '').toLowerCase())
      || /\.(png|jpe?g|webp)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Only PNG / JPG / WEBP screenshots accepted.'));
  },
});
router.post(
  '/opportunities/:id/portal-screenshot',
  verifyToken, checkPermissions(ROLES.ADMIN),
  portalShotUpload.single('screenshot'),
  controller.uploadPortalScreenshot,
);

// ---- Writes (admin-only).
router.post(
  '/upload/file',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  fileUpload.single('file'),
  controller.uploadFile,
);

router.post(
  '/upload/json',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  bulkJsonParser,
  controller.uploadJson,
);

router.post(
  '/enrich/:id',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  controller.enrichOne,
);

router.post(
  '/enrich-all',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  controller.enrichAll,
);

router.post(
  '/generate-strategy/:id',
  verifyToken,
  checkPermissions(ROLES.ADMIN),
  controller.generateStrategy,
);

// ---- Scraper subsystem (Playwright). Has its own internal flag — when the
//      scraper is disabled, /scrape/* returns 404 even though /api/bonfire is on.
router.use('/scrape', require('./scraper.routes'));

// ---- Strategic Curation Agent — runs after the scraper to produce
//      productizable opportunity strategies. Reads open to all auth'd users;
//      runs/edits are admin-only (gated inside strategic.routes.js).
router.use('/strategic', require('./strategic.routes'));

module.exports = router;
