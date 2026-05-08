// Storage adapter — local disk in v0.1; same interface so v2 can swap in S3.
// Files live under <DOCUMENT_STORAGE_ROOT>/<org-id>/<type>/<uuid>.<ext>
// where DOCUMENT_STORAGE_ROOT defaults to ./uploads/documents.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../logging/logger');

const ROOT = process.env.DOCUMENT_STORAGE_ROOT
  ? path.resolve(process.env.DOCUMENT_STORAGE_ROOT)
  : path.resolve(process.cwd(), 'uploads', 'documents');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// Returns a relative path (suitable for storing in DB) and an absolute
// path (suitable for fs.writeFile / streaming).
function buildPath({ organizationId, type, originalName }) {
  const ext = path.extname(originalName || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '';
  const uuid = crypto.randomUUID();
  const dirRel = path.posix.join(String(organizationId), String(type));
  const fileRel = path.posix.join(dirRel, `${uuid}${ext}`);
  const dirAbs = path.join(ROOT, dirRel);
  const fileAbs = path.join(ROOT, fileRel);
  ensureDir(dirAbs);
  return { fileRel, fileAbs };
}

async function writeBuffer({ organizationId, type, originalName, buffer }) {
  const { fileRel, fileAbs } = buildPath({ organizationId, type, originalName });
  await fs.promises.writeFile(fileAbs, buffer);
  return { filePath: fileRel, absolutePath: fileAbs, sizeBytes: buffer.length };
}

function absolutePathFor(filePath) {
  // Defensive — never let a stored file_path escape the root.
  const candidate = path.resolve(ROOT, filePath);
  if (!candidate.startsWith(ROOT + path.sep) && candidate !== ROOT) {
    throw new Error('Invalid file path');
  }
  return candidate;
}

function readStream(filePath) {
  return fs.createReadStream(absolutePathFor(filePath));
}

async function statFile(filePath) {
  return fs.promises.stat(absolutePathFor(filePath));
}

async function removeFile(filePath) {
  try {
    await fs.promises.unlink(absolutePathFor(filePath));
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    logger.warn('storage.adapter: failed to remove file', { filePath, error: e.message });
    throw e;
  }
}

module.exports = {
  ROOT,
  writeBuffer,
  readStream,
  statFile,
  removeFile,
  absolutePathFor,
};
