const express = require('express');
const multer = require('multer');
const { verifyToken } = require('../middleware/auth.middleware');
const { analysisLimiter } = require('../middleware/rateLimiter.middleware');
const { uploadResume, confirmExtraction } = require('./resumeUpload.controller');

const router = express.Router();

// Configure multer for memory storage (no disk persistence)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted.'), false);
    }
  },
});

// All routes require authentication
router.use(verifyToken);

// POST /resume-upload — extract profile data from PDF (does NOT auto-save)
router.post('/', analysisLimiter, upload.single('resume'), uploadResume);

// POST /resume-upload/confirm — save the reviewed profile data
router.post('/confirm', confirmExtraction);

module.exports = router;
