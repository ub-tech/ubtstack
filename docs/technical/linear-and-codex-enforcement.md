# Linear and Codex enforcement model

## Conductor

Conductor is optional in this workflow. You do not need it to make the sandwich model work.

Use Conductor only if you want a dedicated multi-agent workspace UI, parallel branch management, or a visual cockpit for Claude/Codex sessions.

If Symphony already handles Linear intake, worktree creation, and Codex dispatch, the core flow works without Conductor:
- Claude + ubtstack for planning
- Symphony + Linear for ticketization and coordination
- Codex for bounded implementation
- Claude + ubtstack for review, QA, and ship

## Linear

Symphony should create one feature epic and one or more bounded issues. Each issue should be rendered from the structured template in `.claude/templates/linear-issue-body.template.md`.

That issue body is intended to be both human-readable and machine-usable. It carries:
- product problem
- bounded scope
- non-goals
- inputs including PRD, architecture, and existing code context
- allowed paths
- change classification flags
- implementation guidance
- acceptance criteria
- explicit test requirements
- explicit QA requirements
- escalation rule

The required test and QA categories are not left to memory or manual discipline. Symphony computes them automatically from `change_classification` during ticket generation.

## Codex

Codex should never infer architecture from scratch when a planning manifest already exists.

Codex should receive a ticket-specific brief generated from `scripts/generate-codex-prompt.ts` and should:
- inspect referenced existing code modules first
- inspect existing tests first
- stay within allowed paths
- extend current patterns where reasonable
- satisfy all auto-enforced required test categories
- justify every skipped conditional test category
- call out missing QA evidence
- escalate ambiguity instead of expanding scope


## Review-packet validation

Before Claude `/review` or `/ship`, validate the implementation evidence against the planning contract.

Use `scripts/validate-review-packet.ts` to compare the review packet with the planning manifest. The validator checks:
- manifest-derived required test categories versus generated categories
- whether every conditional test category has either evidence or an explicit skip reason
- manifest-derived QA requirements versus `ci_qa.completed` and `cd_qa.deferred` (or legacy `qa_completed`/`qa_deferred`)
- whether test commands were actually run
- whether the baseline review checklist is present

Recommended sequence:
1. Codex implements and emits a review packet
2. Symphony stores the packet at `.claude/state/review-packet-{TICKET_ID}.json` (per-ticket naming; falls back to `review-packet.json` for backward compatibility)
3. Run `node scripts/validate-review-packet.ts .claude/state/planning-manifest.json .claude/state/review-packet-{TICKET_ID}.json`
4. Only re-enter Claude `/review` if validation passes or the remaining gaps are intentionally accepted and documented


## Symphony enforcement at completion time

Ticket generation is not enough. Symphony should also enforce the gate at completion time.

Recommended implementation:

```bash
node scripts/symphony-complete-ticket.ts   .claude/state/planning-manifest.json   .claude/state/review-packet-ENG-201.json   --ticket ENG-201   --mode complete
```

Expected behavior:
- exit code `0`: ticket may advance according to workflow policy
- exit code `1`: ticket must remain blocked
- JSON output becomes the durable audit record for why the gate passed or failed

This makes Symphony the enforcer of the review-packet validator rather than relying on a human to remember to run it.


## Linear status updater contract
The workflow now treats Linear status as a state machine aligned with Symphony (odysseus0/symphony) conventions. Symphony should consult `.claude/templates/linear-status-contract.template.json` before updating any ticket. Use `scripts/resolve-linear-transition.ts` to map an outcome to the next permitted status. This prevents invalid moves such as `In Progress -> Done` or `Rework -> Done`.

Custom Linear states required: `Rework`, `Human Review`, `Merging`. Run `npx tsx scripts/linear-discover-team.ts` to verify your team has them configured.
