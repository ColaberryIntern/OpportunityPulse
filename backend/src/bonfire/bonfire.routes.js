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

// Route-local JSON parser with a 5 MB limit — the global express.json() is capped at 50 KB,
// which would reject bulk uploads. Mounted only on this route so the global cap still applies
// to every other endpoint in the app (security invariant).
const bulkJsonParser = express.json({ limit: '5mb' });

// ---- Reads (authenticated).
router.get('/opportunities', verifyToken, controller.listOpportunities);
router.get('/opportunities/:id', verifyToken, controller.getOpportunity);

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
