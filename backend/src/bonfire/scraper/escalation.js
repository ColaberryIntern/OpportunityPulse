// Per CLAUDE.md anti-stall rule: 3 consecutive failed runs trigger an escalation
// instead of an infinite retry loop. State lives in a small JSON file inside the
// scraper's storage directory (gitignored, ephemeral).

const fs = require('fs');
const path = require('path');
const logger = require('../../logging/logger');
const { getScraperConfig } = require('./config');

const ESCALATION_THRESHOLD = 3;

function counterPath() {
  return path.join(getScraperConfig().storageDir, 'failure-count.json');
}

function readCounter() {
  const file = counterPath();
  if (!fs.existsSync(file)) return { count: 0, lastError: null };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { count: 0, lastError: null };
  }
}

function writeCounter(state) {
  fs.mkdirSync(path.dirname(counterPath()), { recursive: true });
  fs.writeFileSync(counterPath(), JSON.stringify(state, null, 2));
}

function recordSuccess() {
  writeCounter({ count: 0, lastError: null });
}

function recordFailure(reason) {
  const state = readCounter();
  const next = { count: (state.count || 0) + 1, lastError: reason || null };
  writeCounter(next);
  if (next.count >= ESCALATION_THRESHOLD) {
    writeEscalation(next);
  }
  return next;
}

function writeEscalation(state) {
  const payload = {
    subsystem: 'bonfire-scraper',
    failureCount: state.count,
    lastError: state.lastError,
    timestamp: new Date().toISOString(),
    threshold: ESCALATION_THRESHOLD,
    recommendation:
      'Investigate Bonfire login/parse failures. Check whether selectors changed, ' +
      'whether the account is locked, or whether Cloudflare has tightened. ' +
      'Manual CSV upload via /api/bonfire/upload remains as fallback.',
  };
  try {
    // Use a Windows-friendly path for the escalation file: prefer /tmp on Linux,
    // ${storageDir}/escalation.json on Windows.
    const tmpPath = process.platform === 'win32'
      ? path.join(getScraperConfig().storageDir, 'escalation.json')
      : '/tmp/escalation.json';
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
    logger.error('Bonfire scraper escalation written', { file: tmpPath, ...payload });
  } catch (e) {
    logger.error('Failed to write escalation file', { error: e.message });
  }
}

module.exports = {
  recordSuccess,
  recordFailure,
  readCounter,
  ESCALATION_THRESHOLD,
};
