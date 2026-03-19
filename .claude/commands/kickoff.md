
# kickoff

Run the full sandwich workflow while preserving the original repo shell.

## Phase 0 — Prerequisites

Before anything else, check for the two required anchor documents:

### Product Brief Check
```bash
cat .claude/product-brief.md 2>/dev/null | head -5
```

If the product brief does not exist or is empty:
- Tell the user: **"No product brief found. This is required to ground all planning in the product's context. Let's create one first."**
- Run `/create-product-brief`
- After it completes, resume from Phase 0.

### Architecture Brief Check
```bash
cat .claude/architecture-brief.md 2>/dev/null | head -5
```

If the architecture brief does not exist or is empty:
- Tell the user: **"No architecture brief found. This is required to map processes, interfaces, and components. Let's create one first."**
- Run `/create-architecture-brief`
- After it completes, resume from Phase 0.

## Phase 0.5 — Intake & Product Anchor

### Read the product brief
Read `.claude/product-brief.md` in full. Generate a structured product synopsis:

**Format:** "[Product Name] helps [target users from product brief] solve [problem statement] by [strategy summarized]. Success is measured by [PG-xxx metrics referenced]."

Present this to the user: **"Here's my understanding of the product. Please confirm this is accurate before we proceed:"**

Display the synopsis. Wait for confirmation. If the user corrects anything, update the synopsis and re-confirm. Do NOT proceed until the user confirms.

### Read the architecture brief
Read `.claude/architecture-brief.md` in full. Note the PROC-xxx, IF-xxx, and COMP-xxx registry for use in later phases.

### Intake
Accept the strongest available planning inputs:
- PRD
- architecture guidance
- feature brief
- bug report / incident
- user prompt

If both a PRD and architecture guidance are present:
- treat the PRD as the product contract
- treat architecture guidance as implementation context and constraint input
- surface conflicts explicitly before planning proceeds

### External drivers (required question)
Ask: **"Are there any external references driving this change? (competitor moves, customer feedback, market research, regulatory changes, incidents, related open Linear tickets)"**

Capture answers for the `external_drivers` field in the manifest.

## Phase 1 — Skill Composition (before CEO review)

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
3. Continue to Phase 2 with the PRD as intake. Recommend **SCOPE EXPANSION** or **SELECTIVE EXPANSION** mode.

### Chain 2: New feature (have PRD)
1. (Optional) Ask: "Want to stress-test this plan before committing?" If yes → run `/grill-me`
2. Continue to Phase 2 directly. Recommend **SELECTIVE EXPANSION** mode.

### Chain 3: Bug fix
1. Run `/triage` — investigate the codebase, identify root cause, create a Linear issue with TDD fix plan
2. Continue to Phase 2 with the triage output as intake. Recommend **HOLD SCOPE** mode.

### Chain 4: Architecture improvement
1. Run `/discover-architecture` — explore for architectural friction and deep module opportunities
2. If the user picks a candidate → (Optional) run `/plan-refactor` for commit-level breakdown
3. Continue to Phase 2 with the RFC/refactor plan as intake. Recommend **HOLD SCOPE** mode.

### Chain 5: Refactor
1. Run `/plan-refactor` — interactive interview, test coverage audit, tiny commit breakdown
2. (Optional) Ask: "Is this big enough to need full CEO + eng review, or can it go directly to tickets?" If direct → skip to `/plan-to-linear`. If full review → continue to Phase 2.
3. Recommend **HOLD SCOPE** mode.

### Standalone skills (available any time)
- `/grill-me` — can be invoked at any point during planning to pressure-test a specific decision
- `/tdd` — interactive TDD session for hands-on implementation (outside the planning pipeline)

**Skip this phase entirely** if the user already has strong planning inputs and wants to proceed directly to CEO review.

## Phase 2 — Mode Selection + CEO Planning

Before running the full CEO review, present the scope mode selection:

AskUserQuestion: "How should we approach this plan's scope?"

1. **SCOPE EXPANSION:** Dream big. Push scope up. Build the cathedral. (Recommended for greenfield features)
2. **SELECTIVE EXPANSION:** Hold current scope as baseline, surface expansion opportunities one-by-one for cherry-picking. Neutral recommendations. (Recommended for feature enhancements / iterations)
3. **HOLD SCOPE:** Accept the plan's scope. Maximum rigor. No expansions. (Recommended for bug fixes, hotfixes, refactors)
4. **SCOPE REDUCTION:** The plan is overbuilt. Propose the minimal version. (Recommended when plan touches >15 files)

After the user selects a mode, run `/plan-ceo-review` with the selected mode as context. The CEO review will independently verify briefs exist and confirm the product anchor statement with the user before beginning interrogation. The CEO review should skip re-asking mode selection (Phase 2 mode selection).

Pass the confirmed product synopsis and the product brief's PG-xxx goals and TV-xxx verticals as context. The CEO review must explain how this session's work helps the product's target users solve their stated problems — not just solve the immediate feature problem.

The CEO step must output a **product-level decision**:
- product synopsis confirmation
- session problem (specific to this kickoff)
- session goal
- target user impact (grounded in product brief personas)
- session business goals (BIZ-xxx)
- session non-goals
- constraints (merged — product, engineering, security, compliance)
- key business risks
- thin verticals addressed (TV-xxx references)
- product goals advanced (PG-xxx references)

## Phase 3 — Engineering Planning

Run `/plan-eng-review`.

The engineering review will independently verify briefs exist and confirm both product and architecture anchor statements before beginning interrogation.

Pass the architecture brief's PROC-xxx, IF-xxx, and COMP-xxx registry as context. The engineering review must:
- Identify which IF-xxx interfaces are impacted and how
- Identify which COMP-xxx components are modified and what new unit tests are needed
- Produce session-level risks (SR-xxx) and link to architecture-level risks (AR-xxx) where applicable
- Define ENG-xxx engineering success criteria with traceability to PG-xxx and optional BIZ-xxx
- Include time estimates for tickets (hours for a human coder)

The engineering step converts the approved product direction into:
- repo-level plan
- interfaces impacted (IF-xxx with change detail)
- components impacted (COMP-xxx with change detail + test plan)
- engineering success criteria (ENG-xxx)
- dependency graph
- test traceability matrix (planned)
- constraints (appended to CEO constraints)
- risks (SR-xxx linked to AR-xxx)

## Phase 4 — Manifest

Run `/plan-to-linear` to write `.claude/state/planning-manifest.json`.
That manifest must use the v2 template and include:
- product context (synopsis, PG-xxx, TV-xxx)
- session goals (BIZ-xxx)
- engineering criteria (ENG-xxx)
- constraints (C-xxx)
- test traceability matrix per ticket
- flat TV tickets (no sub-tickets)
- time estimates
- attestation requirements

## Phase 5 — Handoff

Symphony imports the manifest, populates Linear, creates workspaces, and dispatches Codex.

## Phase 6 — Review Re-entry

After implementation, run `/ship` (structural code review + CI validation + PR creation). The human operator must create a CI attestation using `scripts/create-attestation.ts --stage CI` before merge is permitted.

After tickets are merged and tagged, run `/deploy` for tag-based CD testing across all tickets in the release. The human operator creates CD attestations during `/deploy`.
