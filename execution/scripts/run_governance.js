#!/usr/bin/env node
'use strict';

/**
 * run_governance.js — Governance Orchestrator
 *
 * Runs governance validation scripts in sequence and produces a combined report.
 *
 * By default runs: validate_env.js, validate_security.js
 * With --with-schema flag: also runs validate_schema.js
 *
 * Writes combined report to execution/reports/governance-report.json
 * Also outputs combined JSON to stdout.
 *
 * Exit code 0 = all pass, 1 = any fail.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Project root is two levels up from execution/scripts/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS_DIR = __dirname;
const REPORTS_DIR = path.join(PROJECT_ROOT, 'execution', 'reports');

// Parse flags
const args = process.argv.slice(2);
const withSchema = args.includes('--with-schema');

/**
 * Run a governance script and capture its JSON output.
 * Returns { success: bool, data: object }
 */
function runScript(scriptName) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const nodeBin = process.execPath; // Use the same Node binary

  try {
    const stdout = execSync(`"${nodeBin}" "${scriptPath}"`, {
      encoding: 'utf8',
      env: { ...process.env },
      timeout: 30000, // 30 second timeout
      stdio: ['pipe', 'pipe', 'pipe'], // capture stdout and stderr
    });

    try {
      const data = JSON.parse(stdout.trim());
      return { success: true, data };
    } catch (parseErr) {
      return {
        success: false,
        data: {
          error: `Script "${scriptName}" produced non-JSON output: ${stdout.substring(0, 500)}`,
          timestamp: new Date().toISOString(),
        },
      };
    }
  } catch (execErr) {
    // execSync throws on non-zero exit code — capture stdout anyway
    const stdout = execErr.stdout ? execErr.stdout.toString() : '';
    const stderr = execErr.stderr ? execErr.stderr.toString() : '';

    try {
      const data = JSON.parse(stdout.trim());
      return { success: false, data };
    } catch (_) {
      return {
        success: false,
        data: {
          error: `Script "${scriptName}" failed: ${stderr || execErr.message}`.substring(0, 1000),
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}

function main() {
  const timestamp = new Date().toISOString();

  // ---- Run validate_env.js ----
  process.stderr.write('[governance] Running validate_env.js ...\n');
  const envResult = runScript('validate_env.js');

  // ---- Run validate_security.js ----
  process.stderr.write('[governance] Running validate_security.js ...\n');
  const securityResult = runScript('validate_security.js');

  // ---- Conditionally run validate_schema.js ----
  let schemaResult = null;
  if (withSchema) {
    process.stderr.write('[governance] Running validate_schema.js ...\n');
    schemaResult = runScript('validate_schema.js');
  } else {
    process.stderr.write('[governance] Skipping validate_schema.js (use --with-schema to include)\n');
  }

  // ---- Determine overall pass/fail ----
  const envPass = envResult.success;
  const securityPass = securityResult.success;
  const schemaPass = schemaResult === null ? true : schemaResult.success;
  const overall = envPass && securityPass && schemaPass;

  const report = {
    timestamp,
    overall,
    results: {
      env: envResult.data,
      security: securityResult.data,
      schema: schemaResult ? schemaResult.data : null,
    },
  };

  // ---- Write report to file ----
  try {
    if (!fs.existsSync(REPORTS_DIR)) {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
    const reportPath = path.join(REPORTS_DIR, 'governance-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    process.stderr.write(`[governance] Report written to ${path.relative(PROJECT_ROOT, reportPath).replace(/\\/g, '/')}\n`);
  } catch (writeErr) {
    process.stderr.write(`[governance] WARNING: Could not write report file: ${writeErr.message}\n`);
  }

  // ---- Output combined JSON to stdout ----
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');

  // ---- Summary to stderr ----
  process.stderr.write('\n[governance] === Summary ===\n');
  process.stderr.write(`  Environment:  ${envPass ? 'PASS' : 'FAIL'}\n`);
  process.stderr.write(`  Security:     ${securityPass ? 'PASS' : 'FAIL'}\n`);
  if (schemaResult !== null) {
    process.stderr.write(`  Schema:       ${schemaPass ? 'PASS' : 'FAIL'}\n`);
  } else {
    process.stderr.write(`  Schema:       SKIPPED\n`);
  }
  process.stderr.write(`  Overall:      ${overall ? 'PASS' : 'FAIL'}\n`);
  process.stderr.write('[governance] ================\n');

  process.exit(overall ? 0 : 1);
}

main();
