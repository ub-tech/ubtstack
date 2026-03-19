#!/usr/bin/env tsx
/**
 * Validate a GPG-signed attestation record.
 *
 * Checks:
 *   1. Attestation JSON is well-formed
 *   2. GPG signature is valid (if not unsigned)
 *   3. Operator matches APPROVAL_REQUIRED_FROM (if set)
 *   4. All tests passed
 *   5. Git ref matches current HEAD (optional, with --check-ref)
 *
 * Usage:
 *   npx tsx scripts/validate-attestation.ts <attestation-path>
 *   npx tsx scripts/validate-attestation.ts <attestation-path> --check-ref
 *
 * Exit codes:
 *   0 = valid
 *   1 = invalid
 *   2 = usage error
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';

function fail(msg: string, code = 2): never {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

const attestationPath = process.argv[2];
if (!attestationPath) fail('Usage: npx tsx scripts/validate-attestation.ts <attestation-path> [--check-ref]');

const checkRef = process.argv.includes('--check-ref');

let attestation: any;
try {
  attestation = JSON.parse(fs.readFileSync(path.resolve(attestationPath), 'utf8'));
} catch (err) {
  fail(`Cannot read attestation: ${err}`);
}

const errors: string[] = [];
const warnings: string[] = [];

// 1. Structure validation
const required = ['attestation_id', 'feature_id', 'ticket_id', 'stage', 'operator', 'timestamp', 'tests_executed', 'summary', 'attestation_statement', 'signature'];
for (const field of required) {
  if (!attestation[field]) errors.push(`Missing required field: ${field}`);
}

if (!attestation.operator?.name) errors.push('Missing operator.name');
if (!attestation.operator?.email) errors.push('Missing operator.email');
if (!['CI', 'CD'].includes(attestation.stage)) errors.push(`Invalid stage: ${attestation.stage}`);

// 2. GPG signature validation
if (attestation.signature?.method === 'gpg-detach-sign') {
  const sigFile = attestation.signature.signature_file;
  const payloadDir = path.dirname(sigFile);
  const payloadFile = path.join(payloadDir, 'attestation-payload.json');

  if (!sigFile || !fs.existsSync(sigFile)) {
    errors.push(`GPG signature file not found: ${sigFile}`);
  } else if (!fs.existsSync(payloadFile)) {
    errors.push(`GPG payload file not found: ${payloadFile}`);
  } else {
    const verifyResult = spawnSync('gpg', ['--verify', sigFile, payloadFile], {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe']
    });

    if (verifyResult.status !== 0) {
      errors.push(`GPG signature verification FAILED: ${verifyResult.stderr?.trim()}`);
    } else {
      // Extract signer identity from GPG output
      const signerMatch = verifyResult.stderr?.match(/Good signature from "(.+?)"/);
      if (signerMatch) {
        console.error(`GPG: Good signature from ${signerMatch[1]}`);
      }
    }

    // Verify payload hash matches
    if (attestation.signature.signed_payload_hash) {
      let actualHash = '';
      try {
        actualHash = execSync(`shasum -a 256 "${payloadFile}" | cut -d' ' -f1`, { encoding: 'utf8' }).trim();
      } catch {
        try {
          actualHash = execSync(`sha256sum "${payloadFile}" | cut -d' ' -f1`, { encoding: 'utf8' }).trim();
        } catch {
          warnings.push('Could not verify payload hash');
        }
      }
      const expected = attestation.signature.signed_payload_hash.replace('sha256:', '');
      if (actualHash && actualHash !== expected) {
        errors.push(`Payload hash mismatch: expected ${expected}, got ${actualHash}`);
      }
    }
  }
} else if (attestation.signature?.method === 'unsigned') {
  warnings.push('Attestation is unsigned (--skip-sign was used). This is not acceptable for production.');
} else {
  errors.push(`Unknown signature method: ${attestation.signature?.method}`);
}

// 3. Operator validation
const approvalRequired = process.env.APPROVAL_REQUIRED_FROM;
if (approvalRequired) {
  // APPROVAL_REQUIRED_FROM can be a GitHub username or email
  const operatorName = attestation.operator?.name ?? '';
  const operatorEmail = attestation.operator?.email ?? '';
  if (operatorName !== approvalRequired && operatorEmail !== approvalRequired) {
    errors.push(`Operator ${operatorName} (${operatorEmail}) does not match APPROVAL_REQUIRED_FROM (${approvalRequired})`);
  }
}

// 4. Test results
const testsExecuted = attestation.tests_executed ?? [];
const failedTests = testsExecuted.filter((t: any) => t.status !== 'PASS');
if (failedTests.length > 0) {
  for (const t of failedTests) {
    errors.push(`Test ${t.trace_id} FAILED (exit code ${t.exit_code})`);
  }
}

if (testsExecuted.length === 0) {
  errors.push('No tests executed in attestation');
}

// Verify log files exist
for (const t of testsExecuted) {
  if (t.log_file && !fs.existsSync(t.log_file)) {
    warnings.push(`Log file missing: ${t.log_file} (for ${t.trace_id})`);
  }
}

// 5. Git ref check (optional)
if (checkRef && attestation.git_ref) {
  try {
    const currentRef = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    if (currentRef !== attestation.git_ref) {
      warnings.push(`Git ref mismatch: attestation is for ${attestation.git_ref}, current HEAD is ${currentRef}`);
    }
  } catch {
    warnings.push('Cannot verify git ref');
  }
}

// 6. CD-specific checks
if (attestation.stage === 'CD') {
  if (!attestation.environment?.staging_env_version) {
    errors.push('CD attestation missing staging_env_version');
  }
}

// Output
const valid = errors.length === 0;
const output = {
  attestation_id: attestation.attestation_id,
  ticket_id: attestation.ticket_id,
  stage: attestation.stage,
  operator: attestation.operator?.name,
  valid,
  errors,
  warnings,
  summary: attestation.summary
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');

if (warnings.length > 0) {
  console.error('\nWarnings:');
  for (const w of warnings) console.error(`  - ${w}`);
}

if (!valid) {
  console.error('\nAttestation INVALID:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.error(`\nAttestation ${attestation.attestation_id} is VALID.`);
process.exit(0);
