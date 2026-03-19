---
name: plan-eng-review
version: 4.0.0
description: |
  Eng manager-mode plan review with mandatory interrogation-first pattern.
  Three phases: (0) Brief Enforcement, (1) Interrogation (delegates to grill-me
  protocol v3.0.0), (2) Analysis, (3) Approval Gate. Three scope modes: SCOPE
  REDUCTION, BIG CHANGE, SMALL CHANGE. Produces engineering design detailed enough
  for ticket generation, Codex execution, and test traceability matrix population.
dependencies:
  - grill-me@3.0.0  # Phase 1 interrogation mechanics
---

# Engineering Plan Review — v4.0.0

Review this plan thoroughly before making any code changes. For every issue or recommendation, explain the concrete tradeoffs, give an opinionated recommendation, and ask for input before assuming a direction.

## Auto-discovery

Before starting, check `.env` for codebase context paths and scan them:
- `ARCHITECTURE_DOCS_PATH` — architecture notes, system design docs relevant to this change
- `EXISTING_SPECS_PATH` — existing specs that may constrain implementation
- `TARGET_REPO_URL` — the repo being modified (clone or inspect for existing patterns)

Cross-reference discovered docs with the CEO review output. Flag any architectural constraints or existing specs that the plan must comply with.

## Engineering preferences (guide your recommendations)

- DRY is important — flag repetition aggressively
- Well-tested code is non-negotiable; rather have too many tests than too few
- "Engineered enough" — not under-engineered (fragile, hacky) and not over-engineered (premature abstraction)
- Handle more edge cases, not fewer; thoughtfulness > speed
- Bias toward explicit over clever
- Minimal diff: achieve the goal with the fewest new abstractions and files touched
- ASCII diagrams for any non-trivial data flow, state machine, or processing pipeline

## Priority hierarchy

Phase 0 (brief enforcement) > Phase 1 (interrogation, min 10 questions) >
Scope decision > Test traceability matrix > Opinionated recommendations >
Phase 3 (approval gate) > Everything else.
Never skip Phase 0, Phase 1, or Phase 3.

---

# PHASE 0: Brief Enforcement (HARD GATE)

Before doing anything else, verify that both anchor documents exist.

### Product Brief Check
```bash
cat .claude/product-brief.md 2>/dev/null | head -5
```

If the product brief does not exist or is empty:
- **STOP.** Tell the user: **"No product brief found at `.claude/product-brief.md`. This is required to ground the engineering review in product context. Run `/create-product-brief` first."**
- Do NOT proceed. Do NOT attempt to review without it.

### Architecture Brief Check
```bash
cat .claude/architecture-brief.md 2>/dev/null | head -5
```

If the architecture brief does not exist or is empty:
- **STOP.** Tell the user: **"No architecture brief found at `.claude/architecture-brief.md`. This is required for engineering review. Run `/create-architecture-brief` first."**
- Do NOT proceed. Do NOT attempt to review without it.

### Product Anchor Statement

Read `.claude/product-brief.md` in full. Generate a product anchor statement:

**Format:** "[Product Name] helps [target users] solve [problem] by [strategy]. Success measured by [PG-xxx]. This session addresses [TV-xxx]."

### Architecture Anchor Statement

Read `.claude/architecture-brief.md` in full. Generate an architecture anchor statement:

**Format:** "System: [N] processes ([PROC-xxx]) connected by [M] interfaces ([IF-xxx]). Security-critical: [list]. Architecture risks: [AR-xxx]."

Present both anchors to the user: **"Here are the product and architecture anchors for this engineering review. Please confirm both before we proceed:"**

Display both anchor statements. **STOP.** Wait for confirmation. If the user corrects anything, update and re-confirm. Do NOT proceed until the user confirms both.

---

# PHASE 1: Interrogation

**This phase delegates to the `grill-me` protocol (v3.0.0) in embedded mode.** Eng review owns the question pool, selection criteria, and pre-interrogation audit. Grill-me owns the asking cadence, push-back decisions, ledger tracking, and exit criteria.

## Pre-Interrogation System Audit (eng review owns this)

Before invoking grill-me, run a system audit to inform question selection:

```bash
git log --oneline -30
git diff main --stat
git stash list
```

Inspect the codebase for:
- Current system state and what's in flight
- Existing test coverage for affected areas
- TODO/FIXME comments in files this plan touches
- Recent PRs or changes that might conflict

## Engineering Question Pool

| # | Question | Source |
|---|----------|--------|
| Q1 | **Existing Code Leverage** — What modules/functions can be reused? Are we building parallel to existing flows? | Step 0 q1 |
| Q2 | **Scariest Part** — Which area are you least confident about? Where do you expect surprises? | Discovery Q1 |
| Q3 | **Architecture Brief Alignment** — Which PROC-xxx and IF-xxx does this touch? Does it break any ICD contracts? | architecture-brief |
| Q4 | **Minimum Change Set** — What is the absolute minimum that achieves the goal? What can be deferred? | Step 0 q2 |
| Q5 | **Hard Restrictions from CEO** — What restrictions came from the product review? Still accurate? Additional ones? | Discovery Q3 |
| Q6 | **Fragile Code Zones** — Which modules in the affected area are brittle, poorly tested, or poorly understood? | Discovery Q4 |
| Q7 | **Rollback Story** — If this breaks in production, what are the exact recovery steps? Feature flag, DB rollback, revert? | Discovery Q5 |
| Q8 | **Operational Context** — How is this deployed? Who is on-call? What monitoring exists today? | Discovery Q2 |
| Q9 | **Interface Impact** — For each IF-xxx modified: backward-compatible? Migration strategy? Who breaks if it changes? | architecture-brief |
| Q10 | **Test Gap Analysis** — What is the current test coverage for affected components? What categories exist vs. needed? | New |
| Q11 | **Complexity Check** — Can the same goal be achieved with fewer files/modules? What's the simplest architecture? | Step 0 q3 |
| Q12 | **Scale and Load** — What breaks at 10x? At 100x? Single point of failure? | CEO Section 1 |
| Q13 | **Concurrency and State** — Shared mutable state? Concurrent access? Race conditions? | New |
| Q14 | **Security Surface** — Trust boundary, crypto, auth, or fund-handling touched? Which PROC-xxx/IF-xxx? | CLAUDE.md security policy |
| Q15 | **Migration Safety** — Schema/data migration backward-compatible? Zero-downtime? What about in-flight requests? | New |

## Grill-Me Invocation (Embedded Mode)

Execute Phase 1 interrogation using the grill-me protocol in embedded mode. Provide it with the question pool above, mark Q1-Q5 as mandatory, require minimum 10 questions, and pass the system audit findings as selection context. Q1, Q6, and Q10 are codebase-answerable — grill-me should explore the codebase for those before asking.

### Question Selection Guidance

After mandatory Q1-Q5, select remaining questions based on:
- **Poor test coverage found in audit** → Prioritize Q10, Q6
- **Schema or data migration involved** → Prioritize Q15, Q9
- **Cross-repo changes** → Prioritize Q9, Q8
- **CEO review flagged security concerns** → Prioritize Q14, Q13
- **Plan touches >10 files** → Prioritize Q11, Q4
- **Async/concurrent code involved** → Prioritize Q13, Q12
- **Prior review cycles or recurring problem areas** → Prioritize Q6, Q7
- **New external integrations** → Prioritize Q8, Q12, Q7

### Post-Interrogation

Grill-me returns the completed ledger in its canonical format. Present it to the user:

```
# Engineering Interrogation Ledger
[ledger in grill-me canonical format]
```

**STOP.** The grill-me protocol handles the "Any corrections?" prompt. Do NOT proceed to Phase 2 until the user confirms the ledger.

---

# PHASE 2: Analysis

All analysis in this phase is informed by the interrogation ledger from Phase 1. Reference specific Q-answers when they shape decisions.

## Scope Decision

Ask if the user wants one of three options:
1. **SCOPE REDUCTION:** The plan is overbuilt. Propose a minimal version, then review that.
2. **BIG CHANGE:** Work through interactively, one section at a time (Architecture -> Code Quality -> Tests -> Performance) with at most 8 top issues per section.
3. **SMALL CHANGE:** Compressed review — one combined pass covering all 4 sections. For each section, pick the single most important issue. Present as a single numbered list with lettered options + mandatory test diagram + completion summary.

**Critical: If the user does not select SCOPE REDUCTION, respect that decision fully.** Your job becomes making the plan succeed, not continuing to lobby for a smaller plan. Raise scope concerns once — after that, commit to the chosen scope.

**STOP.** AskUserQuestion. Recommend + WHY. Do NOT proceed until user responds.

## Review Sections (after scope is agreed)

### 1. Architecture review
Evaluate:
- Overall system design and component boundaries
- Dependency graph and coupling concerns
- Data flow patterns and potential bottlenecks
- Scaling characteristics and single points of failure
- Security architecture (auth, data access, API boundaries, on-chain interactions)
- For each new codepath or integration point, describe one realistic production failure scenario
- Whether key flows deserve ASCII diagrams in the plan or in code comments

Rust-specific:
- Module boundaries and visibility (`pub` exposure)
- Error type design (custom error enums vs. anyhow)
- Trait boundaries and generic constraints
- Async runtime considerations (tokio task spawning, cancellation safety)

**STOP.** AskUserQuestion individually per issue. Recommend + WHY.

### 2. Code quality review
Evaluate:
- Code organization and module structure
- DRY violations — be aggressive
- Error handling patterns and missing edge cases (call these out explicitly)
- Technical debt hotspots
- Areas that are over-engineered or under-engineered

Rust-specific:
- Unwrap/expect discipline — no unwrap in non-test code without justification
- Lifetime and ownership patterns
- Type safety at boundaries (newtypes for IDs, amounts, etc.)
- Serialization correctness (serde attributes, field naming)

**STOP.** AskUserQuestion individually per issue.

### 3. Test review
Make a diagram of all new data flows, new codepaths, and new branching outcomes. For each, note what is new. Then, for each new item in the diagram, make sure there is a test.

For each test gap:
- What type of test covers it? (Unit / Integration / System)
- What is the happy path test?
- What is the failure path test?
- What is the edge case test? (nil, empty, boundary values, concurrent access)

Test pyramid check: Many unit tests, fewer integration, few system tests? Or inverted?
Flakiness risk: Flag any test depending on time, randomness, external services, or ordering.

**STOP.** AskUserQuestion individually per issue.

### 4. Performance review
Evaluate:
- Database query patterns (N+1, missing indexes)
- Memory-usage concerns
- Caching opportunities
- Slow or high-complexity code paths
- Connection pool pressure

Rust-specific:
- Allocation patterns (heap vs stack, unnecessary clones)
- Lock contention (RwLock vs Mutex, lock scope)
- Channel backpressure (bounded vs unbounded)
- Serialization overhead in hot paths

**STOP.** AskUserQuestion individually per issue.

## Hard Restrictions Finalization

After completing all review sections, present any hard restrictions captured during CEO review and ask:

**"Are there additional engineering restrictions for this implementation?"**

Use AskUserQuestion. Prompt with examples:
- Forbidden crates or dependencies
- Files or modules that must not be modified (beyond `allowed_paths`)
- Required patterns (e.g., "all new endpoints must use the existing middleware stack")
- Forbidden patterns (e.g., "no new `unwrap()` in non-test code")
- Performance budgets (e.g., "p99 latency must stay under 50ms")
- Migration constraints (e.g., "must be backward-compatible with existing schema")
- Concurrency constraints (e.g., "no new tokio::spawn without cancellation safety")

All restrictions are written into `constraints` in the planning manifest. They flow into every ticket and are visible to Codex agents in the Linear issue body. The completion gate checks compliance.

## Existing code inspection

Before finalizing the plan, inspect:
- Current module structure in affected repos
- Current interfaces and contracts
- Current test coverage for affected areas
- Recent PRs or changes that might conflict

Document what was inspected under `existing_code_context` at both the feature level and per-ticket level.

---

# PHASE 3: Approval Gate

Present the complete output artifact (all required outputs below) to the user.

**STOP.** AskUserQuestion with 4 options:

- **A) Approve** — Output becomes the locked engineering artifact. Proceed to `/plan-to-linear`.
- **B) Approve with modifications** — Specify which sections to revise. Revise those sections, then re-present for approval.
- **C) Reject — revisit interrogation** — Return to Phase 1 for specific questions that need re-examination. Re-invokes grill-me in embedded mode with targeted questions.
- **D) Reject — escalate to CEO review** — Fundamental product/scope issue discovered during engineering review. Return to `/plan-ceo-review`.

**Do NOT hand off to `/plan-to-linear` until the user selects option A.**

---

## Required engineering outputs

### 1. Interrogation Ledger
Complete ledger from Phase 1 in grill-me canonical format showing RESOLVED / PENDING / SKIPPED for each question asked.

### 2. Service boundaries
- Which repos and modules are affected
- Whether cross-repo changes are needed (and if so, ordering)

### 3. Interface changes
- New or modified APIs, RPCs, events, or schemas
- Breaking vs. non-breaking changes
- Migration strategy for breaking changes

### 4. Dependency graph
- Ticket ordering and blocking relationships
- External dependencies (services, libraries, infrastructure)

### 5. Implementation approach
- Per-ticket scope, guidance, and allowed paths
- Existing code to inspect before editing
- Patterns to extend vs. patterns to replace

### 6. Test strategy and traceability matrix

#### Change classification per ticket
Set 8 booleans explicitly:
- `domain_logic_changed`
- `module_boundary_changed`
- `api_contract_changed`
- `user_workflow_changed`
- `throughput_or_latency_path_changed`
- `trust_boundary_or_external_input_changed`
- `bug_fix_or_regression_risk`
- `operational_behavior_changed`

#### Test traceability matrix (per TV ticket)

For each ticket, produce explicit `test_traceability_matrix` rows. Every ENG-xxx acceptance criterion must have at least one TM-xxx row. Each row:

```
trace_id           — TM-{TICKET_ID}-{NN} (globally unique)
product_goal       — PG-xxx (required — traces back to product brief)
business_criterion — BIZ-xxx or null
eng_criterion      — ENG-xxx (required — traces back to acceptance criteria)
test_type          — unit|integration|system|smoke|security|load|stress|fuzz|regression|error-path-resilience|functional-api
interfaces_tested  — [IF-xxx] or [] (populated for integration tests)
test_file          — planned test file path
stage              — CI or CD
version_tag        — null (populated during /deploy for CD-stage tests)
success_criteria   — what "pass" means for this specific test
```

Use the change classification to determine required test types:
- `domain_logic_changed` → unit tests
- `module_boundary_changed` → integration tests
- `api_contract_changed` → functional-api + regression tests
- `user_workflow_changed` → system tests
- `throughput_or_latency_path_changed` → load tests (conditional: stress)
- `trust_boundary_or_external_input_changed` → security + error-path-resilience tests (conditional: fuzz)
- `bug_fix_or_regression_risk` → regression tests
- `operational_behavior_changed` → CD-stage: rollback plan + monitoring verification

#### Test commands per ticket
Explicit commands that agents run (e.g., `cargo test --package omega-orders -- state_test`).

#### Existing tests to preserve or extend
List tests that exist today and must not break.

### 7. QA and operational gates
- Staging validation requirements
- Rollback plan requirements (if operational behavior changes)
- Monitoring/alert requirements (if applicable)
- Release sequencing constraints

### 8. Risks and escalation
- Known risks to manage during implementation
- Escalation rule per ticket (when to stop and return to planning)

### "NOT in scope" section
List work considered and explicitly deferred, with one-line rationale each.

### "What already exists" section
List existing code/flows that partially solve sub-problems and whether the plan reuses them.

### Failure modes
For each new codepath, list one realistic way it could fail in production and whether:
1. A test covers that failure
2. Error handling exists for it
3. The user would see a clear error or a silent failure

Any failure mode with no test AND no error handling AND would be silent -> **CRITICAL GAP**.

### Completion summary
```
  Phase 0              | Brief enforcement: PASSED
  Phase 1              | Grill-me embedded: ___ questions asked, ___ resolved, ___ pending
  Scope Decision       | SCOPE REDUCTION / BIG CHANGE / SMALL CHANGE
  Architecture Review  | ___ issues found
  Code Quality Review  | ___ issues found
  Test Review          | diagram produced, ___ gaps identified
  Performance Review   | ___ issues found
  Test Traceability    | ___ TM-xxx rows across ___ tickets
  NOT in scope         | written
  What already exists  | written
  Failure modes        | ___ critical gaps flagged
  Phase 3              | APPROVED / APPROVED WITH MODIFICATIONS / REJECTED
```

## CRITICAL RULE — How to ask questions

Every AskUserQuestion MUST: (1) present 2-3 concrete lettered options, (2) state which option you recommend FIRST, (3) explain in 1-2 sentences WHY. No batching multiple issues into one question. No yes/no questions.

**One issue = one AskUserQuestion call.** Lead with your recommendation as a directive: "Do B. Here's why:" — not "Option B might be worth considering."

**Escape hatch:** If a section has no issues, say so and move on. If an issue has an obvious fix, state what you'll do and move on.

**Phase 1 exception:** Interrogation questions follow grill-me protocol rules — they may be open-ended to elicit the user's reasoning. The lettered-options rule applies to Phase 2 analysis questions, not Phase 1 interrogation.

## Hand-off rule

The output of this command feeds directly into `/plan-to-linear`. Ensure:
- Every ticket has enough detail for Symphony to render a Linear issue body without additional interpretation
- Change classification is complete enough for automatic test/QA gate derivation
- Test traceability matrix is populated — every ENG-xxx has at least one TM-xxx row
- Allowed paths are explicit, not inferred
- Acceptance criteria are observable and testable
