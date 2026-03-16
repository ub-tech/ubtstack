#!/usr/bin/env node
import fs from "fs";
import path from "path";

type Contract = {
  version: number;
  default_status: string;
  transitions: Record<string, Record<string, string[]>>;
  outcomes: Record<string, { target_status: string; actor: string }>;
};

function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length < 3) {
  fail('Usage: node scripts/resolve-linear-transition.ts <contract-path> <current-status> <outcome> [--actor <name>]');
}

const contractPath = path.resolve(args[0]);
const currentStatus = args[1];
const outcome = args[2];
let actorOverride = '';
for (let i = 3; i < args.length; i++) {
  if (args[i] === '--actor') actorOverride = args[++i] ?? '';
}

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as Contract;
const outcomeRule = contract.outcomes[outcome];
if (!outcomeRule) fail(`Unknown outcome: ${outcome}`);

const actor = actorOverride || outcomeRule.actor;
const nextStatus = outcomeRule.target_status;
const allowed = contract.transitions[currentStatus]?.[actor] ?? [];
const allowedTransition = allowed.includes(nextStatus);

const result = {
  contract_version: contract.version,
  actor,
  current_status: currentStatus,
  outcome,
  next_status: nextStatus,
  allowed_transition: allowedTransition,
  allowed_next_statuses: allowed
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(allowedTransition ? 0 : 1);
