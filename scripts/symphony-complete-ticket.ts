#!/usr/bin/env node
/**
 * Symphony completion gate.
 *
 * Runs the review-packet validator and enforces the Linear status-transition contract.
 *
 * Usage:
 *   node scripts/symphony-complete-ticket.ts  *     .claude/state/planning-manifest.json  *     .claude/state/review-packet.json  *     --ticket ENG-201  *     --current-status "In Progress"  *     --mode check
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function fail(msg: string, code = 2): never {
  console.error(msg);
  process.exit(code);
}

const manifestPath = process.argv[2];
const packetPath = process.argv[3];
if (!manifestPath || !packetPath) {
  fail('Usage: node scripts/symphony-complete-ticket.ts <manifest-path> <review-packet-path> [--ticket <linear-id>] [--current-status <status>] [--mode check|complete] [--contract <path>]');
}

let linearTicketId = '';
let currentStatus = 'In Progress';
let mode = 'check';
let contractPath = '';
for (let i = 4; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--ticket') {
    linearTicketId = process.argv[++i] ?? '';
  } else if (arg === '--current-status') {
    currentStatus = process.argv[++i] ?? 'In Progress';
  } else if (arg === '--mode') {
    mode = process.argv[++i] ?? 'check';
  } else if (arg === '--contract') {
    contractPath = process.argv[++i] ?? '';
  }
}
if (!['check', 'complete'].includes(mode)) fail(`Unsupported mode: ${mode}`);

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const validatorPath = path.join(rootDir, 'validate-review-packet.ts');
if (!fs.existsSync(validatorPath)) fail(`Validator not found: ${validatorPath}`);
if (!contractPath) contractPath = path.join(rootDir, '..', '.claude', 'templates', 'linear-status-contract-v2.template.json');
if (!fs.existsSync(contractPath)) fail(`Linear status contract not found: ${contractPath}`);
const resolverPath = path.join(rootDir, 'resolve-linear-transition.ts');
if (!fs.existsSync(resolverPath)) fail(`Transition resolver not found: ${resolverPath}`);

const execArgv = process.execArgv.filter(a => !a.startsWith('--eval'));
const validator = spawnSync(process.execPath, [...execArgv, validatorPath, manifestPath, packetPath], {
  cwd: process.cwd(),
  encoding: 'utf8'
});

if (validator.error) fail(String(validator.error));
if (!validator.stdout) fail('Validator produced no output.');

let summary: any;
try {
  summary = JSON.parse(validator.stdout);
} catch (err) {
  console.error(validator.stdout);
  fail(`Failed to parse validator output: ${String(err)}`);
}

const validationPassed = !!summary.validation?.passed;

// v2: Check for CI attestation
const packetData = JSON.parse(fs.readFileSync(path.resolve(packetPath), 'utf8'));
const ticketIdForAttestation = linearTicketId || packetData.ticket_id || '';
const ciAttestationPath = path.join(path.dirname(path.resolve(packetPath)), `attestation-${ticketIdForAttestation}-CI.json`);
let ciAttested = false;
let attestationErrors: string[] = [];

if (fs.existsSync(ciAttestationPath)) {
  try {
    const attestation = JSON.parse(fs.readFileSync(ciAttestationPath, 'utf8'));
    const allPassed = (attestation.tests_executed ?? []).every((t: any) => t.status === 'PASS');
    const hasSignature = attestation.signature?.method === 'gpg-detach-sign' && attestation.signature?.signature_file;
    ciAttested = allPassed && !!hasSignature;
    if (!allPassed) attestationErrors.push('CI attestation has failing tests');
    if (!hasSignature) attestationErrors.push('CI attestation is not GPG-signed');
  } catch {
    attestationErrors.push('CI attestation file is malformed');
  }
} else {
  attestationErrors.push(`CI attestation not found: ${ciAttestationPath}`);
}

const outcome = (validationPassed && ciAttested) ? 'validation_pass' : 'validation_fail';
const transition = spawnSync(process.execPath, [...execArgv, resolverPath, contractPath, currentStatus, outcome, '--actor', 'symphony'], {
  cwd: process.cwd(),
  encoding: 'utf8'
});
if (!transition.stdout) fail('Transition resolver produced no output.');
let transitionSummary: any;
try {
  transitionSummary = JSON.parse(transition.stdout);
} catch (err) {
  console.error(transition.stdout);
  fail(`Failed to parse transition output: ${String(err)}`);
}

const status = validationPassed ? 'passed' : 'failed';
const output = {
  linear_ticket_id: linearTicketId || null,
  mode,
  gate: 'review-packet-validator',
  status,
  current_status: currentStatus,
  outcome,
  next_status: transitionSummary.next_status,
  transition_allowed: transitionSummary.allowed_transition,
  ci_attestation: {
    found: fs.existsSync(ciAttestationPath),
    valid: ciAttested,
    errors: attestationErrors
  },
  validator_summary: summary,
  transition_summary: transitionSummary
};
process.stdout.write(JSON.stringify(output, null, 2) + '\n');

if (!transitionSummary.allowed_transition) {
  console.error(`
Illegal Linear transition: ${currentStatus} -> ${transitionSummary.next_status} for ${linearTicketId || summary.ticket_id}.`);
  process.exit(1);
}

if (!validationPassed || !ciAttested) {
  console.error(`
Symphony must not complete ${linearTicketId || summary.ticket_id}.`);
  console.error(`Move ticket to ${transitionSummary.next_status}.`);
  console.error('Blocking reasons:');
  for (const [key, value] of Object.entries(summary.validation)) {
    if (key === 'passed') continue;
    if (Array.isArray(value) && value.length) {
      console.error(`- ${key}: ${value.join('; ')}`);
    } else if (value === true && key !== 'passed') {
      console.error(`- ${key}`);
    }
  }
  if (attestationErrors.length > 0) {
    console.error('Attestation issues:');
    for (const e of attestationErrors) {
      console.error(`- ${e}`);
    }
  }
  process.exit(1);
}

if (mode === 'complete') {
  console.error(`
Review-packet gate passed for ${linearTicketId || summary.ticket_id}. Symphony may transition the ticket from ${currentStatus} to ${transitionSummary.next_status}.`);
}

process.exit(0);
