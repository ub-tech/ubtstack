# Pre-Landing Review Checklist

## Instructions

Review the `git diff origin/main` output for the issues listed below. Be specific — cite `file:line` and suggest fixes. Skip anything that's fine. Only flag real problems.

**Two-pass review:**
- **Pass 1 (CRITICAL):** Run Data Safety, Concurrency, and Trust Boundary categories first. These can block `/ship`.
- **Pass 2 (INFORMATIONAL):** Run all remaining categories. These are included in the PR body but do not block.

**Output format:**

```
Pre-Landing Review: N issues (X critical, Y informational)

**CRITICAL** (blocking /ship):
- [file:line] Problem description
  Fix: suggested fix

**Issues** (non-blocking):
- [file:line] Problem description
  Fix: suggested fix
```

If no issues found: `Pre-Landing Review: No issues found.`

Be terse. For each issue: one line describing the problem, one line with the fix. No preamble, no summaries, no "looks good overall."

---

## Review Categories

### Pass 1 — CRITICAL

#### Data Safety & State Integrity
- Unvalidated external input written directly to state (deposits, orders, balances)
- TOCTOU races: check-then-modify patterns that should be atomic
- State transitions that don't use atomic compare-and-swap or conditional updates
- Missing idempotency guards on operations that could be replayed (deposits, withdrawals, settlements)
- Balance calculations using floating point instead of fixed-point or integer arithmetic

#### Race Conditions & Concurrency
- Read-check-write without uniqueness constraint or retry (concurrent insert/update)
- Status transitions without atomic WHERE old_status = ? UPDATE
- Lock ordering violations that could deadlock
- Shared mutable state accessed without proper synchronization (Mutex, RwLock)
- Channel operations that could block indefinitely (unbounded sends, missing timeouts)

#### Trust Boundary Violations
- External input (API params, on-chain events, user signatures) used without validation
- Proof verification results accepted without checking all required fields
- Cross-service data accepted without re-validation at the boundary
- Serialized data deserialized without schema validation

#### Cryptographic Safety
- Signature verification that doesn't bind to the full message context
- Hash computations that don't include all relevant fields (replay risk)
- Non-constant-time comparisons on secrets or cryptographic values
- Randomness from non-cryptographic sources for security-sensitive operations

### Pass 2 — INFORMATIONAL

#### Error Handling
- `unwrap()` or `expect()` in non-test code without documented invariant
- Error types that discard context (converting detailed errors to generic ones)
- Errors logged but not propagated (swallowed errors)
- Missing error paths for network/IO operations (timeouts, connection failures)

#### Logic & Correctness
- Conditional side effects applied on one branch but not the other
- Log messages that claim an action happened but the action was conditionally skipped
- Off-by-one errors in pagination, batch processing, or range calculations
- Integer overflow/underflow in arithmetic operations (especially amounts, fees)

#### Dead Code & Consistency
- Variables assigned but never read
- Comments/docstrings that describe old behavior after the code changed
- Unused imports or dead modules
- Feature flags or conditional paths that are always true/false

#### Test Gaps
- Negative-path tests that assert error type but not the state after the error
- Missing tests for concurrent access patterns
- Tests that only verify happy path while the change introduces new error paths
- Security enforcement (auth, rate limiting, validation) without integration tests

#### Performance
- Unnecessary cloning of large data structures
- Database queries inside loops (N+1 pattern)
- Missing indexes on columns used in WHERE clauses
- Unbounded collection growth (Vec, HashMap without capacity limits)
- Serialization/deserialization in hot paths that could be avoided

---

## Gate Classification

```
CRITICAL (blocks /ship):          INFORMATIONAL (in PR body):
|- Data Safety & State Integrity  |- Error Handling
|- Race Conditions & Concurrency  |- Logic & Correctness
|- Trust Boundary Violations      |- Dead Code & Consistency
|- Cryptographic Safety           |- Test Gaps
                                   |- Performance
```

---

## Suppressions — DO NOT flag these

- "X is redundant with Y" when the redundancy is harmless and aids readability
- "Add a comment explaining why this threshold/constant was chosen" — thresholds change during tuning, comments rot
- "This assertion could be tighter" when the assertion already covers the behavior
- Suggesting consistency-only changes (wrapping a value in a conditional to match how another constant is guarded)
- Harmless no-ops (e.g., `.filter` on an element that's never in the collection)
- ANYTHING already addressed in the diff you're reviewing — read the FULL diff before commenting
