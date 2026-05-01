
# kickoff

Run the full sandwich workflow while preserving the original repo shell.

---

## Phase -1 — Session Detection

Before anything else, check for existing session state files.

```bash
ls .claude/state/session-*.json 2>/dev/null
```

### If session files found:

1. Validate the most recent session file:
```bash
npx tsx ../ubtstack/scripts/validate-session-state.ts .claude/state/session-<latest>.json
```

2. If validation fails, warn the user and offer to start fresh.

3. If validation passes, read the session file and present a summary:

**"Found session from [date]. Mode: [mode]. CEO review: [status]. Eng review: [status]. Current phase: [phase]."**

If `activated_packs` is non-empty, summarize: "Pipeline: custom ([N] packs active: [pack names]). [list any external phases and their status from external_phase_state]."
If the CEO review has an interrogation ledger, summarize: "CEO interrogation: [N] resolved, [M] pending."
If the Eng review has an interrogation ledger, summarize: "Eng interrogation: [N] resolved, [M] pending."

4. AskUserQuestion with 4 options:

- **A) Continue** — Resume from the next unresolved step. (Recommended)
- **B) Rewind** — Go back to a specific phase and redo from there.
- **C) Start fresh** — Discard this session and begin a new one.
- **D) Edit a decision** — Review and modify a specific decision before continuing.

**If A (Continue):** Load the session state and jump to the `current_phase` / `current_step`. Skip all completed phases.

**If B (Rewind):** AskUserQuestion: "Which phase should we rewind to?" Present completed phases as options. Reset that phase and all subsequent phases in the session state. Save and continue from there.

**If C (Start fresh):** Rename the old session file to `session-<id>.archived.json` and proceed to Phase -0.5.

**If D (Edit):** Present the key decisions from the session (mode, work type, scope mode, CEO approval, eng approval, specific ledger entries). Let the user pick which to edit. After editing, update the session file and continue.

### If no session files found:

Proceed to Phase -0.5.

---

## Phase -0.5 — Mode Selection

```bash
mkdir -p .claude/state
```

AskUserQuestion: **"How would you like to run this session?"**

- **A) Spec / Brief only** — Run through CEO and Eng review. Stop before ticketization. Good for planning without committing to implementation.
- **B) SDLC pipeline only** — Planning is already done. Jump directly to a pipeline entry point. Requires an existing planning manifest or session.
- **C) Full end-to-end** — Run the complete sandwich workflow: plan, review, ticketize, implement, ship. (Recommended)

**If A (spec_only):** Create session file with `mode: "spec_only"`. Proceed to Phase 0.

**If B (pipeline_only):** AskUserQuestion: "Which pipeline entry point?"
- `/plan-to-linear` — Generate tickets from the planning manifest
- `/tdd` — Start TDD implementation on existing tickets
- `/ship` — Run structural review + CI validation + PR

Set `pipeline_entry_point` to the selected value. Create session file with `mode: "pipeline_only"`. **Skip to Phase 4 (Manifest) for `/plan-to-linear`, or Phase 5 (Handoff) for `/tdd` and `/ship`.**

**If C (full):** Create session file with `mode: "full"`. Proceed to Phase 0.

### SAVE CHECKPOINT
Write the initial session state to `.claude/state/session-<id>.json`. Fields: `session_version`, `session_id`, `created_at`, `updated_at`, `mode`, `current_phase: "mode_selection"`, `current_step: "complete"`.

---

## Phase -0.25 — Skill Pack Discovery & Pipeline Composition

### Discover available skill packs

Run the discovery script from the ubtstack directory:
```bash
npx tsx ../ubtstack/scripts/discover-skill-packs.ts "$(pwd)/.."
```

If no external packs are found (exit code 1), skip this phase and use the default pipeline.

If packs are found, present them:

**"Found [N] external skill packs:"**
For each pack: **"[name]** ([skill_count] skills) — [description]"
List 5-8 representative skill names per pack.

### Activate skill packs

AskUserQuestion: **"Which skill packs would you like to activate for this session?"**
(Multi-select. ubtstack core pipeline is always active.)

If the user selects none, skip pipeline composition and use the default pipeline.

### Pipeline composition

If packs are activated, present the default pipeline and available skills:

**"Current pipeline:"**
```
1. Prerequisites
2. Intake & Product Anchor
3. Skill Composition
4. CEO Review (/plan-ceo-review)
5. Eng Review (/plan-eng-review)
6. Manifest (/plan-to-linear)
7. Handoff
8. Review Re-entry
```

**"Available skills from activated packs:"**
List all skills from activated packs, grouped by pack. If the pack has groups (from skillpack.json), use those groupings for display.

**"Describe how you'd like to modify the pipeline, or say 'use default' to keep it as-is."**

Wait for the user's free-form description. Interpret the modifications (insertions, replacements, reordering, removals) and produce the composed pipeline. For each external phase, set:
- `id`: kebab-case skill name (e.g., `content_strategy`)
- `label`: human-readable name (e.g., `Content Strategy`)
- `type`: `"external"`
- `skill_path`: relative path to the skill's SKILL.md (e.g., `../marketingskills/skills/content-strategy/SKILL.md`)
- `pack`: source pack name
- `replaces`: ID of the default phase this replaced, if applicable

Present the composed pipeline back:

**"Here's the composed pipeline:"**
```
1. Prerequisites
2. Competitor Profiling (marketingskills) ← inserted
3. Intake & Product Anchor
4. Skill Composition
5. Content Strategy (marketingskills) ← replaced Eng Review
6. CEO Review (/plan-ceo-review) ← reordered
7. Manifest (/plan-to-linear)
8. Handoff
9. Review Re-entry
```

**"Does this look right?"** Wait for confirmation. If the user wants changes, iterate until confirmed.

### SAVE CHECKPOINT
Update session state: `activated_packs`, `pipeline`, `current_phase: "pipeline_composition"`, `current_step: "complete"`.

---

## Pipeline Dispatcher — External Phases

When the composed pipeline reaches a phase with `type: "external"`:
1. Read the SKILL.md file at `skill_path`
2. Execute the skill's instructions, passing the current session context (product synopsis, scope mode, CEO review output if available, eng review output if available)
3. After the skill completes, save any outputs to `external_phase_state[phase_id]` in the session state
4. SAVE CHECKPOINT with `current_phase` set to the external phase's `id`
5. Continue to the next phase in the pipeline

---

## Phase 0 — Prerequisites

**[Skip if mode == "pipeline_only" OR phase "prerequisites" not in pipeline]**

Before anything else, check for seed artifacts, the two anchor documents, and the docs directory.

### Docs Directory Check
```bash
ls docs/ 2>/dev/null
```

If the `docs/` directory does not exist, create it:
```bash
mkdir -p docs
```

Note any existing documents found (master-prd.md, product-one-pager.md, architecture-one-pager.md, master-test-matrix.md). These will be used as context.

### Seed Artifact Discovery
```bash
ls .claude/seeds/ 2>/dev/null
```

If `.claude/seeds/` exists and contains files, list them:
**"Found [N] seed artifacts in `.claude/seeds/`:"**
List each file with its name.

Load the seed artifacts into session state:
- For each file in `.claude/seeds/`, create a `SeedArtifact` entry with `path` set to `.claude/seeds/<filename>` and `label` set to the filename without extension.
- Update session state: `seed_artifacts: [...]`.

If `.claude/seeds/` does not exist or is empty, note that no seed artifacts were found and continue. `seed_artifacts` remains `[]`.

### Product Brief Check
```bash
cat .claude/product-brief.md 2>/dev/null | head -5
```

**If the product brief exists AND seed artifacts were found:**

  AskUserQuestion: **"Found an existing product brief and [N] seed artifacts. How would you like to proceed?"**
  - **A) Use existing product brief** — Keep the current `.claude/product-brief.md` as-is. (Recommended)
  - **B) Regenerate from seed docs** — Replace the existing product brief with one synthesized from your [N] seed documents. You'll review it before proceeding.
  - **C) Create new product brief** — Discard the existing brief and run `/create-product-brief` interactively.

  **If A (Use existing):** Load the existing brief and continue.

  **If B (Regenerate from seed docs):**
  1. Read every seed artifact from `.claude/seeds/`.
  2. Synthesize a product brief from the seed content into `.claude/product-brief.md` using the product-brief-v2 template structure (product name, problem statement, target users, strategy, goals). This is a best-effort synthesis, not a full interactive interview.
  3. Present the generated brief to the user: **"Here's the product brief I generated from your seed documents:"**
  4. Wait for user confirmation or edits. If the user wants changes, update the brief and re-confirm.
  5. Set `briefs_skipped: true` in session state.

  **If C (Create new):** Run `/create-product-brief`. After it completes, resume from Phase 0.

**If the product brief exists and NO seed artifacts found:** Load the existing brief and continue (original behavior).

**If the product brief does not exist or is empty:**
- **If seed artifacts were found**, offer the user a choice:

  AskUserQuestion: **"No product brief found. How would you like to proceed?"**
  - **A) Create product brief** — Run `/create-product-brief` to build one interactively. (Default for engineering workflows)
  - **B) Generate from seed docs** — Synthesize a product brief from your [N] seed documents in `.claude/seeds/`. You'll review it before proceeding.

  **If A (Create product brief):** Run `/create-product-brief`. After it completes, resume from Phase 0.

  **If B (Generate from seed docs):**
  1. Read every seed artifact from `.claude/seeds/`.
  2. Synthesize a product brief from the seed content into `.claude/product-brief.md` using the product-brief-v2 template structure (product name, problem statement, target users, strategy, goals). This is a best-effort synthesis, not a full interactive interview.
  3. Present the generated brief to the user: **"Here's the product brief I generated from your seed documents:"**
  4. Wait for user confirmation or edits. If the user wants changes, update the brief and re-confirm.
  5. Set `briefs_skipped: true` in session state.

- **If no seed artifacts found**, behave as before:
  - Tell the user: **"No product brief found. This is required to ground all planning in the product's context. Let's create one first."**
  - Run `/create-product-brief`
  - After it completes, resume from Phase 0.

### Architecture Brief Check
```bash
cat .claude/architecture-brief.md 2>/dev/null | head -5
```

**If the architecture brief exists AND seed artifacts were found:**

  AskUserQuestion: **"Found an existing architecture brief and [N] seed artifacts. How would you like to proceed?"**
  - **A) Use existing architecture brief** — Keep the current `.claude/architecture-brief.md` as-is. (Recommended)
  - **B) Regenerate from seed docs** — Replace the existing architecture brief with one synthesized from your [N] seed documents. You'll review it before proceeding.
  - **C) Create new architecture brief** — Discard the existing brief and run `/create-architecture-brief` interactively.
  - **D) Skip — seed docs are non-technical** — Skip the architecture brief entirely. Appropriate when seeds are marketing, strategy, or other non-engineering documents.

  **If A (Use existing):** Load the existing brief and continue.

  **If B (Regenerate from seed docs):**
  1. Read every seed artifact from `.claude/seeds/`.
  2. Synthesize a lightweight architecture brief from the seed content into `.claude/architecture-brief.md`. If the seeds don't contain meaningful technical or architecture content, inform the user and recommend option D instead.
  3. Present the generated brief to the user: **"Here's the architecture brief I generated from your seed documents:"**
  4. Wait for user confirmation or edits.
  5. Set `briefs_skipped: true` in session state (if not already set).

  **If C (Create new):** Run `/create-architecture-brief`. After it completes, resume from Phase 0.

  **If D (Skip):**
  1. Note in session state that the architecture brief was skipped: set `briefs_skipped: true` (if not already set).
  2. Continue — downstream phases that reference the architecture brief should gracefully handle its absence.

**If the architecture brief exists and NO seed artifacts found:** Load the existing brief and continue (original behavior).

**If the architecture brief does not exist or is empty:**
- **If seed artifacts were found**, offer the user a choice:

  AskUserQuestion: **"No architecture brief found. How would you like to proceed?"**
  - **A) Create architecture brief** — Run `/create-architecture-brief` to build one interactively. (Default for engineering workflows)
  - **B) Generate from seed docs** — Synthesize an architecture brief from your [N] seed documents in `.claude/seeds/`. You'll review it before proceeding.
  - **C) Skip — seed docs are non-technical** — Skip the architecture brief entirely. Appropriate when seeds are marketing, strategy, or other non-engineering documents.

  **If A (Create architecture brief):** Run `/create-architecture-brief`. After it completes, resume from Phase 0.

  **If B (Generate from seed docs):**
  1. Read every seed artifact from `.claude/seeds/`.
  2. Synthesize a lightweight architecture brief from the seed content into `.claude/architecture-brief.md`. If the seeds don't contain meaningful technical or architecture content, inform the user and recommend option C instead.
  3. Present the generated brief to the user: **"Here's the architecture brief I generated from your seed documents:"**
  4. Wait for user confirmation or edits.
  5. Set `briefs_skipped: true` in session state (if not already set).

  **If C (Skip):**
  1. Note in session state that the architecture brief was skipped: set `briefs_skipped: true` (if not already set).
  2. Continue — downstream phases that reference the architecture brief should gracefully handle its absence.

- **If no seed artifacts found**, behave as before:
  - Tell the user: **"No architecture brief found. This is required to map processes, interfaces, and components. Let's create one first."**
  - Run `/create-architecture-brief`
  - After it completes, resume from Phase 0.

### Master PRD Check
```bash
cat docs/master-prd.md 2>/dev/null | head -5
```

If a master PRD exists in `docs/master-prd.md`, note it for intake. If not, this is fine — it can be created during Phase 1 via `/write-a-prd` or ingested during `/create-product-brief`.

## Phase 0.5 — Intake & Product Anchor

**[Skip if mode == "pipeline_only" OR phase "intake" not in pipeline]**

### Read the product brief
Read `.claude/product-brief.md` in full. If `seed_artifacts` is non-empty, also read all seed artifact files as additional context alongside the brief. Generate a structured product synopsis:

**Format:** "[Product Name] helps [target users from product brief] solve [problem statement] by [strategy summarized]. Success is measured by [PG-xxx metrics referenced]."

Present this to the user: **"Here's my understanding of the product. Please confirm this is accurate before we proceed:"**

Display the synopsis. Wait for confirmation. If the user corrects anything, update the synopsis and re-confirm. Do NOT proceed until the user confirms.

### SAVE CHECKPOINT
Update session state: `current_phase: "intake"`, `current_step: "synopsis_confirmed"`, `product_synopsis: "<confirmed synopsis>"`.

### Read the architecture brief
Read `.claude/architecture-brief.md` in full. Note the PROC-xxx, IF-xxx, and COMP-xxx registry for use in later phases.

### Intake
Accept the strongest available planning inputs:
- PRD (check `docs/master-prd.md` first — if it exists, load it as the primary PRD input)
- architecture guidance
- feature brief
- bug report / incident
- user prompt

If no PRD exists yet and this is a new feature, it will be created during Phase 1 (Chain 1 or Chain 2).

If both a PRD and architecture guidance are present:
- treat the PRD as the product contract
- treat architecture guidance as implementation context and constraint input
- surface conflicts explicitly before planning proceeds

### External drivers (required question)
Ask: **"Are there any external references driving this change? (competitor moves, customer feedback, market research, regulatory changes, incidents, related open Linear tickets)"**

Capture answers for the `external_drivers` field in the manifest.

## Phase 1 — Skill Composition (before CEO review)

**[Skip if mode == "pipeline_only" OR phase "skill_composition" not in pipeline]**

After intake, determine which pre-planning skills would strengthen this session. Use AskUserQuestion:

**"What kind of work is this?"**

1. **New feature (no PRD yet)** — Need to discover requirements from scratch
2. **New feature (have PRD/brief)** — Have planning inputs, ready to review
3. **Bug fix / incident** — Starting from a bug report or production issue
4. **Architecture improvement** — Looking for structural improvements, not a specific feature
5. **Refactor** — Know what to restructure, need a safe plan

### SAVE CHECKPOINT
Update session state: `current_phase: "skill_composition"`, `current_step: "work_type_selected"`, `work_type: <1-5>`.

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

**[Skip if mode == "pipeline_only" OR phase "ceo_review" not in pipeline]**

Before running the full CEO review, present the scope mode selection:

AskUserQuestion: "How should we approach this plan's scope?"

1. **SCOPE EXPANSION:** Dream big. Push scope up. Build the cathedral. (Recommended for greenfield features)
2. **SELECTIVE EXPANSION:** Hold current scope as baseline, surface expansion opportunities one-by-one for cherry-picking. Neutral recommendations. (Recommended for feature enhancements / iterations)
3. **HOLD SCOPE:** Accept the plan's scope. Maximum rigor. No expansions. (Recommended for bug fixes, hotfixes, refactors)
4. **SCOPE REDUCTION:** The plan is overbuilt. Propose the minimal version. (Recommended when plan touches >15 files)

### SAVE CHECKPOINT
Update session state: `current_phase: "scope_mode_selection"`, `current_step: "scope_selected"`, `scope_mode: "<selected mode>"`.

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

### SAVE CHECKPOINT — CEO review complete
Update session state: `current_phase: "ceo_review"`, `current_step: "complete"`, `ceo_review.status: "approved"`, `ceo_review.approval`, `ceo_review.session_goals`, `ceo_review.non_goals`, `ceo_review.constraints`, `ceo_review.hard_restrictions`.

## Phase 3 — Engineering Planning

**[Skip if mode == "pipeline_only" OR phase "eng_review" not in pipeline]**

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
- test traceability matrix (planned) — also saved to `docs/master-test-matrix.md`
- constraints (appended to CEO constraints)
- risks (SR-xxx linked to AR-xxx)

After the engineering review completes, save the test traceability matrix to `docs/master-test-matrix.md`:
```bash
mkdir -p docs
```

### SAVE CHECKPOINT — Eng review complete
Update session state: `current_phase: "eng_review"`, `current_step: "complete"`, `eng_review.status: "approved"`, `eng_review.approval`, `eng_review.scope_decision`, `eng_review.interfaces_impacted`, `eng_review.components_impacted`, `eng_review.success_criteria`, `eng_review.hard_restrictions`.

### Spec-only exit gate

**[If mode == "spec_only"]:** Stop here. Do NOT proceed to Phase 4.

Tell the user: **"Spec complete. Session saved at `.claude/state/session-<id>.json`. Run `/kickoff` again and select Pipeline mode when ready to execute."**

Update session state: `current_phase: "eng_review"`, `current_step: "spec_complete"`.

**END for spec_only mode.**

## Phase 4 — Manifest

**[Skip if mode == "spec_only" OR phase "manifest" not in pipeline]**

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

**[Skip if mode == "spec_only" OR phase "handoff" not in pipeline]**

Symphony imports the manifest, populates Linear, creates workspaces, and dispatches Codex.

## Phase 6 — Review Re-entry

**[Skip if mode == "spec_only" OR phase "review_reentry" not in pipeline]**

After implementation, run `/ship` (structural code review + CI validation + PR creation). The human operator must create a CI attestation using `scripts/create-attestation.ts --stage CI` before merge is permitted.

After tickets are merged and tagged, run `/deploy` for tag-based CD testing across all tickets in the release. The human operator creates CD attestations during `/deploy`.
