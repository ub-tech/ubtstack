#!/usr/bin/env node
/**
 * Validate a review packet against the planning manifest.
 *
 * Usage:
 *   node scripts/validate-review-packet.ts <manifest-path> <review-packet-path>
 *
 * Exit codes:
 *   0 = validation passed
 *   1 = validation failed
 *   2 = usage or file error
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

type Ticket = {
  id: string;
  title: string;
  repo: string;
  allowed_paths?: string[];
  acceptance_criteria?: string[];
  required_test_categories?: string[];
  conditional_test_categories?: string[];
  qa_requirements?: string[];
  change_classification?: ChangeClassification;
};

type Manifest = {
  feature_id: string;
  engineering_review?: {
    default_test_policy?: { always?: string[] };
    default_qa_policy?: { always?: string[] };
    qa_strategy?: string[];
  };
  tickets: Ticket[];
};

// --- Stage-based types (new model) ---

type StageTest = {
  category: string;
  status: 'pass' | 'fail' | 'skip';
  details?: string;
};

type Stage = {
  status: 'pass' | 'fail' | 'pending';
  tests: StageTest[];
};

// --- Legacy types (backwards compat) ---

type LegacyCiQa = {
  completed?: string[];
  notes?: string[];
};

type LegacyCdQa = {
  deferred?: Array<{ item: string; reason: string }>;
  completed?: string[];
  failed?: string[];
  skipped?: string[];
};

type ReviewPacket = {
  feature_id: string;
  ticket_id: string;
  branch?: string;
  pr?: string | { title?: string; url?: string };
  implementation_summary?: {
    files_changed?: string[];
    tests_run?: string[];
    tests_passed?: boolean;
    open_questions?: string[];
    notes?: string[];
    test_matrix?: {
      generated_categories?: string[];
      skipped_categories?: Array<{ category: string; reason: string }>;
      error_path_coverage?: string[];
      // New stage-based format
      ci?: Stage;
      cd?: Stage;
      // Legacy ci_qa/cd_qa format
      ci_qa?: LegacyCiQa;
      cd_qa?: LegacyCdQa;
      // Oldest legacy format
      qa_completed?: string[];
      qa_deferred?: Array<{ item: string; reason: string }>;
      qa_missing?: string[];
      remaining_risks?: string[];
    };
  };
  review_checklist?: string[];
};

// CI-stage test categories
const CI_CATEGORIES = ['build', 'lint', 'unit', 'integration', 'smoke'];
// CD-stage test categories
const CD_CATEGORIES = ['staging_smoke', 'system_e2e', 'regression', 'security', 'fuzz', 'load', 'stress', 'functional_api'];

function usageAndExit(): never {
  console.error('Usage: node scripts/validate-review-packet.ts <manifest-path> <review-packet-path>');
  process.exit(2);
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function derive(ticket: Ticket, manifest: Manifest) {
  const c = ticket.change_classification ?? {};
  const required = new Set<string>(manifest.engineering_review?.default_test_policy?.always ?? []);
  const conditional = new Set<string>();
  const qa = new Set<string>(manifest.engineering_review?.default_qa_policy?.always ?? []);

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

/**
 * Normalize legacy formats into stage-based ci/cd structure.
 */
function normalizeStages(testMatrix: NonNullable<NonNullable<ReviewPacket['implementation_summary']>['test_matrix']>): { ci: Stage; cd: Stage } {
  // Already in new format
  if (testMatrix.ci && testMatrix.cd) {
    return { ci: testMatrix.ci, cd: testMatrix.cd };
  }

  // Legacy ci_qa/cd_qa format
  if (testMatrix.ci_qa || testMatrix.cd_qa) {
    const ciCompleted = testMatrix.ci_qa?.completed ?? [];
    const cdDeferred = testMatrix.cd_qa?.deferred ?? [];
    const cdCompleted = testMatrix.cd_qa?.completed ?? [];
    const cdFailed = testMatrix.cd_qa?.failed ?? [];

    // Map CI completed strings to stage tests
    const ciTests: StageTest[] = ciCompleted.map((item) => ({
      category: item.toLowerCase().replace(/\s+(passes?|clean)$/i, ''),
      status: 'pass' as const
    }));

    // Determine CD status from legacy data
    let cdStatus: 'pass' | 'fail' | 'pending' = 'pending';
    if (cdFailed.length > 0) {
      cdStatus = 'fail';
    } else if (cdCompleted.length > 0 && cdDeferred.length === 0) {
      cdStatus = 'pass';
    }

    const cdTests: StageTest[] = [
      ...cdCompleted.map((item) => ({ category: item, status: 'pass' as const })),
      ...cdFailed.map((item) => ({ category: item, status: 'fail' as const }))
    ];

    return {
      ci: { status: ciTests.length > 0 ? 'pass' : 'pending', tests: ciTests },
      cd: { status: cdStatus, tests: cdTests }
    };
  }

  // Oldest legacy format: qa_completed/qa_deferred
  if (testMatrix.qa_completed || testMatrix.qa_deferred) {
    const qaCompleted = testMatrix.qa_completed ?? [];
    const ciTests: StageTest[] = qaCompleted.map((item) => ({
      category: item,
      status: 'pass' as const
    }));

    return {
      ci: { status: ciTests.length > 0 ? 'pass' : 'pending', tests: ciTests },
      cd: { status: 'pending', tests: [] }
    };
  }

  // No QA data at all
  return {
    ci: { status: 'pending', tests: [] },
    cd: { status: 'pending', tests: [] }
  };
}

function escapeRegex(input: string): string {
  return input.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function globToRegex(glob: string): RegExp {
  const normalized = glob.replace(/^\.\//, '');
  const pattern = '^' + escapeRegex(normalized)
    .replace(/\\\*\\\*/g, '::DOUBLE_STAR::')
    .replace(/\\\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*') + '$';
  return new RegExp(pattern);
}

function pathAllowed(filePath: string, allowed: string[]): boolean {
  const normalized = filePath.replace(/^\.\//, '');
  if (!allowed.length) return true;
  return allowed.some((glob) => globToRegex(glob).test(normalized));
}

function isUnrestricted(allowedPaths: string[]): boolean {
  return allowedPaths.length === 1 && allowedPaths[0] === '**';
}

const manifestPath = process.argv[2];
const packetPath = process.argv[3];
if (!manifestPath || !packetPath) usageAndExit();

let manifest: Manifest;
let packet: ReviewPacket;
try {
  manifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8')) as Manifest;
  packet = JSON.parse(fs.readFileSync(path.resolve(packetPath), 'utf8')) as ReviewPacket;
} catch (err) {
  console.error(String(err));
  process.exit(2);
}

const ticket = manifest.tickets.find((t) => t.id === packet.ticket_id);
if (!ticket) {
  console.error(`Ticket not found in manifest: ${packet.ticket_id}`);
  process.exit(2);
}

const derived = derive(ticket, manifest);
const testMatrix = packet.implementation_summary?.test_matrix;
const generated = testMatrix?.generated_categories ?? [];
const skipped = testMatrix?.skipped_categories ?? [];
const skippedMap = new Map(skipped.map((s) => [s.category, s.reason]));
const filesChanged = packet.implementation_summary?.files_changed ?? [];
const testsRun = packet.implementation_summary?.tests_run ?? [];
const reviewChecklist = packet.review_checklist ?? [];
const allowedPaths = ticket.allowed_paths ?? [];
const unrestricted = isUnrestricted(allowedPaths);

// Normalize to stage-based format
const stages = testMatrix ? normalizeStages(testMatrix) : { ci: { status: 'pending' as const, tests: [] }, cd: { status: 'pending' as const, tests: [] } };
const { ci, cd } = stages;

// --- Validation ---

// CI must pass at completion gate time
const ciPassed = ci.status === 'pass';

// CD must be pending at completion gate time (CD hasn't run yet — expected)
// At /ship time, cd.status must be "pass" — but that's checked by /ship, not here
const cdPending = cd.status === 'pending';
const cdPassed = cd.status === 'pass';
const cdFailed = cd.status === 'fail';

// QA: check that required CI-stage categories have passing tests in ci.tests
const ciTestCategories = new Set(ci.tests.filter(t => t.status === 'pass').map(t => t.category));

// For backwards compat with derived requirements, map derived category names to CI test categories
// derived uses names like "unit", "integration" — CI tests use the same
const missingRequiredTests = derived.required.filter((cat) => !generated.includes(cat));
const conditionalWithoutDisposition = derived.conditional.filter((cat) => !generated.includes(cat) && !skippedMap.has(cat));

// QA requirements: check against CI completed items and CD pending/completed items
const allAccountedQa = new Set<string>();

// CI test passes count as completed QA
for (const t of ci.tests) {
  if (t.status === 'pass') allAccountedQa.add(t.category);
}
// CD tests (if run) count as completed QA
for (const t of cd.tests) {
  if (t.status === 'pass') allAccountedQa.add(t.category);
}
// CD pending = tests haven't run yet, which is expected at completion gate time
// so CD-stage QA items are implicitly accounted for when cd.status === 'pending'
if (cdPending) {
  for (const cat of CD_CATEGORIES) {
    allAccountedQa.add(cat);
  }
  // Also add common QA requirement strings that map to CD-stage items
  allAccountedQa.add('staging smoke pass');
  allAccountedQa.add('system / e2e tests');
  allAccountedQa.add('regression tests');
  allAccountedQa.add('security tests');
  allAccountedQa.add('critical flow verification');
}

const missingQa = derived.qa.filter((item) => !allAccountedQa.has(item));

// Path violations: skip check entirely when paths are unrestricted
const pathViolations = unrestricted ? [] : filesChanged.filter((file) => !pathAllowed(file, allowedPaths));

// Review checklist: only require allowed_paths check when paths are restricted
const baseChecklist = [
  'Confirm acceptance criteria are satisfied',
  'Confirm the test portfolio is adequate for the changed surface'
];
const requiredChecklist = unrestricted
  ? baseChecklist
  : ['Confirm implementation stayed within allowed_paths', ...baseChecklist];
const missingChecklist = requiredChecklist.filter((item) => !reviewChecklist.includes(item));

const acceptanceCriteriaCount = ticket.acceptance_criteria?.length ?? 0;
const commandEvidenceMissing = testsRun.length === 0;
const testsFailed = packet.implementation_summary?.tests_passed === false;

// PR and branch validation
const branch = packet.branch ?? '';
const branchMissing = !branch;
const prUrl = typeof packet.pr === 'string' ? packet.pr : packet.pr?.url ?? '';
const prMissing = !prUrl;
const prReasons: string[] = [];
if (branchMissing) prReasons.push('review packet has no branch');
if (prMissing) prReasons.push('review packet has no pr url');

const passed = [
  ciPassed,
  missingRequiredTests.length === 0,
  conditionalWithoutDisposition.length === 0,
  missingQa.length === 0,
  pathViolations.length === 0,
  !commandEvidenceMissing,
  !testsFailed,
  missingChecklist.length === 0,
  !branchMissing,
  !prMissing
].every(Boolean);

const summary: Record<string, unknown> = {
  feature_id: packet.feature_id,
  ticket_id: packet.ticket_id,
  expected: {
    required_test_categories: derived.required,
    conditional_test_categories: derived.conditional,
    qa_requirements: derived.qa,
    ...(unrestricted ? { allowed_paths: 'unrestricted' } : { allowed_paths: allowedPaths })
  },
  observed: {
    generated_categories: generated,
    skipped_categories: skipped,
    ci: { status: ci.status, test_count: ci.tests.length, tests: ci.tests },
    cd: { status: cd.status, test_count: cd.tests.length, tests: cd.tests },
    files_changed: filesChanged,
    tests_run: testsRun,
    tests_passed: packet.implementation_summary?.tests_passed ?? null,
    review_checklist: reviewChecklist,
    acceptance_criteria_count: acceptanceCriteriaCount,
    branch: branch || null,
    pr_url: prUrl || null
  },
  validation: {
    passed,
    ci_status: ci.status,
    cd_status: cd.status,
    missing_required_test_categories: missingRequiredTests,
    conditional_categories_missing_disposition: conditionalWithoutDisposition,
    missing_qa_requirements: missingQa,
    ...(unrestricted ? {} : { path_violations: pathViolations }),
    tests_run_missing: commandEvidenceMissing,
    tests_failed: testsFailed,
    missing_review_checklist_items: missingChecklist,
    branch_missing: branchMissing,
    pr_missing: prMissing,
    pr_reasons: prReasons
  }
};

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
process.exit(passed ? 0 : 1);
