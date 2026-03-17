# Apply instructions

This drop-in pack updates the planning, Linear handoff, and Codex execution layers.

## Included

- `CLAUDE.md` — testing/QA policy and planning input rules
- `.claude/commands/kickoff.md` — sandwich workflow entry point
- `.claude/commands/plan-to-linear.md` — manifest generation requirements
- `.claude/templates/planning-manifest.template.json` — manifest with existing-code context, change classification, and test/QA fields
- `.claude/templates/review-packet.template.json` — review re-entry artifact
- `.claude/templates/linear-issue-body.template.md` — exact Linear issue body shape Symphony should render
- `scripts/import-plan-to-linear.ts` — dry-run payload generator for Linear epic + issue creation with automatic test/QA enforcement
- `scripts/generate-codex-prompt.ts` — strict Codex prompt generator enforcing scope, existing-code inspection, and required test/QA categories
- `scripts/validate-review-packet.ts` — validator that compares a review packet against the manifest-derived test and QA obligations before `/ship`
- `docs/technical/linear-and-codex-enforcement.md` — enforcement and optional-Conductor notes

## Recommended flow

### First-time setup
1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set `LINEAR_API_KEY`
3. Discover your Linear team and verify workflow states: `npx tsx scripts/linear-discover-team.ts`
4. Add missing custom states in Linear team settings: `Rework`, `Human Review`, `Merging`
5. Set `LINEAR_PROJECT_SLUG` and `TARGET_REPO_URL` in your environment for Symphony

### Per-feature flow
1. Run planning through `/kickoff`.
2. Produce `.claude/state/planning-manifest.json` with `/plan-to-linear`.
3. Ensure each ticket has `change_classification` filled out.
4. Dry-run Linear payloads:
   - `npx tsx scripts/import-plan-to-linear.ts .claude/state/planning-manifest.json`
5. Create issues in Linear:
   - `npx tsx scripts/import-plan-to-linear.ts .claude/state/planning-manifest.json --execute --team <YOUR_TEAM_KEY>`
6. Symphony picks up issues from `Todo` and dispatches Codex with:
   - `npx tsx scripts/generate-codex-prompt.ts .claude/state/planning-manifest.json ENG-101`
7. After implementation, Codex emits `.claude/state/review-packet.json`.
8. Symphony validates via completion gate:
   - `npx tsx scripts/symphony-complete-ticket.ts .claude/state/planning-manifest.json .claude/state/review-packet.json --ticket ENG-101 --mode complete`
9. On pass: ticket moves to `Human Review`. Route through `/review` (code review + QA gate) and `/ship`.
10. On fail: ticket moves to `Rework`. Symphony re-dispatches Codex.

## Important behavior changes

- Conductor is optional; Symphony + Linear + Codex are sufficient for the core SDLC.
- Planning can ingest PRD, architecture guidance, and existing code context.
- CEO planning still outputs product decisions, not engineering design.
- Engineering planning must capture current code modules, interfaces, and tests when relevant.
- Linear issues now carry explicit change classification, required test categories, and QA requirements.
- Symphony computes required test and QA gates from change classification automatically.
- Codex prompts now require inspection of existing code and tests before editing.

## Review packet validation

The review-packet validator is the final enforcement gate before `/ship`.
It compares the manifest-derived requirements with the implementation evidence in the review packet:
- required test categories
- conditional categories that need either execution or an explicit skip reason
- QA requirements
- allowed path compliance
- evidence that tests were actually run
- baseline review checklist items


## Symphony completion gate

Before Symphony marks a Linear issue complete, it should run:

```bash
npx tsx scripts/symphony-complete-ticket.ts   .claude/state/planning-manifest.json   .claude/state/review-packet.json   --ticket ENG-201   --mode complete
```

Behavior:
- runs `scripts/validate-review-packet.ts`
- blocks completion if required test categories, QA gates, allowed path checks, or review checklist items are missing
- emits machine-readable JSON for Symphony logs and a human-readable failure summary for operators

Recommended Symphony workflow:
1. Codex finishes implementation and emits `review-packet.json`
2. Symphony runs `validate-review-packet.ts`
3. Symphony runs `symphony-complete-ticket.ts --mode complete`
4. Only if the exit code is 0 may Symphony transition the Linear ticket forward
5. If the exit code is 1, Symphony must keep the ticket blocked and return the failure details to Claude review or re-planning


## New in v6: Linear status updater contract
- `.claude/templates/linear-status-contract.template.json` defines the canonical workflow states and allowed transitions.
- `scripts/resolve-linear-transition.ts` resolves an outcome like `validation_pass` or `validation_fail` into an allowed next status.
- `scripts/symphony-complete-ticket.ts` now enforces both review-packet validation and the Linear transition contract.
