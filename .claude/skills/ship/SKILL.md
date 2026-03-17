
---
name: ship
version: 2.0.0
description: |
  Ship workflow: verify CD/staging results, run CI tests, validate review packet,
  simplification pass, create PR, request approval. Assumes /review has already passed.
  Integrates with Symphony and Linear status contract.
---

# Ship: Validated Ship Workflow

You are running the `/ship` workflow. This assumes `/review` has already passed (code review + QA gate validation). `/ship` verifies staging CD results, runs final CI tests, and creates a PR ready for approval.

**Only stop for:**
- On `main` branch (abort)
- Test failures (stop, show failures)
- CD/Staging verification failures
- Review-packet validation failures
- Completion gate failure

**Never stop for:**
- Uncommitted changes (always include them)
- Commit message approval (auto-commit)

---

## Step 1: Pre-flight

1. Check the current branch. If on `main`, **abort**: "You're on main. Ship from a feature branch."
2. Run `git status` (never use `-uall`).
3. Run `git diff main...HEAD --stat` and `git log main..HEAD --oneline` to understand what's being shipped.

---

## Step 2: CD/Staging Verification

Check if a staging environment is configured (env var `STAGING_URL`).

**If `STAGING_URL` is set:**
1. Read the review packet and check `cd.status`:
   - If `cd.status == "pass"`: CD tests passed. Continue.
   - If `cd.status == "fail"`: **STOP**. Show which tests failed from `cd.tests` where `status == "fail"`. These must be fixed before shipping.
   - If `cd.status == "pending"`: CD tests haven't been run yet. **STOP**. Run the target repo's CD pipeline first, then sync results with `sync-cd-results.ts`.
2. Verify each CD test category in `cd.tests` has `status: "pass"`

**If `STAGING_URL` is NOT set:**
Output a warning:
```
WARNING: No STAGING_URL configured. CD/staging verification skipped.
This means system, regression, and security tests have not been verified on staging.
Documenting as risk in PR description.
```

If `cd.status == "pending"` and no `STAGING_URL`, document as a known risk.

---

## Step 3: Merge origin/main

Fetch and merge `origin/main` into the feature branch so tests run against the merged state:

```bash
git fetch origin main && git merge origin/main --no-edit
```

If there are merge conflicts that can't be auto-resolved, **STOP** and show them.

---

## Step 4: Run CI tests

Run the CI-stage test commands (fast, deterministic):

```bash
cargo build 2>&1
cargo test 2>&1
cargo clippy -- -D warnings 2>&1
```

**If any test fails:** Show the failures and **STOP**.

---

## Step 5: Review-Packet Validation + Completion Gate

If the planning manifest and review packet exist, run the completion gate:

```bash
npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/symphony-complete-ticket.ts \
  .claude/state/planning-manifest.json \
  .claude/state/review-packet.json \
  --ticket "$TICKET_ID" \
  --current-status "In Progress" \
  --mode complete
```

**If exit code 1:** Show the failures. The ticket cannot ship. Address the gaps or escalate.
**If exit code 0:** Continue.

If no manifest exists, skip this step with a note.

---

## Step 6: Simplification Pass

Even if clean. Always run this step.

Review the diff against main:
- Remove dead code, unused imports, redundant abstractions
- Do not change behavior
- Tests must still pass

If simplification changes behavior, **abort and flag**.

---

## Step 7: Commit

Stage and commit changes in logical, bisectable chunks:

1. Infrastructure changes first (config, migrations)
2. Core logic with their tests
3. Integration code with their tests
4. Final commit with any remaining cleanup

Each commit must be independently valid. Use conventional commit prefixes:
- `feat:` — New feature
- `fix:` — Bug fix
- `refactor:` — Code restructuring
- `test:` — Adding/updating tests
- `chore:` — Maintenance, deps

---

## Step 8: Push

```bash
git push -u origin $(git branch --show-current)
```

---

## Step 9: Create PR

```bash
gh pr create --title "<type>: <summary>" --body "$(cat <<'EOF'
## Summary
<bullet points describing the change>

## Planning Manifest
- Feature: <feature_id>
- Ticket: <ticket_id>

## Review Summary
<findings from /review, or "No issues found.">

## CD/Staging Results
<results from Step 2, or "No staging environment — CD verification skipped (documented as risk).">

## Review-Packet Validation
<results from Step 5, or "No manifest — skipped.">

## Test plan
- [x] cargo build passes
- [x] cargo test passes
- [x] cargo clippy clean
- [x] /review passed (code review + QA gate)
- [x] Review-packet validation passed
- [ ] CD/staging verification <passed / skipped — no staging>

## Approval Required
@$APPROVAL_REQUIRED_FROM — please review and approve.
EOF
)"
```

**Output the PR URL** — this is the final output.

---

## Step 10: Linear Status Update

If the completion gate passed, the ticket should transition to `Human Review`.
Report the recommended Linear transition to the user:

```
Ticket <ID> is ready for Human Review.
Recommended Linear transition: In Progress -> Human Review
```

**Agents do not merge. Only the approver designated by `APPROVAL_REQUIRED_FROM` in `.env` can approve and merge.**

---

## Important Rules

- **Never skip tests.** If tests fail, stop.
- **Never force push.**
- **Never merge.** Only create the PR and request approval.
- **Diff size guard:** If diff > 400 LOC, warn and suggest splitting into smaller PRs.
- **`/review` is a prerequisite.** `/ship` does not run inline code review. Run `/review` first.
