#!/usr/bin/env tsx
/**
 * Discover Linear teams and workflow states for configuration.
 *
 * Usage:
 *   npx tsx scripts/linear-discover-team.ts
 *   npx tsx scripts/linear-discover-team.ts --team OMG
 */

import { createLinearClient, discoverTeams, getWorkflowStates } from './linear-client.ts';

const client = createLinearClient();
const teamFilter = process.argv.find((_, i, a) => a[i - 1] === '--team') ?? '';

const teams = await discoverTeams(client);

if (teams.length === 0) {
  console.error('No teams found for this API key.');
  process.exit(1);
}

console.log('Linear Teams:\n');
for (const team of teams) {
  if (teamFilter && team.key.toLowerCase() !== teamFilter.toLowerCase() && team.name.toLowerCase() !== teamFilter.toLowerCase()) {
    continue;
  }
  console.log(`  ${team.key} — ${team.name} (id: ${team.id})`);

  const states = await getWorkflowStates(client, team.id);
  console.log('  Workflow states:');
  for (const s of states.sort((a, b) => a.position - b.position)) {
    console.log(`    ${s.name} (type: ${s.type}, id: ${s.id})`);
  }

  const requiredCustom = ['Rework', 'Human Review', 'Merging'];
  const existing = states.map((s) => s.name);
  const missing = requiredCustom.filter((name) => !existing.includes(name));
  if (missing.length > 0) {
    console.log(`\n  Missing Symphony states (create in Linear team settings):`);
    for (const name of missing) {
      console.log(`    - ${name}`);
    }
  } else {
    console.log(`\n  All Symphony states present.`);
  }
  console.log('');
}
