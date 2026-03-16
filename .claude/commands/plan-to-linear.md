# plan-to-linear

Compile the output of `/plan-ceo-review` and `/plan-eng-review` into a machine-readable planning manifest for Symphony and Linear.

## Required output

Write `.claude/state/planning-manifest.json` using `${UBTSTACK_PATH:-../ubtstack}/.claude/templates/planning-manifest.template.json`.

Create the directory first if it doesn't exist: `mkdir -p .claude/state`

## Rules

- One feature = one manifest
- One ticket = one bounded unit of work
- Tickets must include:
  - id
  - title
  - repo
  - priority
  - depends_on
  - labels
  - scope
  - implementation_guidance
  - acceptance_criteria
  - allowed_paths
  - touched_components
  - change_classification
  - test_commands
  - deliverables
  - escalation_rule
- Preserve existing code context at both feature level and ticket level when relevant
- Keep tickets narrow enough for Codex to implement safely
- If a task spans multiple repos, split it unless cross-repo atomicity is unavoidable
- Test requirements must match the changed surface, not a generic default
- The manifest may leave `required_test_categories`, `conditional_test_categories`, and `qa_requirements` empty, but only if `change_classification` is complete enough for Symphony to compute them automatically
- The manifest must be detailed enough for Symphony to render a Linear issue body without additional interpretation

## Dependency graph (critical)

Every manifest MUST include a dependency graph that enforces correct build order. Agents execute tickets sequentially by number — a ticket that changes a shared type, event struct, or interface MUST block all downstream tickets that consume it.

**How to build the dependency graph:**

1. Identify shared boundaries: types, structs, events, interfaces, database schemas, public inputs
2. For each ticket, list what it **produces** (new types, changed interfaces) and what it **consumes** (existing types it depends on)
3. If ticket B consumes something ticket A produces or changes, B must have `"depends_on": ["A"]`
4. Validate: for every `depends_on` entry, confirm the dependency ticket is numbered lower
5. Validate: the full graph has no cycles
6. Validate: `cargo check` (or equivalent) would pass after each ticket is applied in dependency order — if ticket B would fail to compile without ticket A's changes, B MUST depend on A

**Common mistakes:**
- Forgetting that changing a struct (e.g. adding fields to `BatchSealed`) breaks all downstream code that pattern-matches it — every consumer must depend on the producer
- Allowing two tickets to modify the same struct independently — one must depend on the other
- Not accounting for cross-crate dependencies: if crate A re-exports a type from crate B, changing B's type means A's consumers also need updating

## Planning inputs

The manifest should preserve planning provenance, including:
- PRD references
- architecture guidance
- related incidents or prior PRs
- relevant existing code modules, interfaces, and current tests

## Change classification guidance

For each ticket, set the following booleans explicitly:
- `domain_logic_changed`
- `module_boundary_changed`
- `api_contract_changed`
- `user_workflow_changed`
- `throughput_or_latency_path_changed`
- `trust_boundary_or_external_input_changed`
- `bug_fix_or_regression_risk`
- `operational_behavior_changed`

These booleans drive automatic enforcement of required test categories and QA gates at ticket-generation time.

## Business tasks

The manifest may also include `business_tasks` for the product/business team. These are non-engineering work items like:
- User interviews
- Market research
- Ecosystem strategy
- Partnership outreach
- Competitive analysis

Business tasks go to the **BIZ** team in Linear (not the ENG team) and are not dispatched to Codex.

Each business task must include:
- id
- title
- team (e.g., "BIZ")
- description
- acceptance_criteria
- deliverables

## Final steps

1. Write the manifest to `.claude/state/planning-manifest.json`.
2. Dry-run Linear payloads: `npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/import-plan-to-linear.ts .claude/state/planning-manifest.json`
3. Create issues in Linear: `npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/import-plan-to-linear.ts .claude/state/planning-manifest.json --execute --team ENG`
4. Generate ticket-specific execution briefs for Codex using `npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/generate-codex-prompt.ts`.
