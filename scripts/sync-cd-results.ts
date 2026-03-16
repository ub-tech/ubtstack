#!/usr/bin/env node
/**
 * Sync CD results from a GH Action artifact into a review packet.
 *
 * Usage:
 *   npx tsx scripts/sync-cd-results.ts <cd-results-path> <review-packet-path>
 *
 * Reads cd-results.json (from GH Action artifact), updates the review packet's
 * cd.status and cd.tests, then writes the updated review packet.
 *
 * Exit codes:
 *   0 = success
 *   1 = cd tests failed (results synced, but cd.status == "fail")
 *   2 = usage or file error
 */

import fs from 'fs';
import path from 'path';

type StageTest = {
  category: string;
  status: 'pass' | 'fail' | 'skip';
  details?: string;
};

type CdResults = {
  status: 'pass' | 'fail';
  tests: StageTest[];
};

function fail(msg: string, code = 2): never {
  console.error(msg);
  process.exit(code);
}

const cdResultsPath = process.argv[2];
const packetPath = process.argv[3];

if (!cdResultsPath || !packetPath) {
  fail('Usage: npx tsx scripts/sync-cd-results.ts <cd-results-path> <review-packet-path>');
}

let cdResults: CdResults;
try {
  cdResults = JSON.parse(fs.readFileSync(path.resolve(cdResultsPath), 'utf8')) as CdResults;
} catch (err) {
  fail(`Failed to read cd-results: ${String(err)}`);
}

let packet: Record<string, unknown>;
try {
  packet = JSON.parse(fs.readFileSync(path.resolve(packetPath), 'utf8')) as Record<string, unknown>;
} catch (err) {
  fail(`Failed to read review packet: ${String(err)}`);
}

// Navigate to test_matrix
const implSummary = packet.implementation_summary as Record<string, unknown> | undefined;
if (!implSummary) {
  fail('Review packet has no implementation_summary');
}

const testMatrix = implSummary.test_matrix as Record<string, unknown> | undefined;
if (!testMatrix) {
  fail('Review packet has no test_matrix');
}

// Update cd stage
testMatrix.cd = {
  status: cdResults.status,
  tests: cdResults.tests
};

// Remove legacy cd_qa if present
delete testMatrix.cd_qa;

// Write updated packet
const resolvedPath = path.resolve(packetPath);
fs.writeFileSync(resolvedPath, JSON.stringify(packet, null, 2) + '\n');

const failedTests = cdResults.tests.filter(t => t.status === 'fail');
if (cdResults.status === 'pass') {
  console.log(`CD results synced: PASS (${cdResults.tests.length} tests)`);
  console.log(`Updated: ${resolvedPath}`);
  process.exit(0);
} else {
  console.error(`CD results synced: FAIL`);
  console.error(`Failed tests:`);
  for (const t of failedTests) {
    console.error(`  - ${t.category}${t.details ? ': ' + t.details : ''}`);
  }
  console.log(`Updated: ${resolvedPath}`);
  process.exit(1);
}
