
---
name: git
version: 1.0.0
description: |
  Git workflow discipline for agent implementation. Enforces branching,
  commit conventions, worktree isolation, and PR guardrails.
  Invoked by kickoff and ship; can also be used standalone.
---

# Git: Agent Workflow Discipline

You are running the `/git` workflow. This skill codifies how agents interact with git during implementation.

## Branch Rules

- **No direct commits to main.** All changes go through feature branches and PRs.
- **One issue = one worktree = one branch = one PR.** Each Linear ticket maps to a single isolated workspace, a single agent session, and a single PR. No multi-ticket PRs.
- **Branch naming:** `symphony/<TICKET_ID>` (e.g., `symphony/ENG-201`). Append `-v2`, `-v3` for rework iterations.

### Starting work on a ticket

```bash
git fetch origin main
git checkout -b symphony/<TICKET_ID> origin/main
```

If using worktrees:
```bash
git worktree add .claude/worktrees/<TICKET_ID> -b symphony/<TICKET_ID> origin/main
```

## Commit Conventions

All commits use conventional commit prefixes:
- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructuring without behavior change
- `test:` — adding or updating tests
- `chore:` — maintenance, dependency updates, config changes
- `docs:` — documentation only

### Commit ordering

Each commit must be independently valid and bisectable. Commit in this order:
1. Infrastructure changes (config, migrations, schemas)
2. Core logic with their tests
3. Integration code with their tests

### Commit quality

- Every commit compiles and passes tests on its own
- No "WIP" or "fixup" commits in the final branch
- Commit messages describe the **why**, not the **what**

## Prohibited Actions

- **No force push.** Ever.
- **No merge without approval.** Only the approver configured in `APPROVAL_REQUIRED_FROM` can approve and merge PRs. Agents do not merge.
- **No PR without passing tests.** Build, test, and lint must all pass before a PR is created.
- **No PRs over 400 LOC without approval.** If a diff exceeds 400 lines, warn and suggest splitting into smaller PRs.
- **No weakening tests to make them pass.** Fix the code, not the test.
- **No skipping the simplification pass.** Every PR gets a simplification pass before ship.

## Simplification Pass

Before shipping, review the diff for:
- Dead code
- Unused imports
- Redundant abstractions
- Over-engineering introduced during implementation

Remove them without changing behavior. Tests must still pass after simplification.

## Human Approval Gate

The final approval gate is human. The approver is configured via `APPROVAL_REQUIRED_FROM` in `.env`:
- Agents create PRs and request review from the configured approver
- Only the configured approver reviews, approves, and merges
- No automated merge is permitted
- The approver reviews: code quality, test coverage, spec compliance, security implications, and operational readiness

## Security Escalation

Any change that touches a trust boundary, cryptographic operation, signature verification, or fund-handling path requires explicit human review:
- Deposit/withdrawal flows
- Signature verification and proof generation
- Bridge operations
- Key management
- Authorization and authentication
- Balance calculations and state transitions involving funds

Agents must flag these changes and cannot self-approve them.
