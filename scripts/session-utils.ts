/**
 * Session state types and utilities for ubtstack session persistence.
 *
 * Shared by validate-session-state.ts and consumed by kickoff.md directives.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// --- Types ---

export type SessionMode = 'spec_only' | 'pipeline_only' | 'full';

export type ReviewStatus = 'not_started' | 'in_progress' | 'completed' | 'approved' | 'rejected';

export type LedgerEntry = {
  question_id: string;
  summary: string;
  status: 'resolved' | 'pending' | 'skipped';
  risk?: string;
  source?: string;
};

export type ReviewState = {
  status: ReviewStatus;
  interrogation_ledger: LedgerEntry[];
  approval?: 'approved' | 'approved_with_modifications' | 'rejected_revisit' | 'rejected_rethink' | null;
  hard_restrictions: string[];
};

export type CeoReviewState = ReviewState & {
  session_goals: string[];
  non_goals: string[];
  constraints: string[];
};

export type EngReviewState = ReviewState & {
  scope_decision?: 'scope_reduction' | 'big_change' | 'small_change' | null;
  interfaces_impacted: string[];
  components_impacted: string[];
  success_criteria: string[];
};

// --- Seed Artifact types ---

export type SeedArtifact = {
  path: string;        // relative path from project root
  label: string;       // filename without extension, for display
};

// --- Skill Pack & Pipeline types ---

export type SkillPackRef = {
  name: string;
  path: string;
  description: string;
};

export type PipelinePhase = {
  id: string;
  label: string;
  type: 'builtin' | 'external';
  skill_path?: string;    // absolute or relative path to SKILL.md (external only)
  pack?: string;          // source pack name (external only)
  replaces?: string;      // which default phase this replaced, if any
};

export const DEFAULT_PIPELINE: PipelinePhase[] = [
  { id: 'prerequisites', label: 'Prerequisites', type: 'builtin' },
  { id: 'intake', label: 'Intake & Product Anchor', type: 'builtin' },
  { id: 'skill_composition', label: 'Skill Composition', type: 'builtin' },
  { id: 'ceo_review', label: 'CEO Review', type: 'builtin' },
  { id: 'eng_review', label: 'Eng Review', type: 'builtin' },
  { id: 'manifest', label: 'Manifest', type: 'builtin' },
  { id: 'handoff', label: 'Handoff', type: 'builtin' },
  { id: 'review_reentry', label: 'Review Re-entry', type: 'builtin' },
];

export type SessionState = {
  session_version: '1.0';
  session_id: string;
  created_at: string;
  updated_at: string;
  mode: SessionMode;
  current_phase: string;
  current_step: string;
  work_type: 1 | 2 | 3 | 4 | 5 | null;
  scope_mode: 'SCOPE_EXPANSION' | 'SELECTIVE_EXPANSION' | 'HOLD_SCOPE' | 'SCOPE_REDUCTION' | null;
  product_synopsis: string | null;
  seed_artifacts: SeedArtifact[];
  briefs_skipped: boolean;
  activated_packs: SkillPackRef[];
  pipeline: PipelinePhase[];
  external_phase_state: Record<string, Record<string, unknown>>;
  ceo_review: CeoReviewState;
  eng_review: EngReviewState;
  manifest_partial: Record<string, unknown>;
  pipeline_entry_point: string | null;
};

// --- Utilities ---

/**
 * Generate a session ID: YYYYMMDD-HHmmss-<8 hex chars>
 */
export function generateSessionId(): string {
  const now = new Date();
  const date = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDHHmmss
  const hex = crypto.randomBytes(4).toString('hex');
  return `${date.slice(0, 8)}-${date.slice(8, 14)}-${hex}`;
}

/**
 * Find the most recent session file in a directory by updated_at timestamp.
 * Returns the parsed SessionState and file path, or null if none found.
 */
export function findLatestSession(stateDir: string): { state: SessionState; filePath: string } | null {
  if (!fs.existsSync(stateDir)) return null;

  const files = fs.readdirSync(stateDir).filter(
    (f) => f.startsWith('session-') && f.endsWith('.json')
  );

  if (files.length === 0) return null;

  let latest: { state: SessionState; filePath: string } | null = null;
  let latestTime = '';

  for (const file of files) {
    const filePath = path.join(stateDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const state = JSON.parse(raw) as SessionState;
      if (state.updated_at && state.updated_at > latestTime) {
        latestTime = state.updated_at;
        latest = { state, filePath };
      }
    } catch {
      // Skip malformed files
    }
  }

  return latest;
}

/**
 * Create an initial empty session state.
 */
export function createInitialState(mode: SessionMode): SessionState {
  const now = new Date().toISOString();
  return {
    session_version: '1.0',
    session_id: generateSessionId(),
    created_at: now,
    updated_at: now,
    mode,
    current_phase: 'mode_selection',
    current_step: 'initial',
    work_type: null,
    scope_mode: null,
    product_synopsis: null,
    seed_artifacts: [],
    briefs_skipped: false,
    activated_packs: [],
    pipeline: DEFAULT_PIPELINE,
    external_phase_state: {},
    ceo_review: {
      status: 'not_started',
      interrogation_ledger: [],
      approval: null,
      hard_restrictions: [],
      session_goals: [],
      non_goals: [],
      constraints: [],
    },
    eng_review: {
      status: 'not_started',
      interrogation_ledger: [],
      approval: null,
      hard_restrictions: [],
      scope_decision: null,
      interfaces_impacted: [],
      components_impacted: [],
      success_criteria: [],
    },
    manifest_partial: {},
    pipeline_entry_point: null,
  };
}
