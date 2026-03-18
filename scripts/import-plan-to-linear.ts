#!/usr/bin/env tsx
/**
 * Render Linear issue payloads from a planning manifest.
 * Auto-computes required test categories and QA gates from change classification.
 *
 * Modes:
 *   Dry-run (default): prints JSON payloads to stdout
 *   Execute (--execute --team <key>): creates issues in Linear via API
 *
 * Options:
 *   --project <id>   Link all created issues to a Linear project by ID
 *
 * Usage:
 *   npx tsx scripts/import-plan-to-linear.ts <manifest-path>
 *   npx tsx scripts/import-plan-to-linear.ts <manifest-path> --execute --team OMG
 *   npx tsx scripts/import-plan-to-linear.ts <manifest-path> --execute --team OMG --project <project-id>
 */

import fs from 'fs';
import path from 'path';
import { createLinearClient, findTeam, findStateId } from './linear-client.ts';

type ChangeClassification = {
  domain_logic_changed?: boolean;
  module_boundary_changed?: boolean;
  api_contract_changed?: boolean;
  user_workflow_changed?: boolean;
  throughput_or_latency_path_changed?: boolean;
  trust_boundary_or_external_input_changed?: boolean;
  bug_fix_or_regression_risk?: boolean;
  operational_behavior_changed?: boolean;
};

type Ticket = {
  id: string;
  title: string;
  repo: string;
  labels?: string[];
  depends_on?: string[];
  scope?: string[];
  implementation_guidance?: string[];
  acceptance_criteria?: string[];
  allowed_paths?: string[];
  touched_components?: string[];
  test_commands?: string[];
  required_test_categories?: string[];
  conditional_test_categories?: string[];
  qa_requirements?: string[];
  escalation_rule?: string;
  deliverables?: string[];
  change_classification?: ChangeClassification;
  existing_code_context?: {
    modules?: string[];
    current_tests?: string[];
    interfaces?: string[];
    notes?: string[];
  };
};

type Manifest = {
  feature_id: string;
  title: string;
  summary: string;
  product_review?: {
    problem?: string;
    non_goals?: string[];
    hard_restrictions?: string[];
  };
  source?: {
    planning_inputs?: {
      prd_refs?: string[];
      architecture_refs?: string[];
      other_inputs?: string[];
    };
  };
  existing_code_context?: {
    modules?: string[];
    current_tests?: string[];
    related_prs?: string[];
  };
  engineering_review?: {
    default_test_policy?: { always?: string[] };
    default_qa_policy?: { always?: string[] };
  };
  tickets: Ticket[];
  business_tasks?: BusinessTask[];
};

type BusinessTask = {
  id: string;
  title: string;
  team: string;
  type?: string;
  priority?: string;
  depends_on?: string[];
  labels?: string[];
  description: string;
  acceptance_criteria?: string[];
  deliverables?: string[];
  owner?: string;
  due_date?: string | null;
};

function usageAndExit(): never {
  console.error('Usage: npx tsx scripts/import-plan-to-linear.ts <manifest-path> [--execute --team <key>] [--project <id>]');
  process.exit(1);
}

const manifestPath = process.argv[2];
if (!manifestPath) usageAndExit();

let executeMode = false;
let teamKey = '';
let projectId = process.env.LINEAR_PROJECT_ID ?? '';
for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === '--execute') executeMode = true;
  if (process.argv[i] === '--team') teamKey = process.argv[++i] ?? '';
  if (process.argv[i] === '--project') projectId = process.argv[++i] ?? '';
}
if (executeMode && !teamKey) {
  console.error('--execute requires --team <key>');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8')) as Manifest;

// --- Allowed-paths overlap detection ---

function detectAllowedPathOverlaps(tickets: Ticket[]): Array<{ ticketA: string; ticketB: string; overlapping: string[] }> {
  const overlaps: Array<{ ticketA: string; ticketB: string; overlapping: string[] }> = [];

  for (let i = 0; i < tickets.length; i++) {
    const pathsA = tickets[i].allowed_paths ?? [];
    if (pathsA.length === 0) continue;

    for (let j = i + 1; j < tickets.length; j++) {
      const pathsB = tickets[j].allowed_paths ?? [];
      if (pathsB.length === 0) continue;

      const shared: string[] = [];
      for (const a of pathsA) {
        for (const b of pathsB) {
          // Exact match
          if (a === b) {
            shared.push(a);
            continue;
          }
          // One is a parent directory of the other
          const aNorm = a.endsWith('/') ? a : a + '/';
          const bNorm = b.endsWith('/') ? b : b + '/';
          if (bNorm.startsWith(aNorm) || aNorm.startsWith(bNorm)) {
            shared.push(`${a} <-> ${b}`);
          }
        }
      }

      if (shared.length > 0) {
        overlaps.push({
          ticketA: tickets[i].id,
          ticketB: tickets[j].id,
          overlapping: [...new Set(shared)]
        });
      }
    }
  }

  return overlaps;
}

const overlaps = detectAllowedPathOverlaps(manifest.tickets);
if (overlaps.length > 0) {
  console.error('\n⚠  ALLOWED_PATHS OVERLAP DETECTED');
  console.error('   Tickets with overlapping paths risk merge conflicts when agents work in parallel.\n');
  for (const o of overlaps) {
    console.error(`   ${o.ticketA} ↔ ${o.ticketB}`);
    for (const p of o.overlapping) {
      console.error(`     - ${p}`);
    }
  }
  console.error('\n   Consider splitting overlapping paths so each ticket owns exclusive files.');
  console.error('   Proceeding anyway...\n');
}

function bullets(items?: string[], checkbox = false): string {
  const values = items && items.length ? items : ['none'];
  return values.map((v) => (checkbox ? `- [ ] ${v}` : `- ${v}`)).join('\n');
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function classifyTests(ticket: Ticket): { required: string[]; conditional: string[]; qa: string[] } {
  const c = ticket.change_classification ?? {};
  const required = new Set<string>(manifest.engineering_review?.default_test_policy?.always ?? ['smoke']);
  const conditional = new Set<string>();
  const qa = new Set<string>(manifest.engineering_review?.default_qa_policy?.always ?? ['staging smoke pass', 'critical flow verification', 'regression verification']);

  if (c.domain_logic_changed) required.add('unit');
  if (c.module_boundary_changed) required.add('integration');
  if (c.api_contract_changed) {
    required.add('functional-api');
    required.add('regression');
    conditional.add('ui-api-interaction');
  }
  if (c.user_workflow_changed) required.add('system');
  if (c.throughput_or_latency_path_changed) {
    conditional.add('load');
    conditional.add('stress');
  }
  if (c.trust_boundary_or_external_input_changed) {
    conditional.add('security');
    conditional.add('fuzz');
    required.add('error-path-resilience');
  }
  if (c.bug_fix_or_regression_risk) required.add('regression');
  if (c.operational_behavior_changed) {
    qa.add('rollback plan documented');
    qa.add('monitoring or alert updates if applicable');
  }

  const explicitRequired = ticket.required_test_categories ?? [];
  const explicitConditional = ticket.conditional_test_categories ?? [];
  const explicitQa = ticket.qa_requirements ?? [];

  return {
    required: uniq([...required, ...explicitRequired]),
    conditional: uniq([...conditional, ...explicitConditional]),
    qa: uniq([...qa, ...explicitQa])
  };
}

function renderIssueBody(ticket: Ticket): string {
  const existingModules = [
    ...(manifest.existing_code_context?.modules ?? []),
    ...(ticket.existing_code_context?.modules ?? [])
  ];

  const related = [
    ...(manifest.existing_code_context?.related_prs ?? []),
    ...(manifest.source?.planning_inputs?.other_inputs ?? [])
  ];

  const derived = classifyTests(ticket);
  const c = ticket.change_classification ?? {};

  return `## Summary
${ticket.title} — ${manifest.summary}

## Problem
${manifest.product_review?.problem ?? 'n/a'}

## Scope
${bullets(ticket.scope)}

## Non-Goals
${bullets(manifest.product_review?.non_goals)}

## Hard Restrictions
${bullets(manifest.product_review?.hard_restrictions)}

## Inputs
- PRD: ${(manifest.source?.planning_inputs?.prd_refs ?? ['none']).join(', ')}
- Architecture Guidance: ${(manifest.source?.planning_inputs?.architecture_refs ?? ['none']).join(', ')}
- Existing Code Context: ${(existingModules.length ? existingModules : ['none']).join(', ')}
- Related Issues/PRs: ${(related.length ? related : ['none']).join(', ')}

## Repo / Surface Area
Repo: ${ticket.repo}
${(ticket.allowed_paths?.length === 1 && ticket.allowed_paths[0] === '**') ? 'Allowed Paths: No restrictions — all paths allowed.' : `Allowed Paths:\n${bullets(ticket.allowed_paths)}`}

Touched Components:
${bullets(ticket.touched_components)}

## Change Classification
- Domain Logic Changed: ${c.domain_logic_changed ? 'yes' : 'no'}
- Module Boundary Changed: ${c.module_boundary_changed ? 'yes' : 'no'}
- API Contract Changed: ${c.api_contract_changed ? 'yes' : 'no'}
- User Workflow Changed: ${c.user_workflow_changed ? 'yes' : 'no'}
- Throughput / Latency Path Changed: ${c.throughput_or_latency_path_changed ? 'yes' : 'no'}
- Trust Boundary or External Input Changed: ${c.trust_boundary_or_external_input_changed ? 'yes' : 'no'}
- Bug Fix / Regression Risk: ${c.bug_fix_or_regression_risk ? 'yes' : 'no'}
- Operational Behavior Changed: ${c.operational_behavior_changed ? 'yes' : 'no'}

## Implementation Guidance
${bullets(ticket.implementation_guidance)}

## Acceptance Criteria
${bullets(ticket.acceptance_criteria, true)}

## Test Requirements
Required:
${bullets(derived.required, true)}

Conditionally Required When Applicable:
${bullets(derived.conditional, true)}

## QA Requirements
${bullets(derived.qa, true)}

## Automation Enforcement
- Symphony derived the required test and QA gates from Change Classification.
- Codex must satisfy all Required items.
- Any skipped conditional category must be explained in the PR and review packet.

## Test Commands
\`\`\`bash
${(ticket.test_commands && ticket.test_commands.length) ? ticket.test_commands.join('\n') : 'echo "add test commands"'}
\`\`\`

## Dependencies
- Depends on: ${(ticket.depends_on ?? ['none']).join(', ')}
- Blocks: none

## Escalation Rule
${ticket.escalation_rule ?? 'If implementation requires changes outside Allowed Paths, architecture is ambiguous, or required test/QA categories cannot be completed, stop and return to planning.'}

## Deliverables
${bullets(ticket.deliverables)}`;
}

// Build payloads
const payloads = manifest.tickets.map((ticket) => {
  const derived = classifyTests(ticket);
  return {
    ticket,
    epic: {
      title: `${manifest.feature_id}: ${manifest.title}`,
      description: manifest.summary,
      labels: ['feature', ...(ticket.labels ?? [])]
    },
    issue: {
      title: `[${ticket.repo}] ${ticket.title}`,
      description: renderIssueBody(ticket),
      labels: uniq([...(ticket.labels ?? []), ...derived.required.map((x) => `test:${x}`), ...derived.qa.map((x) => `qa:${x.replace(/\s+/g, '-')}`)]),
      dependencies: ticket.depends_on ?? [],
      state: {
        recommended_initial_status: 'Todo'
      },
      metadata: {
        required_test_categories: derived.required,
        conditional_test_categories: derived.conditional,
        qa_requirements: derived.qa,
        change_classification: ticket.change_classification ?? {}
      }
    }
  };
});

// Build business task payloads
const businessPayloads = (manifest.business_tasks ?? []).map((task) => {
  const body = `## Summary
${task.title} — ${manifest.summary}

## Problem
${manifest.product_review?.problem ?? 'n/a'}

## Description
${task.description}

## Acceptance Criteria
${bullets(task.acceptance_criteria, true)}

## Deliverables
${bullets(task.deliverables)}

## Owner
${task.owner ?? 'unassigned'}`;

  return {
    task,
    issue: {
      title: task.title,
      description: body,
      team: task.team,
      labels: task.labels ?? [],
      dependencies: task.depends_on ?? [],
      state: { recommended_initial_status: 'Todo' }
    }
  };
});

if (!executeMode) {
  // Dry-run: print payloads
  for (const p of payloads) {
    console.log(JSON.stringify({ type: 'engineering', epic: p.epic, issue: p.issue }, null, 2));
  }
  for (const p of businessPayloads) {
    console.log(JSON.stringify({ type: 'business', team: p.task.team, issue: p.issue }, null, 2));
  }
  console.error('\nDry-run complete. Use --execute --team <key> to create issues in Linear.');
  if (businessPayloads.length > 0) {
    console.error(`Business tasks will be created in their respective teams (${[...new Set(businessPayloads.map((p) => p.task.team))].join(', ')}).`);
  }
  process.exit(0);
}

// Execute: create issues in Linear
const client = createLinearClient();
const team = await findTeam(client, teamKey);
if (!team) {
  console.error(`Team not found: ${teamKey}`);
  console.error('Run: npx tsx scripts/linear-discover-team.ts');
  process.exit(1);
}

const todoStateId = await findStateId(client, team.id, 'Todo');
if (!todoStateId) {
  console.error('Could not find "Todo" workflow state. Check your Linear team settings.');
  process.exit(1);
}

// Resolve or create labels
async function resolveLabel(name: string): Promise<string | undefined> {
  try {
    const labels = await client.issueLabels({ filter: { name: { eq: name }, team: { id: { eq: team!.id } } } });
    if (labels.nodes.length > 0) return labels.nodes[0].id;
    // Also check org-level labels
    const orgLabels = await client.issueLabels({ filter: { name: { eq: name }, team: { null: true } } });
    if (orgLabels.nodes.length > 0) return orgLabels.nodes[0].id;
  } catch {
    // label lookup failed, skip
  }
  return undefined;
}

console.log(`Creating issues in Linear team: ${team.key} (${team.name})\n`);

const createdIssues: Array<{ ticketId: string; linearId: string; linearUuid: string; url: string }> = [];

for (const p of payloads) {
  // Resolve label IDs (best-effort, skip labels that don't exist)
  const labelIds: string[] = [];
  for (const labelName of p.issue.labels.slice(0, 10)) {
    const id = await resolveLabel(labelName);
    if (id) labelIds.push(id);
  }

  const issueResult = await client.createIssue({
    teamId: team.id,
    title: p.issue.title,
    description: p.issue.description,
    stateId: todoStateId,
    labelIds: labelIds.length > 0 ? labelIds : undefined,
    ...(projectId ? { projectId } : {})
  });

  const issue = await issueResult.issue;
  if (issue) {
    createdIssues.push({
      ticketId: p.ticket.id,
      linearId: issue.identifier,
      linearUuid: issue.id,
      url: issue.url
    });
    console.log(`  Created: ${issue.identifier} — ${p.issue.title}`);
    console.log(`  URL: ${issue.url}`);
    console.log('');
  } else {
    console.error(`  Failed to create issue for ticket ${p.ticket.id}`);
  }
}

if (projectId) {
  console.log(`All engineering issues linked to project: ${projectId}\n`);
}

// Create blocking relations from depends_on
const uuidByTicketId = new Map(createdIssues.map((c) => [c.ticketId, c.linearUuid]));
let relationsCreated = 0;

for (const p of payloads) {
  const deps = p.ticket.depends_on ?? [];
  if (deps.length === 0) continue;

  const thisUuid = uuidByTicketId.get(p.ticket.id);
  if (!thisUuid) continue;

  for (const dep of deps) {
    const depUuid = uuidByTicketId.get(dep);
    if (!depUuid) continue;

    try {
      // dep blocks this ticket (dependency must complete before dependent can start)
      await client.createIssueRelation({
        issueId: depUuid,
        relatedIssueId: thisUuid,
        type: 'blocks' as any
      });
      relationsCreated++;
    } catch (err: any) {
      console.error(`  Failed to create relation ${dep} blocks ${p.ticket.id}: ${err.message ?? err}`);
    }
  }
}

if (relationsCreated > 0) {
  console.log(`\nCreated ${relationsCreated} blocking relations in Linear.`);
}

// Create business tasks in their respective teams
if (businessPayloads.length > 0) {
  console.log('Creating business tasks:\n');

  for (const p of businessPayloads) {
    const bizTeam = await findTeam(client, p.task.team);
    if (!bizTeam) {
      console.error(`  Skipping ${p.task.id}: team "${p.task.team}" not found`);
      continue;
    }

    const bizTodoStateId = await findStateId(client, bizTeam.id, 'Todo');
    if (!bizTodoStateId) {
      console.error(`  Skipping ${p.task.id}: "Todo" state not found in team ${p.task.team}`);
      continue;
    }

    const labelIds: string[] = [];
    for (const labelName of p.issue.labels.slice(0, 10)) {
      const id = await resolveLabel(labelName);
      if (id) labelIds.push(id);
    }

    const issueResult = await client.createIssue({
      teamId: bizTeam.id,
      title: p.issue.title,
      description: p.issue.description,
      stateId: bizTodoStateId,
      labelIds: labelIds.length > 0 ? labelIds : undefined,
      ...(projectId ? { projectId } : {})
    });

    const issue = await issueResult.issue;
    if (issue) {
      createdIssues.push({
        ticketId: p.task.id,
        linearId: issue.identifier,
        url: issue.url
      });
      console.log(`  Created: ${issue.identifier} — ${p.issue.title} (team: ${p.task.team})`);
      console.log(`  URL: ${issue.url}`);
      console.log('');
    } else {
      console.error(`  Failed to create issue for business task ${p.task.id}`);
    }
  }
}

// Write back Linear-assigned IDs into the manifest
const idMap = new Map(createdIssues.map((c) => [c.ticketId, c.linearId]));
let manifestUpdated = false;

for (const ticket of manifest.tickets) {
  const newId = idMap.get(ticket.id);
  if (newId && newId !== ticket.id) {
    ticket.id = newId;
    manifestUpdated = true;
  }
  if (ticket.depends_on) {
    ticket.depends_on = ticket.depends_on.map((dep) => idMap.get(dep) ?? dep);
  }
}

for (const task of manifest.business_tasks ?? []) {
  const newId = idMap.get(task.id);
  if (newId && newId !== task.id) {
    task.id = newId;
    manifestUpdated = true;
  }
  if (task.depends_on) {
    task.depends_on = task.depends_on.map((dep) => idMap.get(dep) ?? dep);
  }
}

// IMPORTANT: This is the LAST write to the manifest. After commit+push to main,
// the manifest is immutable. All subsequent state lives in per-ticket review packets
// (review-packet-{TICKET_ID}.json), not in the manifest.
if (manifestUpdated) {
  fs.writeFileSync(path.resolve(manifestPath), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`\nManifest updated: ticket IDs now match Linear identifiers.`);
}

console.log('\nSummary:');
console.log(JSON.stringify(createdIssues, null, 2));
