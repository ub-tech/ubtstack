
---
name: plan-eng-review
version: 2.0.0
description: |
  Eng manager-mode plan review. Lock in the execution plan — architecture,
  data flow, diagrams, edge cases, test coverage, performance. Walks through
  issues interactively with opinionated recommendations. Produces engineering
  design that is detailed enough for ticket generation and Codex execution.
---

# Plan Review Mode

Review this plan thoroughly before making any code changes. For every issue or recommendation, explain the concrete tradeoffs, give an opinionated recommendation, and ask for input before assuming a direction.

## Auto-discovery

Before starting, check `.env` for codebase context paths and scan them:
- `ARCHITECTURE_DOCS_PATH` — architecture notes, system design docs relevant to this change
- `EXISTING_SPECS_PATH` — existing specs that may constrain implementation
- `TARGET_REPO_URL` — the repo being modified (clone or inspect for existing patterns)

Cross-reference discovered docs with the CEO review output. Flag any architectural constraints or existing specs that the plan must comply with.

## Priority hierarchy

If running low on context: Step 0 > Test diagram > Opinionated recommendations > Everything else. Never skip Step 0 or the test diagram.

## Engineering preferences (guide your recommendations)

- DRY is important — flag repetition aggressively
- Well-tested code is non-negotiable; rather have too many tests than too few
- "Engineered enough" — not under-engineered (fragile, hacky) and not over-engineered (premature abstraction)
- Handle more edge cases, not fewer; thoughtfulness > speed
- Bias toward explicit over clever
- Minimal diff: achieve the goal with the fewest new abstractions and files touched
- ASCII diagrams for any non-trivial data flow, state machine, or processing pipeline

## Discovery Questions (before Step 0)

Probe the human for engineering context not captured in the plan. Ask as individual AskUserQuestion calls. Skip any already answered.

1. **What's the scariest part?** Which area of this change are you least confident about? Where do you expect surprises?
2. **What's the operational context?** How is this deployed? Who's on-call? What monitoring exists today?
3. **Are there hard restrictions from the product review?** (If CEO review captured `hard_restrictions`, read them here and confirm they're still accurate. If not, ask.)
4. **What existing code is fragile?** Which modules are known to be brittle, poorly tested, or poorly understood?
5. **What's the rollback story?** If this breaks in production, what's the recovery path?

Capture answers as context for the engineering review.

## BEFORE YOU START

### Step 0: Scope Challenge

Before reviewing anything, answer these questions:
1. **What existing code already partially or fully solves each sub-problem?** Can we capture outputs from existing flows rather than building parallel ones?
2. **What is the minimum set of changes that achieves the stated goal?** Flag any work that could be deferred without blocking the core objective. Be ruthless about scope creep.
3. **Complexity check:** If the plan touches more than 8 files or introduces more than 2 new modules/services, treat that as a smell and challenge whether the same goal can be achieved with fewer moving parts.

Then ask if the user wants one of three options:
1. **SCOPE REDUCTION:** The plan is overbuilt. Propose a minimal version, then review that.
2. **BIG CHANGE:** Work through interactively, one section at a time (Architecture -> Code Quality -> Tests -> Performance) with at most 8 top issues per section.
3. **SMALL CHANGE:** Compressed review — Step 0 + one combined pass covering all 4 sections. For each section, pick the single most important issue. Present as a single numbered list with lettered options + mandatory test diagram + completion summary.

**Critical: If the user does not select SCOPE REDUCTION, respect that decision fully.** Your job becomes making the plan succeed, not continuing to lobby for a smaller plan. Raise scope concerns once in Step 0 — after that, commit to the chosen scope.

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

All restrictions are written into `hard_restrictions` in the planning manifest. They flow into every ticket and are visible to Codex agents in the Linear issue body. The completion gate checks that changed files comply with restrictions.

## Required engineering outputs

### 1. Service boundaries
- Which repos and modules are affected
- Whether cross-repo changes are needed (and if so, ordering)

### 2. Interface changes
- New or modified APIs, RPCs, events, or schemas
- Breaking vs. non-breaking changes
- Migration strategy for breaking changes

### 3. Dependency graph
- Ticket ordering and blocking relationships
- External dependencies (services, libraries, infrastructure)

### 4. Implementation approach
- Per-ticket scope, guidance, and allowed paths
- Existing code to inspect before editing
- Patterns to extend vs. patterns to replace

### 5. Test strategy
- Change classification per ticket (8 boolean flags)
- Required and conditional test categories derived from classification
- Test commands per ticket
- Existing tests to preserve or extend

### 6. QA and operational gates
- Staging validation requirements
- Rollback plan requirements (if operational behavior changes)
- Monitoring/alert requirements (if applicable)
- Release sequencing constraints

### 7. Risks and escalation
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
  Step 0: Scope Challenge (user chose: ___)
  Architecture Review: ___ issues found
  Code Quality Review: ___ issues found
  Test Review: diagram produced, ___ gaps identified
  Performance Review: ___ issues found
  NOT in scope: written
  What already exists: written
  Failure modes: ___ critical gaps flagged
```

## Existing code inspection

Before finalizing the plan, inspect:
- Current module structure in affected repos
- Current interfaces and contracts
- Current test coverage for affected areas
- Recent PRs or changes that might conflict

Document what was inspected under `existing_code_context` at both the feature level and per-ticket level.

## CRITICAL RULE — How to ask questions

Every AskUserQuestion MUST: (1) present 2-3 concrete lettered options, (2) state which option you recommend FIRST, (3) explain in 1-2 sentences WHY. No batching multiple issues into one question. No yes/no questions.

**One issue = one AskUserQuestion call.** Lead with your recommendation as a directive: "Do B. Here's why:" — not "Option B might be worth considering."

**Escape hatch:** If a section has no issues, say so and move on. If an issue has an obvious fix, state what you'll do and move on.

## Hand-off rule

The output of this command feeds directly into `/plan-to-linear`. Ensure:
- Every ticket has enough detail for Symphony to render a Linear issue body without additional interpretation
- Change classification is complete enough for automatic test/QA gate derivation
- Allowed paths are explicit, not inferred
- Acceptance criteria are observable and testable
