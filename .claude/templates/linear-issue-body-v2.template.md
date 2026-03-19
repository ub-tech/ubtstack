## Summary
<1-3 sentence description of the task and why it exists>

**Thin Vertical:** <TV-xxx: journey name>
**Product Goals:** <PG-xxx list>
**Time Estimate:** <X hours for a human coder>
**Slice Type:** <AFK / HITL>

## Problem
<What problem this ticket solves, grounded in the product brief context>

## Scope
- <bounded change 1>
- <bounded change 2>
- <bounded change 3>

## Non-Goals
- <explicitly excluded item 1>
- <explicitly excluded item 2>

## Inputs
- Product Brief: <path>
- Architecture Brief: <path>
- Planning Manifest: <path>
- Related Tickets: <IDs>
- External Drivers: <references>

## Services & Components Impacted

| Process | Component | Change Detail |
|---------|-----------|---------------|
| PROC-xxx | COMP-xxx [name] | <what changes> |

## Interfaces Impacted

| Interface | Provider → Consumer | Change Type | Breaking? |
|-----------|-------------------|-------------|-----------|
| IF-xxx | PROC-xxx → PROC-xxx | modified / read_only / new | yes / no |

## Change Classification
- Domain Logic Changed: <yes/no>
- Module Boundary Changed: <yes/no>
- API Contract Changed: <yes/no>
- User Workflow Changed: <yes/no>
- Throughput / Latency Path Changed: <yes/no>
- Trust Boundary or External Input Changed: <yes/no>
- Bug Fix / Regression Risk: <yes/no>
- Operational Behavior Changed: <yes/no>

## Implementation Guidance
- <important design constraint 1>
- <important invariant 2>
- <naming / interface requirement 3>

## Acceptance Criteria

| ID | Criterion | Evidence Type |
|----|-----------|---------------|
| ENG-xxx | <criterion> | test_pass / code_change / config_updated |

## Constraints
- C-xxx: <constraint from planning manifest>
- C-xxx: <constraint from planning manifest>

## Test Traceability Matrix

| Trace ID | Product Goal | Eng Criterion | Test Type | Interface | Test File | Stage | Success Criteria |
|----------|-------------|---------------|-----------|-----------|-----------|-------|------------------|
| TM-xxx-01 | PG-xxx | ENG-xxx | unit | — | path/to/test | CI | <what pass means> |
| TM-xxx-02 | PG-xxx | ENG-xxx | integration | IF-xxx | path/to/test | CI | <what pass means> |
| TM-xxx-03 | PG-xxx | ENG-xxx | system | IF-xxx | path/to/test | CD | <what pass means> |

**Extra Testing Notes:** <specific tests to run, special flags, environment setup>

## Test Commands
```bash
<command 1>
<command 2>
```

## Dependencies
- Depends on: <ticket IDs>
- Blocks: <ticket IDs>

## Escalation Rule
<When to stop and return to planning. Be specific about the ambiguity trigger.>

## Attestation Requirements

**CI Attestation:** Required before merge. Validated during `/ship`. Human operator must run all CI-stage tests from the traceability matrix, capture logs, and create attestation via `scripts/create-attestation.ts --stage CI`.

**CD Attestation:** Created during `/deploy` (tag-based, after merge). Human operator deploys to staging, runs all CD-stage tests for all tickets in the release tag, and creates attestation via `scripts/create-attestation.ts --stage CD`. CD attestation is per-tag, not per-ticket.

Both attestations must be signed by the operator configured in `APPROVAL_REQUIRED_FROM`.

## Workflow Status Contract
- Initial Status: Todo
- Symphony may move: Todo → In Progress → Human Review or Rework
- Claude may move: Human Review → Merging or Rework
- Only a successful merge (with CI attestation) moves a ticket to Done. CD attestation is per-tag via `/deploy`
- Rework tickets may return to Todo after re-plan or retry
