// v9.10: on-demand source health auto-triage trigger.
// POST /api/v1/admin/source-health-agent/run
//
// Body (optional):
//   { retry: false }   — skip the per-source retry pass (just snapshot + classify)
//   { email: false }   — don't send the email even if there's something to report
//
// Returns the full report so the page can render it inline. Email
// dispatch is best-effort and reported separately.

const logger = require('../logging/logger');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const agent = require('./sourceHealthAgent.service');

async function runSourceHealthAgent(req, res) {
  try {
    const retry = req.body && req.body.retry === false ? false : true;
    const sendEmailFlag = req.body && req.body.email === false ? false : true;
    const report = await agent.runAgent({ retry });
    let email = { sent: false, reason: 'skipped' };
    if (sendEmailFlag) {
      email = await agent.emailReport(report);
    }
    return successResponse(res, { report, email });
  } catch (e) {
    logger.error('admin.runSourceHealthAgent failed', { error: e.message, stack: e.stack });
    return errorResponse(res, 'Auto-triage failed: ' + e.message, 500);
  }
}

module.exports = { runSourceHealthAgent };
