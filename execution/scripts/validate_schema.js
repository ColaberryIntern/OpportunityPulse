#!/usr/bin/env node
'use strict';

/**
 * validate_schema.js — Governance script: Database Schema Validation
 *
 * Connects to the PostgreSQL database using Sequelize and verifies that
 * all expected tables are present. Reports missing and extra tables.
 *
 * Exit code 0 = all expected tables present, 1 = any missing or connection failure.
 * Outputs JSON to stdout.
 */

const path = require('path');

// Resolve project root (two levels up from execution/scripts/)
const projectRoot = path.resolve(__dirname, '..', '..');

// Load .env files
try {
  require('dotenv').config({ path: path.join(projectRoot, 'backend', '.env') });
} catch (_) { /* ignore */ }
try {
  require('dotenv').config({ path: path.join(projectRoot, '.env') });
} catch (_) { /* ignore */ }

// Require Sequelize from the backend's node_modules
let Sequelize;
try {
  Sequelize = require(path.join(projectRoot, 'backend', 'node_modules', 'sequelize'));
} catch (err) {
  // Fallback: try global/local resolution
  try {
    Sequelize = require('sequelize');
  } catch (err2) {
    const result = {
      valid: false,
      expectedTables: [],
      actualTables: [],
      missing: [],
      extra: [],
      error: 'Could not load Sequelize. Ensure backend dependencies are installed (npm install in backend/).',
      timestamp: new Date().toISOString(),
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }
}

const EXPECTED_TABLES = [
  'users',
  'user_roles',
  'content',
  'dashboards',
  'subscriptions',
  'user_activities',
  'feedback',
  'data_sources',
  'opportunities',
  'ingestion_logs',
  'alerts',
  'analysis_runs',
  'alert_preferences',
  'forum_posts',
  'comments',
];

async function validate() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT, 10) || 5432;
  const database = process.env.DB_NAME;
  const username = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!database || !username) {
    return {
      valid: false,
      expectedTables: EXPECTED_TABLES,
      actualTables: [],
      missing: EXPECTED_TABLES.slice(),
      extra: [],
      error: 'DB_NAME and DB_USER environment variables are required for schema validation.',
      timestamp: new Date().toISOString(),
    };
  }

  let sequelize;
  try {
    sequelize = new Sequelize(database, username, password, {
      host,
      port,
      dialect: 'postgres',
      logging: false,
      dialectOptions: process.env.DB_SSL === 'true'
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
      pool: { min: 1, max: 3, acquire: 10000, idle: 5000 },
    });

    // Test connection
    await sequelize.authenticate();
  } catch (connErr) {
    const result = {
      valid: false,
      expectedTables: EXPECTED_TABLES,
      actualTables: [],
      missing: EXPECTED_TABLES.slice(),
      extra: [],
      error: `Database connection failed: ${connErr.message}`,
      timestamp: new Date().toISOString(),
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
    return; // unreachable but explicit
  }

  try {
    const queryInterface = sequelize.getQueryInterface();
    const rawTables = await queryInterface.showAllTables();

    // Normalize to lowercase for comparison
    const actualTables = rawTables.map((t) => t.toLowerCase()).sort();
    const expectedSet = new Set(EXPECTED_TABLES.map((t) => t.toLowerCase()));
    const actualSet = new Set(actualTables);

    const missing = EXPECTED_TABLES.filter((t) => !actualSet.has(t.toLowerCase()));
    const extra = actualTables.filter((t) => !expectedSet.has(t));

    const valid = missing.length === 0;

    return {
      valid,
      expectedTables: EXPECTED_TABLES.sort(),
      actualTables,
      missing,
      extra,
      timestamp: new Date().toISOString(),
    };
  } catch (queryErr) {
    return {
      valid: false,
      expectedTables: EXPECTED_TABLES,
      actualTables: [],
      missing: EXPECTED_TABLES.slice(),
      extra: [],
      error: `Schema query failed: ${queryErr.message}`,
      timestamp: new Date().toISOString(),
    };
  } finally {
    try {
      await sequelize.close();
    } catch (_) { /* ignore close errors */ }
  }
}

// ---- Main ----
(async () => {
  try {
    const result = await validate();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.valid ? 0 : 1);
  } catch (err) {
    const result = {
      valid: false,
      expectedTables: EXPECTED_TABLES,
      actualTables: [],
      missing: EXPECTED_TABLES.slice(),
      extra: [],
      error: `Unexpected error: ${err.message}`,
      timestamp: new Date().toISOString(),
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(1);
  }
})();
