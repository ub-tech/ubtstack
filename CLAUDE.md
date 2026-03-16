
# Hybrid sandwich workflow

This repo supports a sandwich workflow:

1. Claude + ubt-stack for planning and design
2. Symphony + Linear for ticketization and coordination
3. Codex for bounded implementation
4. Claude + ubt-stack for review (includes QA), CD/staging, and ship

## Planning inputs

The planning layer may begin from any combination of:
- a PRD
- a functional spec
- an architecture note or system design memo
- a bug report or incident write-up
- a user prompt that serves as the working brief

### Planning separation rule

The CEO planning step may ingest **PRD and architecture guidance as inputs**, but it must still output a **product decision**:
- what problem is being solved
- who benefits
- what outcome matters
- what constraints are fixed
- what is explicitly out of scope

The engineering planning step remains responsible for:
- service boundaries
- repo ownership
- interfaces and schemas
- migrations and rollout
- test strategy and operational gates

Architecture guidance can shape the first step, but it does **not** collapse CEO review and engineering review into a single step.


## Existing code context

This workflow is intended to work on both greenfield and pre-existing codebases.

Planning and design may ingest existing implementation as context:
- relevant repos and modules
- current interfaces and contracts
- current tests
- prior PRs or incidents
- known architectural constraints

CEO planning may use existing code only as context for product scoping.
Engineering planning should treat existing implementation as a first-class input and produce an explicit delta against current code.

## Testing policy

Every ticket must generate the **smallest complete test portfolio** for the change.

### Test categories
- Unit
- Integration
- System / end-to-end
- API smoke
- API functional
- API regression
- Load
- Stress
- Security
- Fuzz
- UI/API interaction
- Error-path / resilience

### Rust test guidance

Rust tests should follow **setup → execute → assert** and use idiomatic constructs such as:
- `#[test]`
- `assert!`
- `assert_eq!`
- `assert_ne!`
- `#[should_panic(expected = "...")]` only when panic semantics are intended
- `Result<(), E>` in tests when fallible setup is clearer

### Test selection rule

Codex must generate tests at the **lowest valid layer first**, then add higher-layer tests only where the change introduces cross-boundary or operational risk.

Examples:
- pure logic change → unit tests, plus regression tests if fixing a bug
- module boundary change → integration tests
- API contract change → smoke + functional API + regression tests
- workflow change → system tests
- performance-sensitive path → load and possibly stress tests
- new trust boundary or external input surface → security and fuzz tests

### QA rule

QA uses a stage-based model. Each stage owns its tests and reports pass/fail independently:

- **CI stage** (`ci.status`): build, lint, unit, integration, smoke — verified during agent execution and `/review`
- **CD stage** (`cd.status`): staging smoke, system/e2e, regression, security, fuzz, load, stress, functional API — verified during the CD/staging pipeline between `/review` and `/ship`
- Rollback readiness — documented by agent, verified during `/review`
- Monitoring and alert readiness for operationally significant changes — documented by agent, verified during `/review`

CI tests pass/fail at CI time. CD tests pass/fail at CD time. There is no “deferred” concept — each stage runs its own tests when it executes.

### Review rule

A PR is incomplete if it proves only the happy path while leaving boundary, error, regression, or operational behavior untested.

### Review-packet validation

During `/review`, validate the review packet against the planning manifest.
A PR is not ready to ship if required test categories or QA requirements are missing from the implementation evidence.


## Symphony completion gate

Symphony is not allowed to mark a ticket complete solely because Codex opened a PR or tests were run.
A ticket may advance only after `scripts/symphony-complete-ticket.ts` returns exit code 0.

The completion gate validates:
- `ci.status == "pass"` (CD status must be `"pending"` — CD hasn't run yet)
- required test categories
- conditional categories with explicit skip reasons
- test commands were run
- baseline review checklist items are present

If the completion gate fails, Symphony must keep the ticket blocked and route the result back into Claude `/review` or planning.

Note: `/qa` has been merged into `/review`. Run `/review` for both code review and QA gate validation.


## Linear Status Contract
Symphony must obey the Linear status-transition contract in `.claude/templates/linear-status-contract.template.json`.
It may only move tickets along allowed edges, and it must use `scripts/resolve-linear-transition.ts` before any automatic status update.
Validator failure routes to `Rework`; validator pass routes to `Human Review`. Only Claude review can move a ticket from `Human Review` to `Merging`. Only a successful merge can move a ticket to `Done`.

Status names are aligned with Symphony (odysseus0/symphony) conventions:
- `Todo` (Symphony active state — dispatch eligible)
- `In Progress` (Symphony active state — agent working)
- `Human Review` (not a Symphony active state — awaiting Claude review)
- `Rework` (Symphony active state — agent re-dispatched with feedback)
- `Merging` (Symphony active state — agent handles PR merge)
- `Done` (terminal)


## Production mode rules

All agent work in this repo operates under production mode. These rules are non-negotiable.

### Prohibited actions

- **No direct commits to main.** All changes go through feature branches and PRs.
- **No merge without approval.** Only the approver configured in `APPROVAL_REQUIRED_FROM` can approve and merge PRs. Agents do not merge.
- **No PR without passing tests.** `cargo build`, `cargo test`, and `cargo clippy -- -D warnings` must all pass before a PR is created.
- **No weakening tests to make them pass.** Fix the code, not the test. If a test is genuinely wrong, document why and get approval before changing it.
- **No PRs over 400 LOC without approval.** If a diff exceeds 400 lines, warn and suggest splitting into smaller PRs.
- **No force push.** Ever.
- **No skipping the simplification pass.** Every PR gets a simplification pass before ship, even if the code looks clean.

### Required disciplines

- **One issue = one agent = one worktree = one PR.** Each Linear ticket maps to a single isolated workspace, a single agent session, and a single PR. No multi-ticket PRs.
- **Unit tests are mandatory.** Every code change must include unit tests at minimum. Higher-layer tests are added based on change classification.
- **Edge cases must be tested.** Happy-path-only coverage is not acceptable. Boundary conditions, error paths, and invalid inputs must be exercised.
- **Simplification pass is mandatory.** Before shipping, review the diff for dead code, unused imports, redundant abstractions. Remove them without changing behavior.
- **Reflection after every ship.** After a PR is merged, capture what worked, what didn't, and what to do differently next time.
- **Dependency audit before code.** Before writing implementation code, audit existing dependencies and interfaces. Understand what exists before building on top of it.

### Spec lock rule

Once a planning manifest is approved and tickets are created, the spec is locked. Implementation must match the spec. If the spec needs to change:
1. Stop implementation
2. Raise the change with the planning layer
3. Get approval for the spec change
4. Update the manifest
5. Resume implementation

Agents must not silently deviate from the approved spec.

### Security escalation policy

Any change that touches a trust boundary, cryptographic operation, signature verification, or fund-handling path requires explicit human review. These areas include:
- Deposit/withdrawal flows
- Signature verification and proof generation
- Bridge operations
- Key management
- Authorization and authentication
- Balance calculations and state transitions involving funds

Agents must flag these changes and cannot self-approve them.

### Commit conventions

All commits use conventional commit prefixes:
- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructuring without behavior change
- `test:` — adding or updating tests
- `chore:` — maintenance, dependency updates, config changes
- `docs:` — documentation only

Each commit must be independently valid and bisectable. Infrastructure changes commit first, then core logic with tests, then integration code with tests.

### Human approval gate

The final approval gate is human. The approver is configured via `APPROVAL_REQUIRED_FROM` in `.env`. Specifically:
- Agents create PRs and request review from the configured approver
- Only the configured approver reviews, approves, and merges
- No automated merge is permitted
- The approver reviews: code quality, test coverage, spec compliance, security implications, and operational readiness

### Pipeline summary

```
Spec → CEO Review → Eng Review → Tickets (Linear)
  → Agent Implementation (Codex/Symphony)
  → CI → Completion Gate → Claude Review + QA
  → CD to Staging → Ship (PR) → Human Approval → Merge
  → Reflection
```
