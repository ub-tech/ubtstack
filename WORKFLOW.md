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
    set -e
    ISSUE_ID="$(basename "$(pwd)")"
    git clone --depth 1 $UBT_STACK_URL ubtstack
    (cd ubtstack && npm install)
    # Resolve target repo from ticket-repo-map.json (multi-repo) or fall back to TARGET_REPO_URL (legacy)
    TARGET_REPO_DIR=""
    TARGET_REPO_CLONE_URL=""
    if [ -f ubtstack/.claude/state/ticket-repo-map.json ]; then
      REPO_ALIAS=$(node -e "const m=JSON.parse(require('fs').readFileSync('ubtstack/.claude/state/ticket-repo-map.json','utf8')); const e=m['$ISSUE_ID']; if(e){console.log(e.repo)}" 2>/dev/null || true)
      REPO_URL=$(node -e "const m=JSON.parse(require('fs').readFileSync('ubtstack/.claude/state/ticket-repo-map.json','utf8')); const e=m['$ISSUE_ID']; if(e){console.log(e.url)}" 2>/dev/null || true)
      if [ -n "$REPO_ALIAS" ] && [ -n "$REPO_URL" ]; then
        TARGET_REPO_DIR="$REPO_ALIAS"
        TARGET_REPO_CLONE_URL="$REPO_URL"
      fi
    fi
    if [ -z "$TARGET_REPO_DIR" ]; then
      TARGET_REPO_DIR="your-target-repo"
      TARGET_REPO_CLONE_URL="$TARGET_REPO_URL"
    fi
    git clone --depth 1 "$TARGET_REPO_CLONE_URL" "$TARGET_REPO_DIR"
    mkdir -p "$TARGET_REPO_DIR/.claude/state"
    echo "$TARGET_REPO_DIR" > .target-repo-dir
  before_run: |
    set -e
    ISSUE_ID="$(basename "$(pwd)")"
    # Read target repo directory name from sentinel
    if [ -f .target-repo-dir ]; then
      TARGET_REPO_DIR="$(cat .target-repo-dir)"
    else
      TARGET_REPO_DIR="your-target-repo"
    fi
    # Ensure ubtstack exists
    if [ ! -d ubtstack/.git ]; then
      rm -rf ubtstack
      git clone --depth 1 $UBT_STACK_URL ubtstack
      (cd ubtstack && npm install)
    else
      (cd ubtstack && git fetch origin main --depth 1 && git checkout FETCH_HEAD -- scripts/ .claude/templates/)
    fi
    # Ensure target repo is a valid git clone
    if [ ! -d "$TARGET_REPO_DIR/.git" ]; then
      # Resolve clone URL
      TARGET_REPO_CLONE_URL="$TARGET_REPO_URL"
      if [ -f ubtstack/.claude/state/ticket-repo-map.json ]; then
        RESOLVED_URL=$(node -e "const m=JSON.parse(require('fs').readFileSync('ubtstack/.claude/state/ticket-repo-map.json','utf8')); const e=m['$ISSUE_ID']; if(e){console.log(e.url)}" 2>/dev/null || true)
        [ -n "$RESOLVED_URL" ] && TARGET_REPO_CLONE_URL="$RESOLVED_URL"
      fi
      rm -rf "$TARGET_REPO_DIR"
      git clone "$TARGET_REPO_CLONE_URL" "$TARGET_REPO_DIR"
    fi
    # Pull latest state and set up branch
    cd "$TARGET_REPO_DIR"
    git fetch origin
    git checkout FETCH_HEAD -- .claude/state/planning-manifest.json 2>/dev/null || true
    BASE="symphony/$ISSUE_ID"
    if ! git ls-remote --heads origin "$BASE" | grep -q "$BASE"; then
      BRANCH="$BASE"
    else
      V=2
      while git ls-remote --heads origin "${BASE}-v${V}" | grep -q "${BASE}-v${V}"; do V=$((V+1)); done
      BRANCH="${BASE}-v${V}"
    fi
    git checkout -B "$BRANCH" origin/main
  before_remove: |
    # Read target repo directory name from sentinel
    if [ -f .target-repo-dir ]; then
      TARGET_REPO_DIR="$(cat .target-repo-dir)"
    else
      TARGET_REPO_DIR="your-target-repo"
    fi
    cd "$TARGET_REPO_DIR" 2>/dev/null || exit 0
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
  # Update --model and the trailing domain argument for your setup.
  # model_reasoning_effort: xlow, low, medium, high, xhigh
  # See: https://platform.openai.com/docs/guides/codex
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

- `$TARGET_REPO_DIR/` — the implementation repo (directory name matches the repo alias, e.g. `backend/`, `frontend/`; legacy single-repo uses `your-target-repo/`). All code changes, git operations, and PRs happen here. State files (manifests, review packets) also live here under `.claude/state/`.
- `ubtstack/` — the SDLC tooling repo. Contains scripts and templates only. Do NOT modify files in this repo.

The `.target-repo-dir` sentinel file at the workspace root contains the directory name. Read it to resolve `$TARGET_REPO_DIR`:
```bash
TARGET_REPO_DIR="$(cat .target-repo-dir 2>/dev/null || echo your-target-repo)"
```

All relative paths in ticket Allowed Paths are relative to `$TARGET_REPO_DIR/`.
Run build and test commands from inside `$TARGET_REPO_DIR/`.
Run `npx tsx ubtstack/scripts/...` commands from the workspace root.

## Phase 0 — Workspace verification (ALWAYS run first)

Before doing anything else, verify the workspace layout is correct. Run these commands from the workspace root:

```bash
# Resolve target repo directory name
TARGET_REPO_DIR="$(cat .target-repo-dir 2>/dev/null || echo your-target-repo)"

# Clone target repo if missing
if [ ! -d "$TARGET_REPO_DIR" ]; then
  git clone --depth 1 $TARGET_REPO_URL "$TARGET_REPO_DIR"
fi

# Ensure ubtstack is a valid git clone (not a partial/broken directory)
if [ ! -d ubtstack/.git ]; then
  rm -rf ubtstack
  git clone --depth 1 $UBT_STACK_URL ubtstack
  (cd ubtstack && npm install)
fi

# Pull latest tooling from ubtstack (scripts and templates only)
(cd ubtstack && git fetch origin main --depth 1 && git checkout FETCH_HEAD -- scripts/ .claude/templates/)

# Pull latest state from target repo
mkdir -p "$TARGET_REPO_DIR/.claude/state"
(cd "$TARGET_REPO_DIR" && git fetch origin main --depth 1 && git checkout FETCH_HEAD -- .claude/state/planning-manifest.json 2>/dev/null || true)
```

**Do NOT proceed to Phase 1 until `ubtstack/scripts/validate-review-packet.ts` exists.** If it does not exist after running the above, transition the ticket to Rework with the error.

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

All code changes go in `$TARGET_REPO_DIR/`.

1. Extend current patterns where reasonable; do not rewrite unrelated architecture
2. Satisfy all acceptance criteria listed in the ticket

#### TDD methodology

Use vertical slicing (red-green-refactor), not horizontal slicing:

WRONG (horizontal): write all tests → write all code
RIGHT (vertical):   test1→impl1 → test2→impl2 → test3→impl3

For each behavior in the acceptance criteria:
1. RED: Write one test that describes expected behavior through the public interface. Verify it fails.
2. GREEN: Write minimal code to make that test pass.
3. Repeat for the next behavior.

After all behaviors pass, run a refactor pass: extract duplication, deepen shallow modules, remove dead code.

Rules:
- Tests verify behavior through public interfaces, not implementation details
- One test at a time — do not write all tests first
- Mock only at system boundaries (external APIs, databases, time) — not internal collaborators
- Never refactor while RED — get to GREEN first

### Phase 3 — Test

Tests written during Phase 2 (TDD loop) count toward required test categories.
Phase 3 verifies completeness — if TDD covered all required categories, this
phase confirms it. If gaps remain, add the missing categories here.

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

Run the test commands listed in the ticket from inside `$TARGET_REPO_DIR/`.

#### tests_passed semantics

`tests_passed` in the review packet means **`cargo test` results only**. Set `tests_passed=true` if all `cargo test` commands pass, regardless of clippy results.

#### Clippy and out-of-scope lint debt

Run `cargo clippy -p <crate> --no-deps -- -D warnings` to lint only the target crate. If clippy fails on crates **outside your allowed paths** (pre-existing lint debt), this does not block your ticket. Add a note in the review packet but keep `tests_passed=true`.

#### Package name convention

If a ticket references a package name that isn't found, check for a workspace-specific prefix (e.g., `cargo test -p <prefix>-<name>`). Use the working package name and note the correction in the review packet.

### Phase 4 — Validate

Run the review-packet validator to check your work:

```bash
npx tsx ubtstack/scripts/validate-review-packet.ts \
  $TARGET_REPO_DIR/.claude/state/planning-manifest.json \
  $TARGET_REPO_DIR/.claude/state/review-packet-$ISSUE_ID.json
```

If validation fails, fix the gaps before proceeding.

### Phase 5 — PR

Open a PR **before** writing the review packet. The completion gate requires a PR URL.
Run git commands from inside `$TARGET_REPO_DIR/`.

```bash
cd $TARGET_REPO_DIR
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

Write `$TARGET_REPO_DIR/.claude/state/review-packet-$ISSUE_ID.json` using this structure (where `$ISSUE_ID` is the Linear issue identifier, e.g. `ENG-201`).
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
npx tsx ubtstack/scripts/symphony-complete-ticket.ts \
  $TARGET_REPO_DIR/.claude/state/planning-manifest.json \
  $TARGET_REPO_DIR/.claude/state/review-packet-$ISSUE_IDENTIFIER.json \
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
