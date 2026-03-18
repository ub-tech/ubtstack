
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
