// Submission Readiness Engine v0.1 — document routes (admin-only).

const express = require('express');
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkPermissions } = require('../middleware/rbac.middleware');
const { ROLES } = require('../config/constants');
const controller = require('./document.controller');

const router = express.Router();

// Multer keeps the file in memory; storage.adapter writes it to disk
// after type-validation in the controller. 25MB cap is sized for the
// kinds of documents we store (capability statements, COIs, past-perf
// PDFs); large RFP attachments live in a different table later.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png', 'image/jpeg', 'image/jpg',
      'text/plain']
      .includes(String(file.mimetype || '').toLowerCase())
      || /\.(pdf|docx|doc|png|jpg|jpeg|txt)$/i.test(file.originalname || '');
    if (ok) cb(null, true);
    else cb(new Error('Allowed: PDF, DOCX, DOC, PNG, JPG, TXT'));
  },
});

router.use(verifyToken, checkPermissions(ROLES.ADMIN));

router.get('/types',                  controller.listTypes);
router.get('/types/generatable',      controller.listGeneratableTypes);
router.get('/',                       controller.listDocuments);
router.post('/',                      upload.single('file'), controller.uploadDocument);
router.post('/generate',              express.json({ limit: '8kb' }), controller.generateDocumentHandler);
router.get('/:id/download',           controller.downloadDocument);
router.delete('/:id',                 controller.deleteDocument);

module.exports = router;
