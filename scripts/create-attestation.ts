#!/usr/bin/env tsx
/**
 * Create a GPG-signed attestation record for CI or CD test execution.
 *
 * The human operator runs this script after personally executing tests.
 * It captures test results, generates an attestation JSON, and signs it with GPG.
 *
 * Usage:
 *   npx tsx scripts/create-attestation.ts \
 *     --manifest .claude/state/planning-manifest.json \
 *     --ticket ENG-101 \
 *     --stage CI \
 *     --pr https://github.com/example/repo/pull/42
 *
 *   npx tsx scripts/create-attestation.ts \
 *     --manifest .claude/state/planning-manifest.json \
 *     --ticket ENG-101 \
 *     --stage CD \
 *     --staging-env-version v2.3.1 \
 *     --pr https://github.com/example/repo/pull/42
 *
 * Options:
 *   --manifest <path>              Planning manifest path (required)
 *   --ticket <id>                  Ticket ID (required)
 *   --stage <CI|CD>                Test stage (required)
 *   --pr <url>                     PR URL (required)
 *   --staging-env-version <ver>    Staging environment version (required for CD)
 *   --dry-run                      Show what would be run without executing tests
 *   --skip-sign                    Skip GPG signing (for testing only)
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { createInterface } from 'readline';

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Parse args
let manifestPath = '';
let ticketId = '';
let stage = '';
let prUrl = '';
let stagingEnvVersion = '';
let dryRun = false;
let skipSign = false;

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--manifest') manifestPath = process.argv[++i] ?? '';
  else if (arg === '--ticket') ticketId = process.argv[++i] ?? '';
  else if (arg === '--stage') stage = (process.argv[++i] ?? '').toUpperCase();
  else if (arg === '--pr') prUrl = process.argv[++i] ?? '';
  else if (arg === '--staging-env-version') stagingEnvVersion = process.argv[++i] ?? '';
  else if (arg === '--dry-run') dryRun = true;
  else if (arg === '--skip-sign') skipSign = true;
}

if (!manifestPath || !ticketId || !stage || !prUrl) {
  fail('Usage: npx tsx scripts/create-attestation.ts --manifest <path> --ticket <id> --stage <CI|CD> --pr <url>');
}
if (!['CI', 'CD'].includes(stage)) fail(`Invalid stage: ${stage}. Must be CI or CD.`);
if (stage === 'CD' && !stagingEnvVersion) fail('--staging-env-version is required for CD attestations.');

// Read manifest
let manifest: any;
try {
  manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
} catch (err) {
  fail(`Cannot read manifest: ${err}`);
}

// Find ticket
const ticket = manifest.tickets?.find((t: any) => t.id === ticketId);
if (!ticket) fail(`Ticket ${ticketId} not found in manifest.`);

// Get test traceability matrix rows for this stage
const matrix: any[] = ticket.test_traceability_matrix ?? [];
const stageRows = matrix.filter((row: any) => row.stage === stage);

if (stageRows.length === 0) {
  fail(`No test traceability matrix rows for stage ${stage} in ticket ${ticketId}.`);
}

// Get git ref
let gitRef = '';
try {
  gitRef = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  gitRef = 'unknown';
}

// Get branch
let branch = '';
try {
  branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
} catch {
  branch = 'unknown';
}

// Get operator info
let operatorName = '';
let operatorEmail = '';
try {
  operatorName = execSync('git config user.name', { encoding: 'utf8' }).trim();
  operatorEmail = execSync('git config user.email', { encoding: 'utf8' }).trim();
} catch {
  fail('Cannot determine operator identity. Set git config user.name and user.email.');
}

// Get GPG key ID
let gpgKeyId = '';
if (!skipSign) {
  try {
    gpgKeyId = execSync('git config user.signingkey', { encoding: 'utf8' }).trim();
  } catch {
    // Try to find default key
    try {
      const gpgOutput = execSync(`gpg --list-secret-keys --keyid-format long ${operatorEmail} 2>/dev/null`, { encoding: 'utf8' });
      const match = gpgOutput.match(/sec\s+\w+\/([A-F0-9]+)/);
      if (match) gpgKeyId = match[1];
    } catch { /* no key found */ }
  }

  if (!gpgKeyId) {
    fail(
      'No GPG key found. Set up GPG signing:\n' +
      '  1. Generate a key: gpg --full-generate-key\n' +
      '  2. Configure git: git config --global user.signingkey <KEY_ID>\n' +
      '  3. Export public key: gpg --armor --export <KEY_ID>\n' +
      '  4. Add to GitHub: Settings > SSH and GPG keys\n'
    );
  }
}

// Generate attestation ID
const now = new Date();
const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
const attestationId = `ATT-${dateStr}-${seq}`;

// Create log directory
const logDir = `.claude/state/logs/${attestationId}`;
if (!dryRun) {
  fs.mkdirSync(logDir, { recursive: true });
}

console.error(`\n=== Attestation: ${attestationId} ===`);
console.error(`Ticket:   ${ticketId}`);
console.error(`Stage:    ${stage}`);
console.error(`Operator: ${operatorName} <${operatorEmail}>`);
console.error(`Git ref:  ${gitRef}`);
console.error(`Branch:   ${branch}`);
if (stage === 'CD') console.error(`Staging:  ${stagingEnvVersion}`);
console.error(`\n${stageRows.length} tests to execute:\n`);

// Show test plan
for (const row of stageRows) {
  console.error(`  ${row.trace_id}: ${row.test_type} — ${row.success_criteria}`);
}

if (dryRun) {
  console.error('\n[DRY RUN] Would execute the above tests. Exiting.');
  process.exit(0);
}

// Confirm with operator
const confirmation = await prompt(`\nReady to run ${stageRows.length} tests? (yes/no): `);
if (confirmation.toLowerCase() !== 'yes') {
  console.error('Aborted by operator.');
  process.exit(1);
}

// Execute test commands and capture results
const testCommands = ticket.test_commands ?? [];
if (testCommands.length === 0) {
  fail('No test_commands specified in ticket. Cannot execute tests.');
}

const testsExecuted: any[] = [];
let allPassed = true;

for (const row of stageRows) {
  const traceId = row.trace_id;
  const logFile = path.join(logDir, `${traceId}.log`);

  console.error(`\n--- Running ${traceId} ---`);

  // Determine which command to run
  // Use the first test command that seems relevant, or the full test suite
  const cmd = testCommands.join(' && ');

  const startTime = Date.now();
  const result = spawnSync('sh', ['-c', cmd], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 300_000, // 5 minute timeout per test
    stdio: ['inherit', 'pipe', 'pipe']
  });
  const duration = Date.now() - startTime;

  // Write log
  const logContent = [
    `=== ${traceId} ===`,
    `Command: ${cmd}`,
    `Exit code: ${result.status}`,
    `Duration: ${duration}ms`,
    `Timestamp: ${new Date().toISOString()}`,
    '',
    '=== STDOUT ===',
    result.stdout ?? '',
    '',
    '=== STDERR ===',
    result.stderr ?? ''
  ].join('\n');

  fs.writeFileSync(logFile, logContent, 'utf8');

  // Hash the log
  let logHash = '';
  try {
    logHash = execSync(`sha256sum "${logFile}" | cut -d' ' -f1`, { encoding: 'utf8' }).trim();
  } catch {
    try {
      logHash = execSync(`shasum -a 256 "${logFile}" | cut -d' ' -f1`, { encoding: 'utf8' }).trim();
    } catch {
      logHash = 'hash-unavailable';
    }
  }

  const passed = result.status === 0;
  if (!passed) allPassed = false;

  testsExecuted.push({
    trace_id: traceId,
    test_file: row.test_file,
    command: cmd,
    exit_code: result.status ?? -1,
    duration_ms: duration,
    log_file: logFile,
    log_hash: `sha256:${logHash}`,
    status: passed ? 'PASS' : 'FAIL'
  });

  console.error(`  ${passed ? 'PASS' : 'FAIL'} (${duration}ms)`);
}

// Build attestation
const attestation: any = {
  attestation_id: attestationId,
  feature_id: manifest.feature_id,
  ticket_id: ticketId,
  pr_url: prUrl,
  branch,
  git_ref: gitRef,

  operator: {
    name: operatorName,
    email: operatorEmail
  },

  stage,
  timestamp: now.toISOString(),

  environment: {
    staging_env_version: stage === 'CD' ? stagingEnvVersion : null,
    os: `${process.platform} ${execSync('uname -r', { encoding: 'utf8' }).trim()}`,
    runtime: execSync('node --version', { encoding: 'utf8' }).trim(),
    notes: stage === 'CI' ? 'Local development environment' : `Staging environment ${stagingEnvVersion}`
  },

  tests_executed: testsExecuted,

  summary: {
    total_tests: testsExecuted.length,
    passed: testsExecuted.filter((t) => t.status === 'PASS').length,
    failed: testsExecuted.filter((t) => t.status === 'FAIL').length,
    skipped: 0,
    total_duration_ms: testsExecuted.reduce((sum, t) => sum + t.duration_ms, 0)
  },

  attestation_statement: `I, ${operatorName}, attest that I personally executed the above test commands on git ref ${gitRef}, observed the results in real-time, and confirm that all tests ${allPassed ? 'passed' : 'completed'} as documented. The log files referenced above contain the complete, unmodified output of each test run.`,

  signature: {
    method: skipSign ? 'unsigned' : 'gpg-detach-sign',
    gpg_key_id: skipSign ? null : gpgKeyId,
    signed_payload_hash: null as string | null,
    signature_file: null as string | null
  }
};

// Write attestation JSON
const attestationPath = `.claude/state/attestation-${ticketId}-${stage}.json`;
fs.mkdirSync(path.dirname(attestationPath), { recursive: true });
fs.writeFileSync(attestationPath, JSON.stringify(attestation, null, 2) + '\n', 'utf8');

// GPG sign
if (!skipSign) {
  const payloadPath = path.join(logDir, 'attestation-payload.json');
  const sigPath = path.join(logDir, 'attestation.sig');

  // Create deterministic payload for signing
  const payload = JSON.stringify({
    attestation_statement: attestation.attestation_statement,
    tests_executed: attestation.tests_executed,
    git_ref: attestation.git_ref,
    timestamp: attestation.timestamp
  });
  fs.writeFileSync(payloadPath, payload, 'utf8');

  // Hash the payload
  let payloadHash = '';
  try {
    payloadHash = execSync(`shasum -a 256 "${payloadPath}" | cut -d' ' -f1`, { encoding: 'utf8' }).trim();
  } catch {
    try {
      payloadHash = execSync(`sha256sum "${payloadPath}" | cut -d' ' -f1`, { encoding: 'utf8' }).trim();
    } catch {
      payloadHash = 'hash-unavailable';
    }
  }

  // Sign
  const signResult = spawnSync('gpg', [
    '--detach-sign', '--armor',
    '--local-user', gpgKeyId,
    '--output', sigPath,
    payloadPath
  ], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });

  if (signResult.status !== 0) {
    console.error(`GPG signing failed: ${signResult.stderr}`);
    fail('Attestation created but GPG signing failed. Fix GPG configuration and re-run.');
  }

  // Update attestation with signature info
  attestation.signature.signed_payload_hash = `sha256:${payloadHash}`;
  attestation.signature.signature_file = sigPath;
  fs.writeFileSync(attestationPath, JSON.stringify(attestation, null, 2) + '\n', 'utf8');

  console.error(`\nGPG signature: ${sigPath}`);
}

console.error(`\n=== Attestation Complete ===`);
console.error(`File: ${attestationPath}`);
console.error(`Tests: ${attestation.summary.passed}/${attestation.summary.total_tests} passed`);

if (!allPassed) {
  console.error('\nWARNING: Some tests FAILED. Attestation created but merge gate will reject.');
  process.exit(1);
}

console.error('\nAll tests passed. Attestation is ready.');
console.error(`Next: commit ${attestationPath} to the PR branch.`);
process.exit(0);
