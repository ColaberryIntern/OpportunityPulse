#!/usr/bin/env node
'use strict';

/**
 * validate_env.js — Governance script: Environment Variable Validation
 *
 * Validates that all required environment variables are present and
 * conform to security/configuration constraints.
 *
 * Exit code 0 = pass, 1 = fail (any error).
 * Outputs JSON to stdout.
 */

const path = require('path');

// Load .env from project root (two levels up from execution/scripts/)
const projectRoot = path.resolve(__dirname, '..', '..');
const dotenvPath = path.join(projectRoot, 'backend', '.env');

// Attempt to load dotenv if available; not a hard requirement
try {
  require('dotenv').config({ path: dotenvPath });
} catch (_) {
  // dotenv may not be installed globally; env vars may already be set
}

// Also try project-root .env
try {
  require('dotenv').config({ path: path.join(projectRoot, '.env') });
} catch (_) {
  // ignore
}

const REQUIRED_VARS = [
  'NODE_ENV',
  'PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET',
  'BCRYPT_ROUNDS',
];

function validate() {
  const errors = [];
  const warnings = [];

  // ---- Check all required vars are present ----
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    errors.push(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // ---- JWT_SECRET length check ----
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret) {
    if (jwtSecret.length < 32) {
      errors.push(
        `JWT_SECRET must be at least 32 characters long (current length: ${jwtSecret.length})`
      );
    }

    // Warn if JWT_SECRET contains weak patterns in production
    if (process.env.NODE_ENV === 'production') {
      const lower = jwtSecret.toLowerCase();
      if (lower.includes('dev') || lower.includes('change')) {
        warnings.push(
          'JWT_SECRET contains "dev" or "change" — this looks like a placeholder. ' +
          'Use a strong, random secret in production.'
        );
      }
    }
  }

  // ---- BCRYPT_ROUNDS range check ----
  const bcryptRaw = process.env.BCRYPT_ROUNDS;
  if (bcryptRaw) {
    const rounds = parseInt(bcryptRaw, 10);
    if (isNaN(rounds)) {
      errors.push(`BCRYPT_ROUNDS must be numeric (got: "${bcryptRaw}")`);
    } else if (rounds < 10 || rounds > 14) {
      errors.push(
        `BCRYPT_ROUNDS must be between 10 and 14 inclusive (got: ${rounds})`
      );
    }
  }

  // ---- DB_PORT is numeric ----
  const dbPort = process.env.DB_PORT;
  if (dbPort) {
    const parsed = parseInt(dbPort, 10);
    if (isNaN(parsed) || String(parsed) !== dbPort.trim()) {
      errors.push(`DB_PORT must be a numeric value (got: "${dbPort}")`);
    }
  }

  // ---- PORT is numeric ----
  const port = process.env.PORT;
  if (port) {
    const parsed = parseInt(port, 10);
    if (isNaN(parsed) || String(parsed) !== port.trim()) {
      errors.push(`PORT must be a numeric value (got: "${port}")`);
    }
  }

  const valid = errors.length === 0;

  const result = {
    valid,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };

  return result;
}

// ---- Main ----
const result = validate();

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.valid ? 0 : 1);
