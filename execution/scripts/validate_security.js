#!/usr/bin/env node
'use strict';

/**
 * validate_security.js — Governance script: Static Security Analysis
 *
 * Performs a lightweight static analysis scan of the codebase:
 *   1. Scans for hardcoded secrets in .js/.jsx source files
 *   2. Checks .gitignore includes .env
 *   3. Verifies helmet() is used in server.js
 *   4. Verifies CORS is not configured with wildcard origin
 *   5. Checks all route files (except public.routes.js) use verifyToken
 *
 * Exit code 0 = no critical findings, 1 = critical findings present.
 * Outputs JSON to stdout.
 */

const fs = require('fs');
const path = require('path');

// Project root is two levels up from execution/scripts/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const findings = [];

// ============================================================
// Helpers
// ============================================================

/**
 * Recursively collect files matching given extensions from a directory.
 */
function collectFiles(dir, extensions) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .git, build, dist, coverage
      if (['node_modules', '.git', 'build', 'dist', 'coverage'].includes(entry.name)) continue;
      results.push(...collectFiles(fullPath, extensions));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Return path relative to PROJECT_ROOT for display.
 */
function relPath(absPath) {
  return path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');
}

/**
 * Check if a file path should be excluded from the secret scan.
 * Excludes: test files, .env.example, environment.js config files.
 */
function isExcludedFromSecretScan(filePath) {
  const rel = relPath(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();

  // Exclude test files
  if (
    rel.includes('__tests__') ||
    rel.includes('.test.') ||
    rel.includes('.spec.') ||
    rel.includes('test/') ||
    rel.includes('tests/')
  ) {
    return true;
  }

  // Exclude .env.example
  if (basename === '.env.example') return true;

  // Exclude environment config files (these legitimately reference process.env)
  if (basename === 'environment.js') return true;

  return false;
}

// ============================================================
// Check 1: Hardcoded Secrets Scan
// ============================================================

function checkHardcodedSecrets() {
  let clean = true;

  const secretPatterns = [
    { regex: /password\s*=\s*['"]/i, label: 'hardcoded password' },
    { regex: /secret\s*=\s*['"]/i, label: 'hardcoded secret' },
    { regex: /apikey\s*=\s*['"]/i, label: 'hardcoded API key' },
  ];

  const dirs = [
    path.join(PROJECT_ROOT, 'backend', 'src'),
    path.join(PROJECT_ROOT, 'frontend', 'src'),
  ];

  for (const dir of dirs) {
    const files = collectFiles(dir, ['.js', '.jsx']);
    for (const filePath of files) {
      if (isExcludedFromSecretScan(filePath)) continue;

      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (_) {
        continue;
      }

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip lines that are process.env references — those are safe
        if (/process\.env\b/.test(line)) continue;

        for (const pattern of secretPatterns) {
          if (pattern.regex.test(line)) {
            clean = false;
            findings.push({
              severity: 'critical',
              file: relPath(filePath),
              line: i + 1,
              description: `Potential ${pattern.label} found: ${line.trim().substring(0, 120)}`,
            });
          }
        }
      }
    }
  }

  return clean;
}

// ============================================================
// Check 2: .gitignore includes .env
// ============================================================

function checkGitignore() {
  const gitignorePath = path.join(PROJECT_ROOT, '.gitignore');

  if (!fs.existsSync(gitignorePath)) {
    findings.push({
      severity: 'critical',
      file: '.gitignore',
      line: 0,
      description: '.gitignore file not found. Secrets may be committed to version control.',
    });
    return false;
  }

  const content = fs.readFileSync(gitignorePath, 'utf8');
  const lines = content.split('\n').map((l) => l.trim());

  // Check if any line is exactly ".env" or starts with ".env" (covers .env, .env.local, etc.)
  const hasEnv = lines.some((line) => line === '.env' || line === '.env*');

  if (!hasEnv) {
    findings.push({
      severity: 'critical',
      file: '.gitignore',
      line: 0,
      description: '.gitignore does not include ".env". Environment files with secrets may be committed.',
    });
    return false;
  }

  return true;
}

// ============================================================
// Check 3: Helmet usage in server.js
// ============================================================

function checkHelmet() {
  const serverPath = path.join(PROJECT_ROOT, 'backend', 'src', 'server.js');

  if (!fs.existsSync(serverPath)) {
    findings.push({
      severity: 'critical',
      file: 'backend/src/server.js',
      line: 0,
      description: 'server.js not found. Cannot verify helmet() usage.',
    });
    return false;
  }

  const content = fs.readFileSync(serverPath, 'utf8');

  if (!/helmet\s*\(/.test(content)) {
    findings.push({
      severity: 'critical',
      file: 'backend/src/server.js',
      line: 0,
      description: 'helmet() middleware not found in server.js. HTTP security headers are missing.',
    });
    return false;
  }

  return true;
}

// ============================================================
// Check 4: CORS not configured with wildcard origin
// ============================================================

function checkCors() {
  const serverPath = path.join(PROJECT_ROOT, 'backend', 'src', 'server.js');

  if (!fs.existsSync(serverPath)) {
    // Already reported in helmet check
    return false;
  }

  const content = fs.readFileSync(serverPath, 'utf8');

  // Check for origin: '*' or origin: "*"
  if (/origin\s*:\s*['"`]\*['"`]/.test(content)) {
    findings.push({
      severity: 'critical',
      file: 'backend/src/server.js',
      line: 0,
      description: 'CORS is configured with origin: "*" (wildcard). This allows any domain to make requests.',
    });
    return false;
  }

  return true;
}

// ============================================================
// Check 5: All route files use verifyToken (except public.routes.js)
// ============================================================

function checkAuthRoutes() {
  let allProtected = true;

  const backendSrc = path.join(PROJECT_ROOT, 'backend', 'src');
  const routeFiles = collectFiles(backendSrc, ['.js']).filter((f) =>
    f.endsWith('.routes.js')
  );

  for (const filePath of routeFiles) {
    const basename = path.basename(filePath);

    // public.routes.js is exempt — it intentionally has no auth
    if (basename === 'public.routes.js') continue;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      continue;
    }

    if (!content.includes('verifyToken')) {
      allProtected = false;
      findings.push({
        severity: 'warning',
        file: relPath(filePath),
        line: 0,
        description: `Route file does not reference verifyToken. Routes may be unprotected.`,
      });
    }
  }

  return allProtected;
}

// ============================================================
// Main
// ============================================================

function main() {
  const checks = {
    secretScan: checkHardcodedSecrets(),
    gitignore: checkGitignore(),
    helmet: checkHelmet(),
    cors: checkCors(),
    authRoutes: checkAuthRoutes(),
  };

  const hasCritical = findings.some((f) => f.severity === 'critical');
  const secure = !hasCritical;

  const result = {
    secure,
    findings,
    checks,
    timestamp: new Date().toISOString(),
  };

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(secure ? 0 : 1);
}

main();
