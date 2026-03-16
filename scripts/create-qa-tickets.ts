#!/usr/bin/env node
/**
 * Create linked QA tickets in Linear when CD tests fail.
 *
 * Usage:
 *   npx tsx scripts/create-qa-tickets.ts <review-packet-path> <manifest-path> --team ENG
 *
 * When cd.status == "fail", creates a Linear issue for each failed test category:
 * - Title: [QA] <parent-ticket-id>: <failure category> — <details>
 * - Labels: qa-failure
 * - Relation: QA ticket blocks parent ticket
 *
 * Also transitions the parent ticket to Rework.
 *
 * Exit codes:
 *   0 = tickets created (or no failures)
 *   1 = error creating tickets
 *   2 = usage or file error
 */

import fs from 'fs';
import path from 'path';
import { createLinearClient, findTeam, getWorkflowStates, findStateId } from './linear-client.js';

type StageTest = {
  category: string;
  status: 'pass' | 'fail' | 'skip';
  details?: string;
};

type Stage = {
  status: 'pass' | 'fail' | 'pending';
  tests: StageTest[];
};

function fail(msg: string, code = 2): never {
  console.error(msg);
  process.exit(code);
}

const packetPath = process.argv[2];
const manifestPath = process.argv[3];
if (!packetPath || !manifestPath) {
  fail('Usage: npx tsx scripts/create-qa-tickets.ts <review-packet-path> <manifest-path> --team <TEAM_KEY>');
}

let teamKey = 'ENG';
for (let i = 4; i < process.argv.length; i++) {
  if (process.argv[i] === '--team') {
    teamKey = process.argv[++i] ?? 'ENG';
  }
}

let packet: Record<string, unknown>;
let manifest: Record<string, unknown>;
try {
  packet = JSON.parse(fs.readFileSync(path.resolve(packetPath), 'utf8'));
  manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
} catch (err) {
  fail(`Failed to read files: ${String(err)}`);
}

const ticketId = (packet.ticket_id as string) ?? '';
const featureId = (packet.feature_id as string) ?? '';
const implSummary = packet.implementation_summary as Record<string, unknown> | undefined;
const testMatrix = implSummary?.test_matrix as Record<string, unknown> | undefined;
const cd = testMatrix?.cd as Stage | undefined;

if (!cd || cd.status !== 'fail') {
  console.log('CD status is not "fail". No QA tickets needed.');
  process.exit(0);
}

const failedTests = cd.tests.filter(t => t.status === 'fail');
if (failedTests.length === 0) {
  console.log('cd.status is "fail" but no individual test failures found. No QA tickets created.');
  process.exit(0);
}

async function main() {
  const client = createLinearClient();

  // Find team
  const team = await findTeam(client, teamKey);
  if (!team) {
    fail(`Team not found: ${teamKey}`);
  }

  // Find "Todo" state for new QA tickets
  const todoStateId = await findStateId(client, team.id, 'Todo');
  if (!todoStateId) {
    fail(`"Todo" workflow state not found for team ${teamKey}`);
  }

  // Find "Rework" state for parent ticket
  const reworkStateId = await findStateId(client, team.id, 'Rework');

  // Find or create "qa-failure" label
  const labels = await client.issueLabels({ filter: { name: { eq: 'qa-failure' } } });
  let labelId = labels.nodes[0]?.id;
  if (!labelId) {
    const newLabel = await client.createIssueLabel({ name: 'qa-failure', color: '#FF4444' });
    const createdLabel = await newLabel.issueLabel;
    labelId = createdLabel?.id;
  }

  // Find parent issue to get its ID for relations
  let parentIssueId: string | null = null;
  if (ticketId) {
    const issues = await client.issues({ filter: { identifier: { eq: ticketId } } });
    parentIssueId = issues.nodes[0]?.id ?? null;
  }

  const createdTickets: string[] = [];

  for (const test of failedTests) {
    const title = `[QA] ${ticketId}: ${test.category}${test.details ? ' — ' + test.details : ''}`;
    const body = [
      `## QA Failure`,
      ``,
      `**Parent ticket:** ${ticketId}`,
      `**Feature:** ${featureId}`,
      `**Failed category:** ${test.category}`,
      test.details ? `**Details:** ${test.details}` : '',
      ``,
      `This ticket was auto-created because the CD staging pipeline detected a test failure.`,
      `Fix the failure and re-run the CD pipeline. The parent ticket (${ticketId}) is blocked until all QA tickets are resolved.`,
    ].filter(Boolean).join('\n');

    try {
      const createPayload: Record<string, unknown> = {
        title,
        description: body,
        teamId: team.id,
        stateId: todoStateId,
      };

      if (labelId) {
        createPayload.labelIds = [labelId];
      }

      const result = await client.createIssue(createPayload);
      const issue = await result.issue;
      if (issue) {
        createdTickets.push(issue.identifier);
        console.log(`Created: ${issue.identifier} — ${title}`);

        // Create blocking relation: QA ticket blocks parent
        if (parentIssueId) {
          await client.createIssueRelation({
            issueId: issue.id,
            relatedIssueId: parentIssueId,
            type: 'blocks'
          });
          console.log(`  → ${issue.identifier} blocks ${ticketId}`);
        }
      }
    } catch (err) {
      console.error(`Failed to create ticket for ${test.category}: ${String(err)}`);
    }
  }

  // Transition parent ticket to Rework
  if (parentIssueId && reworkStateId) {
    try {
      await client.updateIssue(parentIssueId, { stateId: reworkStateId });
      console.log(`\nTransitioned ${ticketId} to Rework`);
    } catch (err) {
      console.error(`Failed to transition ${ticketId} to Rework: ${String(err)}`);
    }
  }

  console.log(`\nCreated ${createdTickets.length} QA ticket(s): ${createdTickets.join(', ')}`);
}

main().catch((err) => {
  console.error(`Fatal error: ${String(err)}`);
  process.exit(1);
});
