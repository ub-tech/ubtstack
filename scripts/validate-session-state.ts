#!/usr/bin/env node
/**
 * Validate a session state file for structural correctness and consistency.
 *
 * Usage:
 *   npx tsx scripts/validate-session-state.ts <session-state-path>
 *
 * Exit codes:
 *   0 = validation passed
 *   1 = validation failed
 *   2 = usage or file error
 */

import fs from 'fs';
import path from 'path';
import type { SessionState, SessionMode, ReviewStatus, PipelinePhase, SeedArtifact } from './session-utils.js';

function usageAndExit(): never {
  console.error('Usage: npx tsx scripts/validate-session-state.ts <session-state-path>');
  process.exit(2);
}

const VALID_MODES: SessionMode[] = ['spec_only', 'pipeline_only', 'full'];
const VALID_REVIEW_STATUSES: ReviewStatus[] = ['not_started', 'in_progress', 'completed', 'approved', 'rejected'];
const VALID_WORK_TYPES = [1, 2, 3, 4, 5, null];
const VALID_SCOPE_MODES = ['SCOPE_EXPANSION', 'SELECTIVE_EXPANSION', 'HOLD_SCOPE', 'SCOPE_REDUCTION', null];
const VALID_LEDGER_STATUSES = ['resolved', 'pending', 'skipped'];
const VALID_CEO_APPROVALS = ['approved', 'approved_with_modifications', 'rejected_revisit', 'rejected_rethink', null];
const VALID_ENG_APPROVALS = ['approved', 'approved_with_modifications', 'rejected_revisit', 'rejected_rethink', null];
const VALID_ENG_SCOPE_DECISIONS = ['scope_reduction', 'big_change', 'small_change', null];

const sessionPath = process.argv[2];
if (!sessionPath) usageAndExit();

let state: SessionState;
try {
  const raw = fs.readFileSync(path.resolve(sessionPath), 'utf8');
  state = JSON.parse(raw) as SessionState;
} catch (err) {
  console.error(`Failed to read or parse session file: ${err}`);
  process.exit(2);
}

const errors: string[] = [];

// --- Required fields ---

if (state.session_version !== '1.0') {
  errors.push(`session_version must be "1.0", got "${state.session_version}"`);
}

if (!state.session_id || typeof state.session_id !== 'string') {
  errors.push('session_id is required and must be a string');
}

if (!state.created_at || typeof state.created_at !== 'string') {
  errors.push('created_at is required and must be an ISO string');
}

if (!state.updated_at || typeof state.updated_at !== 'string') {
  errors.push('updated_at is required and must be an ISO string');
}

if (state.created_at && state.updated_at && state.updated_at < state.created_at) {
  errors.push('updated_at must be >= created_at');
}

// --- Enum validation ---

if (!VALID_MODES.includes(state.mode)) {
  errors.push(`mode must be one of ${VALID_MODES.join(', ')}, got "${state.mode}"`);
}

if (!VALID_WORK_TYPES.includes(state.work_type)) {
  errors.push(`work_type must be 1-5 or null, got "${state.work_type}"`);
}

if (!VALID_SCOPE_MODES.includes(state.scope_mode)) {
  errors.push(`scope_mode must be one of ${VALID_SCOPE_MODES.filter(Boolean).join(', ')} or null, got "${state.scope_mode}"`);
}

// --- Phase/step ---

if (!state.current_phase || typeof state.current_phase !== 'string') {
  errors.push('current_phase is required');
}

if (!state.current_step || typeof state.current_step !== 'string') {
  errors.push('current_step is required');
}

// --- Skill packs & pipeline validation ---

if (!Array.isArray((state as any).activated_packs)) {
  errors.push('activated_packs must be an array');
} else {
  for (const pack of (state as any).activated_packs) {
    if (!pack.name || typeof pack.name !== 'string') {
      errors.push('Each activated_pack must have a string "name"');
    }
    if (!pack.path || typeof pack.path !== 'string') {
      errors.push('Each activated_pack must have a string "path"');
    }
  }
}

if (!Array.isArray((state as any).pipeline)) {
  errors.push('pipeline must be an array');
} else {
  const pipeline = (state as any).pipeline as PipelinePhase[];
  if (pipeline.length === 0) {
    errors.push('pipeline must be a non-empty array');
  }
  for (const phase of pipeline) {
    if (!phase.id || typeof phase.id !== 'string') {
      errors.push('Each pipeline phase must have a string "id"');
    }
    if (!phase.label || typeof phase.label !== 'string') {
      errors.push('Each pipeline phase must have a string "label"');
    }
    if (phase.type !== 'builtin' && phase.type !== 'external') {
      errors.push(`Pipeline phase "${phase.id}" type must be "builtin" or "external", got "${phase.type}"`);
    }
    if (phase.type === 'external') {
      if (!phase.skill_path || typeof phase.skill_path !== 'string') {
        errors.push(`External pipeline phase "${phase.id}" must have a string "skill_path"`);
      }
      if (!phase.pack || typeof phase.pack !== 'string') {
        errors.push(`External pipeline phase "${phase.id}" must have a string "pack"`);
      }
    }
  }
}

if ((state as any).external_phase_state !== undefined && (state as any).external_phase_state !== null) {
  if (typeof (state as any).external_phase_state !== 'object' || Array.isArray((state as any).external_phase_state)) {
    errors.push('external_phase_state must be an object');
  }
}

// --- Seed artifacts & briefs_skipped validation ---

if (!Array.isArray((state as any).seed_artifacts)) {
  errors.push('seed_artifacts must be an array');
} else {
  for (const artifact of (state as any).seed_artifacts as SeedArtifact[]) {
    if (!artifact.path || typeof artifact.path !== 'string') {
      errors.push('Each seed_artifact must have a string "path"');
    }
    if (!artifact.label || typeof artifact.label !== 'string') {
      errors.push('Each seed_artifact must have a string "label"');
    }
  }
}

if (typeof (state as any).briefs_skipped !== 'boolean') {
  errors.push('briefs_skipped must be a boolean');
}

// Cross-check: can't skip briefs with no seed artifacts
if ((state as any).briefs_skipped === true && Array.isArray((state as any).seed_artifacts) && (state as any).seed_artifacts.length === 0) {
  errors.push('briefs_skipped cannot be true when seed_artifacts is empty');
}

// --- CEO review validation ---

if (!state.ceo_review) {
  errors.push('ceo_review object is required');
} else {
  if (!VALID_REVIEW_STATUSES.includes(state.ceo_review.status)) {
    errors.push(`ceo_review.status must be one of ${VALID_REVIEW_STATUSES.join(', ')}`);
  }

  if (!Array.isArray(state.ceo_review.interrogation_ledger)) {
    errors.push('ceo_review.interrogation_ledger must be an array');
  } else {
    for (const entry of state.ceo_review.interrogation_ledger) {
      if (!entry.question_id) errors.push('Ledger entry missing question_id in ceo_review');
      if (!VALID_LEDGER_STATUSES.includes(entry.status)) {
        errors.push(`Invalid ledger status "${entry.status}" in ceo_review`);
      }
    }
  }

  if (state.ceo_review.approval !== undefined && !VALID_CEO_APPROVALS.includes(state.ceo_review.approval)) {
    errors.push(`ceo_review.approval invalid: "${state.ceo_review.approval}"`);
  }

  if (!Array.isArray(state.ceo_review.hard_restrictions)) {
    errors.push('ceo_review.hard_restrictions must be an array');
  }

  if (!Array.isArray(state.ceo_review.session_goals)) {
    errors.push('ceo_review.session_goals must be an array');
  }

  if (!Array.isArray(state.ceo_review.non_goals)) {
    errors.push('ceo_review.non_goals must be an array');
  }

  if (!Array.isArray(state.ceo_review.constraints)) {
    errors.push('ceo_review.constraints must be an array');
  }
}

// --- Eng review validation ---

if (!state.eng_review) {
  errors.push('eng_review object is required');
} else {
  if (!VALID_REVIEW_STATUSES.includes(state.eng_review.status)) {
    errors.push(`eng_review.status must be one of ${VALID_REVIEW_STATUSES.join(', ')}`);
  }

  if (!Array.isArray(state.eng_review.interrogation_ledger)) {
    errors.push('eng_review.interrogation_ledger must be an array');
  } else {
    for (const entry of state.eng_review.interrogation_ledger) {
      if (!entry.question_id) errors.push('Ledger entry missing question_id in eng_review');
      if (!VALID_LEDGER_STATUSES.includes(entry.status)) {
        errors.push(`Invalid ledger status "${entry.status}" in eng_review`);
      }
    }
  }

  if (state.eng_review.approval !== undefined && !VALID_ENG_APPROVALS.includes(state.eng_review.approval)) {
    errors.push(`eng_review.approval invalid: "${state.eng_review.approval}"`);
  }

  if (state.eng_review.scope_decision !== undefined && !VALID_ENG_SCOPE_DECISIONS.includes(state.eng_review.scope_decision)) {
    errors.push(`eng_review.scope_decision invalid: "${state.eng_review.scope_decision}"`);
  }

  if (!Array.isArray(state.eng_review.hard_restrictions)) {
    errors.push('eng_review.hard_restrictions must be an array');
  }

  if (!Array.isArray(state.eng_review.interfaces_impacted)) {
    errors.push('eng_review.interfaces_impacted must be an array');
  }

  if (!Array.isArray(state.eng_review.components_impacted)) {
    errors.push('eng_review.components_impacted must be an array');
  }

  if (!Array.isArray(state.eng_review.success_criteria)) {
    errors.push('eng_review.success_criteria must be an array');
  }
}

// --- Cross-field consistency checks ---

// eng_review cannot be approved if ceo_review is not_started (for full and spec_only modes)
if (state.mode !== 'pipeline_only') {
  if (
    state.eng_review?.status === 'approved' &&
    state.ceo_review?.status === 'not_started'
  ) {
    errors.push('eng_review cannot be "approved" when ceo_review is "not_started" (in non-pipeline mode)');
  }

  // eng_review cannot be in_progress if ceo_review is not at least completed
  if (
    state.eng_review?.status === 'in_progress' &&
    state.ceo_review?.status === 'not_started'
  ) {
    errors.push('eng_review cannot be "in_progress" when ceo_review is "not_started" (in non-pipeline mode)');
  }
}

// pipeline_only mode should have pipeline_entry_point
if (state.mode === 'pipeline_only' && !state.pipeline_entry_point) {
  errors.push('pipeline_entry_point is required when mode is "pipeline_only"');
}

// --- Output ---

const passed = errors.length === 0;

const summary = {
  session_id: state.session_id,
  mode: state.mode,
  current_phase: state.current_phase,
  current_step: state.current_step,
  validation: {
    passed,
    error_count: errors.length,
    errors,
  },
  state_summary: {
    work_type: state.work_type,
    scope_mode: state.scope_mode,
    seed_artifacts_count: ((state as any).seed_artifacts ?? []).length,
    briefs_skipped: (state as any).briefs_skipped ?? false,
    activated_packs_count: ((state as any).activated_packs ?? []).length,
    pipeline_length: ((state as any).pipeline ?? []).length,
    pipeline_has_external: ((state as any).pipeline ?? []).some((p: any) => p.type === 'external'),
    ceo_review_status: state.ceo_review?.status,
    ceo_ledger_count: state.ceo_review?.interrogation_ledger?.length ?? 0,
    ceo_approval: state.ceo_review?.approval,
    eng_review_status: state.eng_review?.status,
    eng_ledger_count: state.eng_review?.interrogation_ledger?.length ?? 0,
    eng_approval: state.eng_review?.approval,
  },
};

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
process.exit(passed ? 0 : 1);
