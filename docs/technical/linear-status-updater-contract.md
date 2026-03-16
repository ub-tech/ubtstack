# Linear status updater contract

This contract defines how Symphony and Claude are allowed to move Linear tickets.
Aligned with Symphony (odysseus0/symphony) state conventions.

## Canonical statuses
- Backlog
- Todo
- In Progress
- Human Review
- Rework
- Merging
- Done

## Custom Linear states required
Symphony requires these custom workflow states in your Linear team settings:
- **Rework** — issue needs fixes before re-review
- **Human Review** — implementation passed validation, awaiting Claude review
- **Merging** — Claude approved, agent handles PR merge

Run `npx tsx scripts/linear-discover-team.ts` to check which states are present.

## Ownership
- **Symphony** owns operational transitions through execution and validator outcomes.
- **Claude** owns final review transitions from Human Review to Merging or Rework.

## Allowed transitions
- Backlog -> Todo
- Todo -> In Progress
- Todo -> Rework
- In Progress -> Human Review
- In Progress -> Rework
- Human Review -> Merging
- Human Review -> Rework
- Merging -> Done
- Merging -> Rework
- Rework -> Todo
- Rework -> In Progress

## Disallowed transitions
- In Progress -> Done
- Todo -> Done
- Rework -> Done

## Outcome mapping
- planning_import -> Todo
- execution_start -> In Progress
- validation_pass -> Human Review
- validation_fail -> Rework
- claude_review_pass -> Merging
- claude_review_fail -> Rework
- merge_complete -> Done
- replan_or_retry -> Todo

## Automation
Use `scripts/resolve-linear-transition.ts` to compute the next status and verify it is legal before any automated update.
