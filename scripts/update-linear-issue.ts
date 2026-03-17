#!/usr/bin/env tsx
/**
 * Update an existing Linear issue's title, description, and/or state.
 * Usage: npx tsx scripts/update-linear-issue.ts --identifier ENG-265 [--title "..."] [--body-file /path] [--state Todo]
 */

import fs from 'fs';
import { createLinearClient, findTeam, findStateId } from './linear-client.ts';

async function main() {
  const args = process.argv.slice(2);
  let identifier = '', title = '', bodyFile = '', stateName = '';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--identifier': identifier = args[++i]; break;
      case '--title': title = args[++i]; break;
      case '--body-file': bodyFile = args[++i]; break;
      case '--state': stateName = args[++i]; break;
    }
  }

  if (!identifier) {
    console.error('Usage: --identifier ENG-265 [--title "..."] [--body-file <path>] [--state Todo]');
    process.exit(1);
  }

  // Parse team key and number from identifier (e.g., "ENG-265" → team="ENG", number=265)
  const match = identifier.match(/^([A-Z]+)-(\d+)$/);
  if (!match) { console.error(`Invalid identifier format: ${identifier}`); process.exit(1); }
  const [, teamKey, numberStr] = match;
  const issueNumber = parseInt(numberStr, 10);

  const client = createLinearClient();

  const team = await findTeam(client, teamKey);
  if (!team) { console.error(`Team ${teamKey} not found`); process.exit(1); }

  // Find issue by team + number
  const issues = await client.issues({
    filter: {
      team: { id: { eq: team.id } },
      number: { eq: issueNumber }
    }
  });
  const issue = issues.nodes[0];
  if (!issue) { console.error(`Issue ${identifier} not found`); process.exit(1); }
  console.log(`Found: ${issue.identifier} (${issue.id})`);

  const update: Record<string, string> = {};
  if (title) update.title = title;
  if (bodyFile) update.description = fs.readFileSync(bodyFile, 'utf8');

  if (stateName) {
    const stateId = await findStateId(client, team.id, stateName);
    if (stateId) update.stateId = stateId;
    else console.warn(`State "${stateName}" not found, skipping state update`);
  }

  if (Object.keys(update).length === 0) {
    console.log('Nothing to update');
    return;
  }

  await client.updateIssue(issue.id, update);
  console.log(`Updated: ${issue.identifier}`);
  if (stateName) console.log(`State → ${stateName}`);
}

main().catch(e => { console.error(e); process.exit(1); });
