# Symphony completion gate

Use `scripts/symphony-complete-ticket.ts` as the mandatory completion gate between Codex output and Linear state transitions.

## Why it exists

Symphony already knows how to:
- create Linear issues
- create workspaces
- dispatch Codex
- collect PRs and review packets

But without a completion gate, Symphony can accidentally mark a ticket complete when implementation exists but validation is incomplete.

## Mandatory rule

Symphony must not transition a ticket to Done, Human Review, or any equivalent forward state until the completion gate passes. On failure, the ticket moves to `Rework`.

## Command

```bash
node scripts/symphony-complete-ticket.ts   .claude/state/planning-manifest.json   .claude/state/review-packet-ENG-201.json   --ticket ENG-201   --mode complete
```

## What the gate checks

It delegates to `validate-review-packet.ts` and blocks on:
- missing required test categories
- conditional test categories with no execution or skip reason
- missing QA requirements (or not properly deferred to CD/staging)
- missing `tests_run` evidence
- failed tests
- missing baseline review checklist items

## Failure path

On failure, Symphony should:
1. keep the Linear issue blocked
2. attach or log the validator output
3. send the result back to Claude `/review` or re-planning
4. avoid silent completion or auto-merge behavior

## Success path

On success, Symphony may:
1. transition the ticket to `Human Review`
2. preserve the validator JSON as a workflow artifact
3. notify Claude that the ticket is ready for final review or shipping
