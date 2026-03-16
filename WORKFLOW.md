---
tracker:
  kind: linear
  project_slug: "your-linear-project-slug"
  active_states:
    - Todo
    - In Progress
    - Merging
    - Rework
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 5000
workspace:
  root: ~/code/workspaces
hooks:
  after_create: |
    git clone --depth 1 $TARGET_REPO_URL your-target-repo
    git clone --depth 1 $UBT_STACK_URL ubt-stack
    (cd ubt-stack && npm install)
    mkdir -p your-target-repo/.claude/state
  before_run: |
    # Ensure ubt-stack is a valid git clone (not a partial/broken directory)
    if [ ! -d ubt-stack/.git ]; then
      rm -rf ubt-stack
      git clone --depth 1 $UBT_STACK_URL ubt-stack
      (cd ubt-stack && npm install)
    fi
    # Pull latest tooling from ubt-stack (use FETCH_HEAD for shallow clone reliability)
    (cd ubt-stack && git fetch origin main --depth 1 && git checkout FETCH_HEAD -- scripts/ .claude/templates/)
    # Pull latest state from target repo
    mkdir -p your-target-repo/.claude/state
    (cd your-target-repo && git fetch origin main --depth 1 && git checkout FETCH_HEAD -- .claude/state/ 2>/dev/null || true)
    # Set up a fresh implementation branch in the target repo from origin/main.
    # Use versioned suffix (-v2, -v3, ...) if the base branch already exists on the remote.
    pick_branch() {
      local base="symphony/$ISSUE_IDENTIFIER"
      if ! git ls-remote --heads origin "$base" | grep -q "$base"; then
        echo "$base"; return
      fi
      local v=2
      while git ls-remote --heads origin "${base}-v${v}" | grep -q "${base}-v${v}"; do v=$((v+1)); done
      echo "${base}-v${v}"
    }
    if [ -d your-target-repo ]; then
      (cd your-target-repo && git fetch origin && BRANCH=$(pick_branch) && git checkout -B "$BRANCH" origin/main)
    else
      git fetch origin && BRANCH=$(pick_branch) && git checkout -B "$BRANCH" origin/main
    fi
  before_remove: |
    cd your-target-repo 2>/dev/null || exit 0
    branch=$(git branch --show-current 2>/dev/null)
    if [ -n "$branch" ] && command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
      gh pr list --head "$branch" --state open --json number --jq '.[].number' | while read -r pr; do
        [ -n "$pr" ] && gh pr close "$pr" --comment "Closing: Linear issue for branch $branch entered a terminal state without merge."
      done
    fi
agent:
  max_concurrent_agents: 5
  max_turns: 30
codex:
  command: codex --config shell_environment_policy.inherit=all --config model_reasoning_effort=xhigh --model gpt-5.3-codex app-server
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy:
    type: dangerFullAccess
---

# Symphony Workflow

You are implementing a bounded ticket from the UBT SDLC pipeline.
Stay within scope, preserve existing architecture, and escalate ambiguity instead of inventing architecture.

## Workspace layout

The workspace contains two repos side by side:

- `your-target-repo/` — the implementation repo. All code changes, git operations, and PRs happen here. State files (manifests, review packets) also live here under `.claude/state/`.
- `ubt-stack/` — the SDLC tooling repo. Contains scripts and templates only. Do NOT modify files in this repo.

All relative paths in ticket Allowed Paths are relative to `your-target-repo/`.
Run build and test commands from inside `your-target-repo/`.
Run `npx tsx ubt-stack/scripts/...` commands from the workspace root.

## Phase 0 — Workspace verification (ALWAYS run first)

Before doing anything else, verify the workspace layout is correct. Run these commands from the workspace root:

```bash
# Clone target repo if missing
if [ ! -d your-target-repo ]; then
  git clone --depth 1 $TARGET_REPO_URL your-target-repo
fi

# Ensure ubt-stack is a valid git clone (not a partial/broken directory)
if [ ! -d ubt-stack/.git ]; then
  rm -rf ubt-stack
  git clone --depth 1 $UBT_STACK_URL ubt-stack
  (cd ubt-stack && npm install)
fi

# Pull latest tooling from ubt-stack (scripts and templates only)
(cd ubt-stack && git fetch origin main --depth 1 && git checkout FETCH_HEAD -- scripts/ .claude/templates/)

# Pull latest state from target repo
mkdir -p your-target-repo/.claude/state
(cd your-target-repo && git fetch origin main --depth 1 && git checkout FETCH_HEAD -- .claude/state/ 2>/dev/null || true)
```

**Do NOT proceed to Phase 1 until `ubt-stack/scripts/validate-review-packet.ts` exists.** If it does not exist after running the above, transition the ticket to Rework with the error.

## Read the ticket first

The Linear issue body contains everything you need:
- problem statement
- scope and non-goals
- change classification
- required test categories
- escalation rule
- existing code context to inspect before editing

## Execution phases

### Phase 1 — Understand

1. Read the full Linear issue body
2. Inspect the referenced existing code modules and tests listed under "Inputs" and "Existing Code Context"
3. Identify the exact files you will modify

### Phase 2 — Implement

All code changes go in `your-target-repo/`.

1. Extend current patterns where reasonable; do not rewrite unrelated architecture
2. Satisfy all acceptance criteria listed in the ticket

### Phase 3 — Test

Generate and run all required test categories from the ticket. Agents run **CI-stage tests only** (fast, deterministic). CD-stage tests run in the staging CD pipeline after `/review`.

**CI tests (agent-local):**
- Build / compile (`cargo build`)
- Lint / static analysis (`cargo clippy`)
- Unit tests
- Integration tests (lightweight, mocked)
- Smoke tests

**CD tests (staging pipeline — not agent-local):**
- Staging smoke
- System / end-to-end tests
- Regression tests
- Security tests
- Fuzz tests (when applicable)
- Load tests (when applicable)
- Stress tests (when applicable)
- API functional tests

1. **Required test categories** — must all be implemented and passing (CI-stage categories)
2. **Conditional test categories** — implement if CI-stage applicable, or document why skipped
3. Include happy-path, boundary, error-path, and regression coverage

Run the test commands listed in the ticket from inside `your-target-repo/`.

#### tests_passed semantics

`tests_passed` in the review packet means **`cargo test` results only**. Set `tests_passed=true` if all `cargo test` commands pass, regardless of clippy results.

#### Clippy and out-of-scope lint debt

Run `cargo clippy -p <crate> --no-deps -- -D warnings` to lint only the target crate. If clippy fails on crates **outside your allowed paths** (pre-existing lint debt), this does not block your ticket. Add a note in the review packet but keep `tests_passed=true`.

#### Package name convention

If a ticket references a package name that isn't found, check for a workspace-specific prefix (e.g., `cargo test -p <prefix>-<name>`). Use the working package name and note the correction in the review packet.

### Phase 4 — Validate

Run the review-packet validator to check your work:

```bash
npx tsx ubt-stack/scripts/validate-review-packet.ts \
  your-target-repo/.claude/state/planning-manifest.json \
  your-target-repo/.claude/state/review-packet.json
```

If validation fails, fix the gaps before proceeding.

### Phase 5 — PR

Open a PR **before** writing the review packet. The completion gate requires a PR URL.
Run git commands from inside `your-target-repo/`.

```bash
cd your-target-repo
BRANCH=$(git branch --show-current)
git push -u origin "$BRANCH"
gh pr create \
  --title "[$ISSUE_IDENTIFIER] <ticket title>" \
  --body "<implementation summary, test results, and link to the review packet>" \
  --base main
cd ..
```

Record the PR URL for the review packet.

### Phase 6 — Review packet

Write `your-target-repo/.claude/state/review-packet.json` using this structure.
The `branch` and `pr` fields are **required** — the completion gate will reject packets without them.

QA uses a stage-based model. Each stage (CI and CD) owns its tests and reports pass/fail independently:
- **`ci`** — CI-stage tests verified during agent execution: `status: "pass"` with per-test entries
- **`cd`** — CD-stage tests run in the staging pipeline after `/review`: `status: "pending"` with empty tests array (populated by `sync-cd-results.ts` after CD runs)

```json
{
  "feature_id": "<from ticket>",
  "ticket_id": "<from ticket>",
  "linear_issue": "<Linear issue identifier>",
  "branch": "symphony/<ISSUE_IDENTIFIER>",
  "pr": "<PR URL from Phase 5>",
  "implementation_summary": {
    "files_changed": ["list", "of", "files"],
    "tests_run": ["command1", "command2"],
    "tests_passed": true,
    "test_matrix": {
      "generated_categories": ["unit", "integration", "smoke"],
      "skipped_categories": [
        {"category": "load", "reason": "no throughput path changed"}
      ],
      "error_path_coverage": ["invalid input", "timeout"],
      "ci": {
        "status": "pass",
        "tests": [
          {"category": "build", "status": "pass"},
          {"category": "lint", "status": "pass"},
          {"category": "unit", "status": "pass"},
          {"category": "integration", "status": "pass"},
          {"category": "smoke", "status": "pass"}
        ]
      },
      "cd": {
        "status": "pending",
        "tests": []
      },
      "remaining_risks": []
    }
  },
  "review_checklist": [
    "Confirm acceptance criteria are satisfied",
    "Confirm the test portfolio is adequate for the changed surface"
  ]
}
```

### Phase 7 — Completion gate

Run the completion gate:

```bash
npx tsx ubt-stack/scripts/symphony-complete-ticket.ts \
  your-target-repo/.claude/state/planning-manifest.json \
  your-target-repo/.claude/state/review-packet.json \
  --ticket "$ISSUE_IDENTIFIER" \
  --current-status "In Progress" \
  --mode complete
```

- **Exit 0**: Transition the Linear issue to **Human Review**
- **Exit 1**: Fix the failures. If you cannot, transition to **Rework** and document what is blocking

The gate validates that a PR URL and branch are present in the review packet. If the gate fails because `pr_missing` or `branch_missing`, create the PR first and update the review packet before re-running.

## Mandatory rules

1. Do NOT skip required test categories
2. Do NOT mark a ticket done — only move to Human Review or Rework
3. If architecture or scope is ambiguous, STOP and transition to Rework with explanation
4. If a required QA item cannot be completed, call it out explicitly
5. Every skipped conditional test category needs a documented reason
6. Do NOT violate Hard Restrictions listed in the ticket — these are non-negotiable constraints from the planning review
7. Address tickets in **numerical order** (lowest issue number first). If a ticket has unresolved `depends_on` dependencies, skip it and pick the next lowest-numbered ticket that is unblocked. Do NOT start a higher-numbered ticket while a lower-numbered unblocked ticket is available
8. Every dispatch must create a **new PR**. If a previous PR exists for this ticket (merged or closed), create a fresh branch and a new PR. Do NOT reuse, reopen, or amend old PRs. The operator expects one new PR per dispatch cycle.

## Rework handling

When you receive a ticket in Rework state or re-dispatched from Todo:
1. Read the Rework comments/feedback on the Linear issue
2. Start a **new branch** from `origin/main` (e.g. `symphony/$ISSUE_IDENTIFIER-v2`, `symphony/$ISSUE_IDENTIFIER-v3`)
3. Address the specific feedback
4. Create a **new PR** — do not reuse or reopen the previous PR
5. Re-run validation and completion gate
6. If validation passes, transition to Human Review
7. If you still cannot resolve, leave in Rework with updated explanation

## Blocked access

If you need access to a service, secret, or resource not available in the workspace:
1. Do NOT attempt to work around access restrictions
2. Transition the ticket to Rework
3. Add a comment explaining exactly what access is needed and why

## CI/CD test distribution

### CI tests (fast, deterministic — agent local + PR checks)
- Build / compile
- Lint / static analysis
- Unit tests
- Integration tests (lightweight)
- Smoke tests

### CD tests (slower, environment-dependent — staging pipeline)
- System / end-to-end tests
- API functional tests
- Regression tests
- Load tests (when applicable)
- Stress tests (when applicable)
- Security tests
- Fuzz tests (when applicable)
- Staging smoke / critical flow verification

Agents are responsible for CI tests only. CD tests run in the staging pipeline between `/review` and `/ship`. CI tests pass/fail at CI time. CD tests pass/fail at CD time.
