# plan-to-linear

Compile the output of `/plan-ceo-review` and `/plan-eng-review` into a machine-readable planning manifest for Symphony and Linear.

## Required output

Write `.claude/state/planning-manifest.json` using `${UBTSTACK_PATH:-../ubtstack}/.claude/templates/planning-manifest-v2.template.json`.

Create the directory first if it doesn't exist: `mkdir -p .claude/state`

## Rules

- One feature = one manifest
- One ticket = one TV (one behavior, one end-to-end path)
- Tickets must include:
  - id, title, repo (must match a registered alias in `.env` — see `REPO_<ALIAS>_URL`), type (feature/bugfix/refactor/infrastructure/migration), priority
  - depends_on (other ticket IDs in this manifest)
  - labels (format: `team:eng`, `service:PROC-xxx`, `domain:xxx`)
  - thin_vertical (TV-xxx reference from product brief)
  - time_estimate_hours (for a human coder — sanity check: >8h means split further)
  - services_impacted (PROC-xxx IDs from architecture brief)
  - slice_type (AFK/HITL)
  - scope, implementation_guidance
  - acceptance_criteria (array of objects with id: ENG-xxx, description, evidence_type)
  - allowed_paths, touched_components (COMP-xxx IDs)
  - change_classification (8 booleans)
  - test_traceability_matrix (array of TM-xxx rows — see below)
  - test_commands
  - deliverables (array with eng_criterion and evidence_type)
  - existing_code_context (components, current_tests, interfaces, notes)
  - escalation_rule

## Product context (required)

The manifest must include a `product_context` section with:
- `product_synopsis`: Structured format — "[Product Name] helps [target users] solve [problem] by [strategy]. Success is measured by [PG-xxx]. This session addresses [TV-xxx], which advances [PG-xxx] by [mechanism]."
- `product_synopsis_format`: The template string above (for validation)
- `product_goals_referenced`: Array of PG-xxx entries relevant to this session
- `thin_verticals_addressed`: Array of TV-xxx entries with `why_this_helps_users` explanation

## Constraints (merged)

All constraints in a single `constraints` array with typed entries:
```json
{"id": "C-001", "type": "product|engineering|security|compliance", "description": "...", "source": "product_brief|eng_review|compliance"}
```

No separate `fixed_constraints` or `hard_restrictions`.

## Test traceability matrix

Each ticket must include a `test_traceability_matrix` array. Each row:

```json
{
  "trace_id": "TM-ENG-101-01",
  "product_goal": "PG-001",
  "business_criterion": "BIZ-001 or null",
  "eng_criterion": "ENG-001",
  "test_type": "unit|integration|system|smoke|security|load|stress|fuzz|regression|error-path-resilience|functional-api",
  "interfaces_tested": ["IF-001"] or [],
  "test_file": "path/to/test_file",
  "extra_testing_notes": "specific tests to run or null",
  "stage": "CI|CD",
  "staging_requirements": "special env needs or null",
  "success_criteria": "what pass means for this test",
  "status": "NOT_RUN",
  "evidence": null,
  "staging_env_version": null,
  "git_ref": null,
  "timestamp": null,
  "operator": null,
  "operator_signature": null,
  "comments": null
}
```

Every ENG-xxx acceptance criterion must have at least one TM-xxx row. Rows with `interfaces_tested` populated form the basis for integration tests.

## TV sizing

Each TV ticket should be completable in ~4-8 hours by a human. If a TV estimates >8 hours, it likely covers multiple behaviors and should be split into separate TVs. RED/GREEN/REFACTOR is execution detail within the ticket, not separate planning artifacts.

## Vertical-slice methodology

Tickets must be tracer-bullet vertical slices, not horizontal layer slices. Each ticket cuts through all relevant layers end-to-end (schema, API, service logic, tests).

### Slice classification

Classify each ticket as:
- **AFK** — can be implemented and merged by an agent without human interaction (prefer this)
- **HITL** — requires a human decision or design review during implementation

Mark HITL tickets in `implementation_guidance` with the specific decision needed.

### Quiz step

Before writing the manifest, present the proposed breakdown as a numbered list showing:
- Title, Type (AFK/HITL), Time estimate, Blocked by, Acceptance criteria covered

Ask the user:
- Does the granularity feel right?
- Are dependency relationships correct?
- Should any tickets be merged or split?
- Are the correct tickets marked AFK vs HITL?
- Do the time estimates seem reasonable?

Iterate until approved, then write the manifest.

## Dependency graph (critical)

Every manifest MUST include a dependency graph that enforces correct build order. Agents execute tickets sequentially by number — a ticket that changes a shared type, event struct, or interface MUST block all downstream tickets that consume it.

**How to build the dependency graph:**

1. Identify shared boundaries: types, structs, events, interfaces, database schemas, public inputs
2. For each ticket, list what it **produces** (new types, changed interfaces) and what it **consumes** (existing types it depends on)
3. If ticket B consumes something ticket A produces or changes, B must have `"depends_on": ["A"]`
4. Validate: for every `depends_on` entry, confirm the dependency ticket is numbered lower
5. Validate: the full graph has no cycles
6. Validate: `cargo check` (or equivalent) would pass after each ticket is applied in dependency order

**Common mistakes:**
- Forgetting that changing a struct breaks all downstream pattern-matches — every consumer must depend on the producer
- Allowing two tickets to modify the same struct independently — one must depend on the other
- Not accounting for cross-crate dependencies

## Planning inputs

The manifest must preserve planning provenance:
- `product_brief_ref` and `architecture_brief_ref` paths
- PRD references
- Architecture guidance
- External drivers (with type, description, reference)
- Related incidents, prior PRs, customer feedback

## Engineering review section

The manifest's `engineering_review` must include:
- `interfaces_impacted`: Array of IF-xxx entries with change_type and breaking flag
- `components_impacted`: Array of COMP-xxx entries with change detail and test plan
- `risks`: Array of SR-xxx session risks linked to AR-xxx architecture risks
- `success_criteria`: Array of ENG-xxx criteria with product_goal and business_criterion traceability

## Change classification guidance

For each ticket, set the 8 booleans explicitly:
- `domain_logic_changed`
- `module_boundary_changed`
- `api_contract_changed`
- `user_workflow_changed`
- `throughput_or_latency_path_changed`
- `trust_boundary_or_external_input_changed`
- `bug_fix_or_regression_risk`
- `operational_behavior_changed`

These drive the test traceability matrix rows — each boolean implies specific test types.

## Business tasks

Non-engineering work items go to the **BIZ** team in Linear and are not dispatched to Codex.

Each business task must include: id, title, team, type, priority, depends_on, labels, description, acceptance_criteria, deliverables, owner, due_date.

## Attestation requirements

Every ticket automatically requires:
- **CI attestation** (per-ticket): Human operator runs CI-stage tests, creates GPG-signed attestation via `scripts/create-attestation.ts --stage CI`. Validated during `/ship`.
- **CD attestation** (per-tag): After tickets are merged and tagged, human operator runs CD-stage tests for all tickets in the release tag via `/deploy`, creates GPG-signed attestation via `scripts/create-attestation.ts --stage CD`.

Both must be signed by the operator configured in `APPROVAL_REQUIRED_FROM`.

## Final steps

1. Write the manifest to `.claude/state/planning-manifest.json`.
2. Dry-run Linear payloads: `npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/import-plan-to-linear.ts .claude/state/planning-manifest.json`
3. Create issues in Linear: `npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/import-plan-to-linear.ts .claude/state/planning-manifest.json --execute --team ENG`
4. Commit and push the manifest to main. The manifest is now immutable — all subsequent ticket state lives in per-ticket review packets (`review-packet-{TICKET_ID}.json`) and attestations (`attestation-{TICKET_ID}-{STAGE}.json`), not in the manifest.
5. Generate ticket-specific execution briefs for Codex using `npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/generate-codex-prompt.ts`.
