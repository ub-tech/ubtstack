# QA Report: {FEATURE_ID}

| Field | Value |
|-------|-------|
| **Date** | {DATE} |
| **Branch** | {BRANCH} |
| **Commit** | {COMMIT_SHA} |
| **PR** | {PR_NUMBER} or -- |
| **Ticket** | {LINEAR_ISSUE} |
| **Mode** | Diff-aware / Full / Quick / Regression |
| **Duration** | {DURATION} |

## Release Recommendation: {PASS / PASS WITH RISKS / FAIL}

## Manifest Validation

| Check | Status |
|-------|--------|
| Required test categories | {PASS/FAIL: list missing} |
| Conditional test categories | {PASS/FAIL: list without disposition} |
| QA requirements | {PASS/FAIL: list missing} |
| Allowed paths | {PASS/FAIL: list violations} |
| Tests run | {PASS/FAIL} |

## Test Categories Exercised

| Category | Status | Evidence |
|----------|--------|----------|
| Unit | {PASS/FAIL/SKIP} | {command + result} |
| Integration | {PASS/FAIL/SKIP} | {command + result} |
| System | {PASS/FAIL/SKIP} | {command + result} |
| Regression | {PASS/FAIL/SKIP} | {command + result} |
| Error-path | {PASS/FAIL/SKIP} | {command + result} |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total** | **0** |

## Issues

### ISSUE-001: {Short title}

| Field | Value |
|-------|-------|
| **Severity** | critical / high / medium / low |
| **Category** | data-integrity / functional / security / performance / reliability / observability |

**Description:** {What is wrong, expected vs actual.}

**Evidence:** {Test output, log lines, or reproduction steps.}

---

## Risks

{List any known risks shipping with this change, even if all tests pass.}

## Skipped Categories

| Category | Reason |
|----------|--------|
| {category} | {why it was skipped} |
