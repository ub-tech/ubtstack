## Summary
<1-3 sentence description of the task and why it exists>

## Problem
<What problem this ticket solves>

## Scope
- <bounded change 1>
- <bounded change 2>
- <bounded change 3>

## Non-Goals
- <explicitly excluded item 1>
- <explicitly excluded item 2>

## Inputs
- PRD: <path or reference>
- Architecture Guidance: <path or reference>
- Existing Code Context: <paths/modules/files>
- Related Issues/PRs: <links or IDs>

## Repo / Surface Area
Repo: <repo-name>

Touched Components:
- <component/module 1>
- <component/module 2>

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
- [ ] <criterion 1>
- [ ] <criterion 2>
- [ ] <criterion 3>

## Test Requirements
Required:
- [ ] <required category 1>
- [ ] <required category 2>
- [ ] <required category 3>

Conditionally Required When Applicable:
- [ ] Functional API tests
- [ ] System / end-to-end tests
- [ ] Load tests
- [ ] Stress tests
- [ ] Security tests
- [ ] Fuzz tests
- [ ] UI/API interaction tests
- [ ] Error-path / resilience tests

## QA Requirements

**Agent-local (CI stage):**
- [ ] Build passes
- [ ] Lint clean
- [ ] Unit tests pass
- [ ] Integration tests pass (if applicable)
- [ ] Smoke tests pass

**Deferred to CD/staging pipeline:**
- [ ] Staging smoke pass
- [ ] Critical flow verification
- [ ] Regression verification
- [ ] System / e2e tests (if applicable)
- [ ] Security tests (if applicable)

**Agent-documented (verified during /review):**
- [ ] Rollback plan documented
- [ ] Monitoring/alerts updated if applicable

## Automation Enforcement
Symphony must compute required test and QA gates from the Change Classification above.
Codex must satisfy all Required items and explicitly justify any skipped conditional category.

## Test Commands
```bash
<command 1>
<command 2>
<command 3>
```

## Dependencies
- Depends on: <ticket IDs>
- Blocks: <ticket IDs>

## Escalation Rule
If architecture is ambiguous or required test/QA categories cannot be completed, stop and return to planning.

## Deliverables
- <code deliverable 1>
- <test deliverable 2>
- <docs/schema deliverable 3>


## Workflow Status Contract
- Initial Status: Todo
- Symphony may move: Todo → In Progress → Human Review or Rework
- Claude may move: Human Review → Merging
- Only a successful merge moves a ticket to Done
- Rework tickets may return to Todo after re-plan or retry
