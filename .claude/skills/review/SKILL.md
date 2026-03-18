
---
name: review
version: 3.0.0
description: |
  Pre-landing PR review with structural issue detection and CI/QA validation.
  Analyzes diff against main for data safety, concurrency, trust boundary
  violations, and other structural issues that tests don't catch.
  Two-pass code review plus CI gate validation and CD readiness assessment.
---

# Pre-Landing PR Review + QA Gate

You are running the `/review` workflow. This performs both code review AND QA gate validation. It replaces the former separate `/review` + `/qa` steps.

---

## Step 1: Check branch

1. Run `git branch --show-current` to get the current branch.
2. If on `main`, output: **"Nothing to review — you're on main or have no changes against main."** and stop.
3. Run `git fetch origin main --quiet && git diff origin/main --stat` to check if there's a diff. If no diff, output the same message and stop.

---

## Step 2: Read the checklist

Read `.claude/skills/review/checklist.md`.

**If the file cannot be read, STOP and report the error.** Do not proceed without the checklist.

---

## Step 3: Get the diff

Fetch the latest main to avoid false positives from a stale local main:

```bash
git fetch origin main --quiet
```

Run `git diff origin/main` to get the full diff. This includes both committed and uncommitted changes against the latest main.

---

## Step 4: Two-pass review

Apply the checklist against the diff in two passes:

1. **Pass 1 (CRITICAL):** Data Safety & State Integrity, Race Conditions & Concurrency, Trust Boundary Violations, Cryptographic Safety
2. **Pass 2 (INFORMATIONAL):** Error Handling, Logic & Correctness, Dead Code & Consistency, Test Gaps, Performance

Follow the output format specified in the checklist. Respect the suppressions — do NOT flag items listed in the "DO NOT flag" section.

---

## Step 4.5: Review-packet validation (if manifest exists)

**Per-ticket packet discovery:** Derive the ticket ID from the current branch name (e.g., `symphony/ENG-201` → `ENG-201`, `symphony/ENG-201-v2` → `ENG-201`). Try `.claude/state/review-packet-{TICKET_ID}.json` first. If it does not exist, fall back to `.claude/state/review-packet.json` for backward compatibility.

If `.claude/state/planning-manifest.json` and a review packet (per-ticket or legacy) both exist, run the review-packet validator:

```bash
# Derive ticket ID from branch
TICKET_ID=$(git branch --show-current | sed 's|^symphony/||' | sed 's|-v[0-9]*$||')
REVIEW_PACKET=".claude/state/review-packet-${TICKET_ID}.json"
[ ! -f "$REVIEW_PACKET" ] && REVIEW_PACKET=".claude/state/review-packet.json"

npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/validate-review-packet.ts .claude/state/planning-manifest.json "$REVIEW_PACKET"
```

Include the validation results in the review output:
- Were all required test categories generated?
- Were conditional test categories either generated or explicitly skipped?
- Does `ci.status == "pass"`?
- Does `cd.status == "pending"` (expected at review time)?
- Were tests actually run?

If validation fails, include the failures as CRITICAL findings.

---

## Step 4.6: CI + QA Gate Validation

After review-packet validation, assess CI and QA readiness using the stage-based model:

### Gate 1 — CI validation

Verify `ci.status == "pass"` and each required CI test category passed:
- Build passes
- Lint / static analysis clean
- Unit tests pass
- Integration tests pass
- Smoke tests pass

If a review packet exists, check `ci.tests` for per-category pass/fail evidence. If no review packet, check test output directly.

### Gate 2 — Test portfolio validation

- Verify required CI test categories from the manifest each have a passing entry in `ci.tests`
- Verify `cd.status == "pending"` (expected — CD hasn't run yet at this stage)

### Gate 3 — CD readiness

- Rollback plan exists (documented in review packet or PR description)
- Monitoring/alerts adequate for the change (or documented as not applicable)

### QA Assessment

Produce one of:
- **PASS** — `ci.status == "pass"`, `cd.status == "pending"`, no risks
- **PASS WITH RISKS** — CI passes, but some CD readiness items are incomplete (document which)
- **FAIL** — `ci.status != "pass"` or required CI test categories are missing

---

## Step 5: Output findings

**Always output ALL findings** — both critical and informational. The user must see every issue.

- If CRITICAL issues found: output all findings, then for EACH critical issue use a separate AskUserQuestion with the problem, your recommended fix, and options (A: Fix it now, B: Acknowledge, C: False positive — skip).
  After all critical questions are answered, output a summary of what the user chose for each issue. If the user chose A (fix) on any issue, apply the recommended fixes. If only B/C were chosen, no action needed.
- If only non-critical issues found: output findings. No further action needed.
- If no issues found: output `Pre-Landing Review: No issues found.`

---

## Step 5.5: Release recommendation

Based on combined code review and QA gate results:

- If review finds **no CRITICAL issues** AND CI gates **PASS** → output: **"Ready for CD/staging"**
- If review finds **CRITICAL issues** OR CI gates **FAIL** → output: **"Not ready — fix before CD"** with specific items to address

Include a summary section:
```
## Review + QA Summary
- Code Review: <PASS / N issues found>
- CI Gates: <PASS / PASS WITH RISKS / FAIL>
- CD Readiness: <Ready / Not ready — reason>
- Release Recommendation: <Ready for CD/staging / Not ready — fix before CD>
```

---

## Important Rules

- **Read the FULL diff before commenting.** Do not flag issues already addressed in the diff.
- **Read-only by default.** Only modify files if the user explicitly chooses "Fix it now" on a critical issue. Never commit, push, or create PRs.
- **Be terse.** One line problem, one line fix. No preamble.
- **Only flag real problems.** Skip anything that's fine.
- **Review against the planning manifest when available.** Spec compliance, test adequacy, and acceptance criteria are all part of the review.
- **QA reference materials** are available at `.claude/skills/qa/references/` and `.claude/skills/qa/templates/` if needed for issue taxonomy or report formatting.
