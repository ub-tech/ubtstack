
# kickoff

Run the full sandwich workflow while preserving the original repo shell.

## Phase 0 — Intake

Start from the strongest available planning inputs:
- PRD
- architecture guidance
- feature brief
- bug report / incident
- user prompt

If both a PRD and architecture guidance are present:
- treat the PRD as the product contract
- treat architecture guidance as implementation context and constraint input
- surface conflicts explicitly before planning proceeds

## Phase 0.5 — Skill composition (before CEO review)

After intake, determine which pre-planning skills would strengthen this session. Use AskUserQuestion:

**"What kind of work is this?"**

1. **New feature (no PRD yet)** — Need to discover requirements from scratch
2. **New feature (have PRD/brief)** — Have planning inputs, ready to review
3. **Bug fix / incident** — Starting from a bug report or production issue
4. **Architecture improvement** — Looking for structural improvements, not a specific feature
5. **Refactor** — Know what to restructure, need a safe plan

Based on selection, run the recommended skill chain:

### Chain 1: New feature (no PRD)
1. Run `/write-a-prd` — interactive interview to produce a structured PRD
2. (Optional) Ask: "Want to stress-test this PRD before committing?" If yes → run `/grill-me`
3. Continue to Phase 1 with the PRD as intake. Recommend **SCOPE EXPANSION** or **SELECTIVE EXPANSION** mode.

### Chain 2: New feature (have PRD)
1. (Optional) Ask: "Want to stress-test this plan before committing?" If yes → run `/grill-me`
2. Continue to Phase 1 directly. Recommend **SELECTIVE EXPANSION** mode.

### Chain 3: Bug fix
1. Run `/triage` — investigate the codebase, identify root cause, create a Linear issue with TDD fix plan
2. Continue to Phase 1 with the triage output as intake. Recommend **HOLD SCOPE** mode.

### Chain 4: Architecture improvement
1. Run `/discover-architecture` — explore for architectural friction and deep module opportunities
2. If the user picks a candidate → (Optional) run `/plan-refactor` for commit-level breakdown
3. Continue to Phase 1 with the RFC/refactor plan as intake. Recommend **HOLD SCOPE** mode.

### Chain 5: Refactor
1. Run `/plan-refactor` — interactive interview, test coverage audit, tiny commit breakdown
2. (Optional) Ask: "Is this big enough to need full CEO + eng review, or can it go directly to tickets?" If direct → skip to `/plan-to-linear`. If full review → continue to Phase 1.
3. Recommend **HOLD SCOPE** mode.

### Standalone skills (available any time)
- `/grill-me` — can be invoked at any point during planning to pressure-test a specific decision
- `/tdd` — interactive TDD session for hands-on implementation (outside the planning pipeline)

**Skip this phase entirely** if the user already has strong planning inputs and wants to proceed directly to CEO review.

## Phase 1 — Mode selection + CEO planning

Before running the full CEO review, present the scope mode selection:

AskUserQuestion: "How should we approach this plan's scope?"

1. **SCOPE EXPANSION:** Dream big. Push scope up. Build the cathedral. (Recommended for greenfield features)
2. **SELECTIVE EXPANSION:** Hold current scope as baseline, surface expansion opportunities one-by-one for cherry-picking. Neutral recommendations. (Recommended for feature enhancements / iterations)
3. **HOLD SCOPE:** Accept the plan's scope. Maximum rigor. No expansions. (Recommended for bug fixes, hotfixes, refactors)
4. **SCOPE REDUCTION:** The plan is overbuilt. Propose the minimal version. (Recommended when plan touches >15 files)

After the user selects a mode, run `/plan-ceo-review` with the selected mode as context. The CEO review should skip re-asking at Step 0F.

The CEO step may ingest:
- PRD text
- architecture notes
- competitive or business rationale
- compliance constraints
- release urgency or incident context

But it must output a **product-level decision**:
- problem
- goal
- user/stakeholder
- non-goals
- success criteria
- fixed constraints
- key business risks

## Phase 2 — Engineering planning

Run `/plan-eng-review`.

The engineering step converts the approved product direction into:
- repo-level plan
- interface changes
- dependency graph
- rollout notes
- test strategy
- QA requirements

## Phase 3 — Manifest

Run `/plan-to-linear` to write `.claude/state/planning-manifest.json`.
That manifest must include ticket-level test requirements.

## Phase 4 — Handoff

Symphony imports the manifest, populates Linear, creates workspaces, and dispatches Codex.

## Phase 5 — Review re-entry

After implementation, re-enter through `/review` (code review + QA gate validation), then `/ship`.
