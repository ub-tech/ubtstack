---
name: ship
version: 3.0.0
description: |
  Unified post-TDD ship workflow: structural code review (two-pass checklist),
  CI evidence validation, simplification pass, and PR creation.
  Replaces the former separate /review + /ship steps.
  CD testing is decoupled — handled by /deploy at the tag level.
---

# Ship: Structural Review + CI Validation + PR

You are running the `/ship` workflow. This is the single post-TDD, per-ticket skill. It performs structural code review, validates CI evidence, and creates a PR ready for human approval.

CD testing is **not** part of `/ship`. CD tests run at the tag level via `/deploy` after tickets are merged and tagged.

**Only stop for:**
- On `main` branch (abort)
- Test failures (stop, show failures)
- CRITICAL structural review findings (stop, ask user)
- CI evidence validation failures
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

## Step 1.5: Mode selection

AskUserQuestion: **"How do you want to ship this?"**

- **A) Full review (Recommended)** — Structural code review, CI validation, completion gate, simplification pass, then PR.
- **B) Vibe mode** — Skip review and validation. Merge main, commit, push, create PR. You review the diff yourself.

If the user selects **B (Vibe mode)**, skip Steps 3–6 entirely. Jump from Step 2 (merge main) directly to Step 7 (commit). The PR body uses the simplified vibe-mode template (see Step 9).

---

## Step 2: Merge origin/main

Fetch and merge `origin/main` into the feature branch so tests run against the merged state:

```bash
git fetch origin main && git merge origin/main --no-edit
```

If there are merge conflicts that can't be auto-resolved, **STOP** and show them.

---

## Step 3: Run CI tests

Run the CI-stage test commands (fast, deterministic):

```bash
cargo build 2>&1
cargo test 2>&1
cargo clippy -- -D warnings 2>&1
```

**If any test fails:** Show the failures and **STOP**.

---

## Step 4: Structural code review (two-pass checklist)

Read `.claude/skills/ship/checklist.md`.

**If the file cannot be read, STOP and report the error.** Do not proceed without the checklist.

### Get the diff

```bash
git fetch origin main --quiet
git diff origin/main
```

### Two-pass review

Apply the checklist against the diff in two passes:

1. **Pass 1 (CRITICAL):** Data Safety & State Integrity, Race Conditions & Concurrency, Trust Boundary Violations, Cryptographic Safety
2. **Pass 2 (INFORMATIONAL):** Error Handling, Logic & Correctness, Dead Code & Consistency, Test Gaps, Performance

Follow the output format specified in the checklist. Respect the suppressions — do NOT flag items listed in the "DO NOT flag" section.

### Handle findings

- If CRITICAL issues found: output all findings, then for EACH critical issue use a separate AskUserQuestion with the problem, your recommended fix, and options (A: Fix it now, B: Acknowledge, C: False positive — skip).
  After all critical questions are answered, output a summary of what the user chose. If the user chose A (fix), apply the recommended fixes. If only B/C, no action needed.
- If only non-critical issues found: output findings. No further action needed.
- If no issues found: output `Structural Review: No issues found.`

Reference materials for issue taxonomy are available at `.claude/skills/ship/references/`.

---

## Step 4.5: Review-packet traceability validation

**Per-ticket packet discovery:** Derive the ticket ID from the current branch name (e.g., `symphony/ENG-201` -> `ENG-201`, `symphony/ENG-201-v2` -> `ENG-201`). Try `.claude/state/review-packet-{TICKET_ID}.json` first. If it does not exist, fall back to `.claude/state/review-packet.json` for backward compatibility.

If `.claude/state/planning-manifest.json` and a review packet both exist, run the review-packet validator:

```bash
TICKET_ID=$(git branch --show-current | sed 's|^symphony/||' | sed 's|-v[0-9]*$||')
REVIEW_PACKET=".claude/state/review-packet-${TICKET_ID}.json"
[ ! -f "$REVIEW_PACKET" ] && REVIEW_PACKET=".claude/state/review-packet.json"

npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/validate-review-packet.ts .claude/state/planning-manifest.json "$REVIEW_PACKET"
```

Include the validation results:
- Were all required test categories generated?
- Were conditional test categories either generated or explicitly skipped?
- Does `ci.status == "pass"`?
- Were tests actually run?

If validation fails, include the failures as CRITICAL findings.

### v2 Traceability validation (if review packet has test_traceability_matrix)

If the review packet contains a `test_traceability_matrix` array, perform additional checks:

1. **Criterion coverage:** Every `ENG-xxx` acceptance criterion in the ticket must have at least one TM-xxx row with `status: "PASS"`.
2. **No orphan tests:** Every TM-xxx row must trace to a valid `ENG-xxx` criterion.
3. **Interface coverage:** Every `IF-xxx` listed in `interfaces_impacted` in the manifest must have at least one TM-xxx row with `test_type: "integration"`.
4. **Product goal traceability:** Every TM-xxx row must have a non-null `product_goal` (PG-xxx).

Report any gaps as CRITICAL findings.

---

## Step 4.6: CI attestation validation

Check for CI attestation:

```bash
TICKET_ID=$(git branch --show-current | sed 's|^symphony/||' | sed 's|-v[0-9]*$||')
ATTESTATION=".claude/state/attestation-${TICKET_ID}-CI.json"
[ -f "$ATTESTATION" ] && npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/validate-attestation.ts "$ATTESTATION"
```

If CI attestation exists:
- Verify GPG signature is valid
- Verify operator matches `APPROVAL_REQUIRED_FROM`
- Verify `git_ref` matches the current branch HEAD
- Report status in review output

If CI attestation does NOT exist:
- Report as **CRITICAL**: "CI attestation missing. Human operator must run CI tests and create attestation via `scripts/create-attestation.ts --stage CI` before merge."

### CI gate summary

Verify `ci.status == "pass"` and each required CI test category passed:
- Build passes
- Lint / static analysis clean
- Unit tests pass
- Integration tests pass (if applicable)
- Smoke tests pass (if applicable)

Produce one of:
- **PASS** — `ci.status == "pass"`, no CRITICAL structural issues
- **PASS WITH RISKS** — CI passes, but some informational issues noted
- **FAIL** — `ci.status != "pass"` or required CI test categories missing or CRITICAL structural issues unresolved

---

## Step 5: Completion gate

If the planning manifest and review packet exist, run the completion gate:

```bash
TICKET_ID=$(git branch --show-current | sed 's|^symphony/||' | sed 's|-v[0-9]*$||')
REVIEW_PACKET=".claude/state/review-packet-${TICKET_ID}.json"
[ ! -f "$REVIEW_PACKET" ] && REVIEW_PACKET=".claude/state/review-packet.json"

npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/symphony-complete-ticket.ts \
  .claude/state/planning-manifest.json \
  "$REVIEW_PACKET" \
  --ticket "$TICKET_ID" \
  --current-status "In Progress" \
  --mode complete
```

**If exit code 1:** Show the failures. The ticket cannot ship. Address the gaps or escalate.
**If exit code 0:** Continue.

If no manifest exists, skip this step with a note.

---

## Step 6: Simplification pass

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

### Full review mode

```bash
gh pr create --title "<type>: <summary>" --body "$(cat <<'EOF'
## Summary
<bullet points describing the change>

## Planning Manifest
- Feature: <feature_id>
- Ticket: <ticket_id>

## Structural Review Summary
<findings from Step 4, or "No issues found.">

## CI Evidence
- CI Status: <pass / fail>
- CI Attestation: <present + valid / missing>
- Traceability: <all criteria covered / gaps listed>

## Review-Packet Validation
<results from Step 5, or "No manifest — skipped.">

## Test plan
- [x] cargo build passes
- [x] cargo test passes
- [x] cargo clippy clean
- [x] Structural code review completed
- [x] CI evidence validated
- [x] Review-packet validation passed

## Approval Required
@$APPROVAL_REQUIRED_FROM — please review and approve.

---
*CD testing runs at the tag level via `/deploy` after merge.*
EOF
)"
```

### Vibe mode

```bash
gh pr create --title "<type>: <summary>" --body "$(cat <<'EOF'
## Summary
<bullet points describing the change>

## Vibe mode
Shipped without structural review, CI validation, or completion gate.
Human reviewer owns the quality check.

## Diff
`git diff main...HEAD --stat`

## Approval Required
@$APPROVAL_REQUIRED_FROM — please review and approve.
EOF
)"
```

**Output the PR URL** — this is the final output.

---

## Step 10: Linear status update

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
- **No CD checks.** CD testing is tag-based via `/deploy`. Do not check `cd.status`, `STAGING_URL`, or reference `sync-cd-results.ts`.
- **Read the FULL diff before commenting.** Do not flag issues already addressed in the diff.
- **Be terse.** One line problem, one line fix. No preamble.
- **Only flag real problems.** Skip anything that's fine.
