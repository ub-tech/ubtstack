#!/usr/bin/env node
/**
 * Generate a strict Codex execution prompt from a planning manifest ticket.
 * Required test categories and QA gates are auto-computed from change classification.
 * Usage:
 *   node scripts/generate-codex-prompt.ts .claude/state/planning-manifest.json ENG-101
 */

import fs from 'fs';
import path from 'path';

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

type PlanningManifest = {
  feature_id: string;
  title: string;
  summary: string;
  source?: {
    planning_inputs?: {
      prd_refs?: string[];
      architecture_refs?: string[];
      other_inputs?: string[];
    };
  };
  product_review?: {
    problem?: string;
    goal?: string;
    non_goals?: string[];
    fixed_constraints?: string[];
  };
  engineering_review?: {
    architecture_notes?: string[];
    risks?: string[];
    qa_strategy?: string[];
    default_test_policy?: { always?: string[] };
    default_qa_policy?: { always?: string[] };
  };
  existing_code_context?: {
    modules?: string[];
    current_interfaces?: string[];
    current_tests?: string[];
    known_risks?: string[];
    related_prs?: string[];
  };
  tickets: Ticket[];
};

type Ticket = {
  id: string;
  title: string;
  repo: string;
  type?: string;
  priority?: string;
  depends_on?: string[];
  labels?: string[];
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

function usageAndExit(): never {
  console.error('Usage: node scripts/generate-codex-prompt.ts <manifest-path> <ticket-id>');
  process.exit(1);
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function derive(ticket: Ticket, manifest: PlanningManifest) {
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

  return {
    required: uniq([...(ticket.required_test_categories ?? []), ...required]),
    conditional: uniq([...(ticket.conditional_test_categories ?? []), ...conditional]),
    qa: uniq([...(ticket.qa_requirements ?? []), ...(manifest.engineering_review?.qa_strategy ?? []), ...qa])
  };
}

const manifestPath = process.argv[2];
const ticketId = process.argv[3];
if (!manifestPath || !ticketId) usageAndExit();

const raw = fs.readFileSync(path.resolve(manifestPath), 'utf8');
const manifest = JSON.parse(raw) as PlanningManifest;
const ticket = manifest.tickets.find((t) => t.id === ticketId);
if (!ticket) {
  console.error(`Ticket not found: ${ticketId}`);
  process.exit(2);
}
const derived = derive(ticket, manifest);
const c = ticket.change_classification ?? {};

const prompt = `# Codex Execution Brief

You are implementing a bounded ticket from an AI-native SDLC.
Stay within scope, preserve existing architecture, and escalate ambiguity instead of inventing architecture.

## Feature
- Feature ID: ${manifest.feature_id}
- Feature Title: ${manifest.title}
- Feature Summary: ${manifest.summary}

## Ticket
- Ticket ID: ${ticket.id}
- Ticket Title: ${ticket.title}
- Repo: ${ticket.repo}
- Type: ${ticket.type ?? 'unspecified'}
- Priority: ${ticket.priority ?? 'unspecified'}
- Labels: ${(ticket.labels ?? []).join(', ') || 'none'}
- Depends On: ${(ticket.depends_on ?? []).join(', ') || 'none'}

## Product Context
- Problem: ${manifest.product_review?.problem ?? 'n/a'}
- Goal: ${manifest.product_review?.goal ?? 'n/a'}
- Non-Goals:
${(manifest.product_review?.non_goals ?? ['none']).map((x) => `  - ${x}`).join('\n')}
- Fixed Constraints:
${(manifest.product_review?.fixed_constraints ?? ['none']).map((x) => `  - ${x}`).join('\n')}

## Planning Inputs
- PRD Refs:
${(manifest.source?.planning_inputs?.prd_refs ?? ['none']).map((x) => `  - ${x}`).join('\n')}
- Architecture Refs:
${(manifest.source?.planning_inputs?.architecture_refs ?? ['none']).map((x) => `  - ${x}`).join('\n')}
- Other Inputs:
${(manifest.source?.planning_inputs?.other_inputs ?? ['none']).map((x) => `  - ${x}`).join('\n')}

## Existing Code Context: inspect before editing
- Feature-level Modules:
${(manifest.existing_code_context?.modules ?? ['none']).map((x) => `  - ${x}`).join('\n')}
- Ticket-specific Modules:
${(ticket.existing_code_context?.modules ?? ['none']).map((x) => `  - ${x}`).join('\n')}
- Current Interfaces:
${([... (manifest.existing_code_context?.current_interfaces ?? []), ...(ticket.existing_code_context?.interfaces ?? [])].length ? [...(manifest.existing_code_context?.current_interfaces ?? []), ...(ticket.existing_code_context?.interfaces ?? [])] : ['none']).map((x) => `  - ${x}`).join('\n')}
- Existing Tests to inspect first:
${([... (manifest.existing_code_context?.current_tests ?? []), ...(ticket.existing_code_context?.current_tests ?? [])].length ? [...(manifest.existing_code_context?.current_tests ?? []), ...(ticket.existing_code_context?.current_tests ?? [])] : ['none']).map((x) => `  - ${x}`).join('\n')}
- Known Risks:
${([... (manifest.existing_code_context?.known_risks ?? []), ...(manifest.engineering_review?.risks ?? []), ...(ticket.existing_code_context?.notes ?? [])].length ? [...(manifest.existing_code_context?.known_risks ?? []), ...(manifest.engineering_review?.risks ?? []), ...(ticket.existing_code_context?.notes ?? [])] : ['none']).map((x) => `  - ${x}`).join('\n')}

## Scope
${(ticket.scope ?? ['none']).map((x) => `- ${x}`).join('\n')}

## Implementation Guidance
${([...(manifest.engineering_review?.architecture_notes ?? []), ...(ticket.implementation_guidance ?? [])].length ? [...(manifest.engineering_review?.architecture_notes ?? []), ...(ticket.implementation_guidance ?? [])] : ['none']).map((x) => `- ${x}`).join('\n')}

## Allowed Paths
${(ticket.allowed_paths?.length === 1 && ticket.allowed_paths[0] === '**') ? 'No restrictions — all paths in the target repo are allowed.' : (ticket.allowed_paths ?? ['none']).map((x) => `- ${x}`).join('\n')}

## Acceptance Criteria
${(ticket.acceptance_criteria ?? ['none']).map((x) => `- [ ] ${x}`).join('\n')}

## Change Classification
- Domain Logic Changed: ${c.domain_logic_changed ? 'yes' : 'no'}
- Module Boundary Changed: ${c.module_boundary_changed ? 'yes' : 'no'}
- API Contract Changed: ${c.api_contract_changed ? 'yes' : 'no'}
- User Workflow Changed: ${c.user_workflow_changed ? 'yes' : 'no'}
- Throughput / Latency Path Changed: ${c.throughput_or_latency_path_changed ? 'yes' : 'no'}
- Trust Boundary or External Input Changed: ${c.trust_boundary_or_external_input_changed ? 'yes' : 'no'}
- Bug Fix / Regression Risk: ${c.bug_fix_or_regression_risk ? 'yes' : 'no'}
- Operational Behavior Changed: ${c.operational_behavior_changed ? 'yes' : 'no'}

## Auto-Enforced Required Test Categories
${derived.required.map((x) => `- ${x}`).join('\n')}

## Auto-Enforced Conditional Test Categories
${(derived.conditional.length ? derived.conditional : ['none']).map((x) => `- ${x}`).join('\n')}

## Auto-Enforced QA Requirements
${derived.qa.map((x) => `- ${x}`).join('\n')}

## Test Commands
${(ticket.test_commands ?? ['none']).map((x) => `- ${x}`).join('\n')}

## Deliverables
${(ticket.deliverables ?? ['none']).map((x) => `- ${x}`).join('\n')}

## Mandatory Execution Rules
1. Inspect the referenced existing code and tests before editing.
2. Extend current patterns where reasonable; do not rewrite unrelated architecture.
3. Generate and run all Auto-Enforced Required Test Categories.
4. For each Auto-Enforced Conditional Test Category, either implement it or explain clearly why it does not apply.
5. Include happy-path, boundary, error-path, and regression coverage where applicable.
6. If an API or workflow changes, add the corresponding API/system tests instead of only unit tests.
7. If you hit ambiguity in interfaces, invariants, or product intent, stop and escalate.
8. If required QA evidence is missing, call it out explicitly in the output.

## Required Output
Provide:
- implementation summary
- files changed
- tests added or updated by category
- commands run and results
- unresolved questions
- explicit note for every skipped conditional test category
- explicit note for every QA requirement not yet completed

## Escalation Rule
${ticket.escalation_rule ?? 'If architecture or scope is ambiguous, stop and return to planning.'}
`;

process.stdout.write(prompt);
