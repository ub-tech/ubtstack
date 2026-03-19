# ubtstack v2 — Design Decisions

> This document captures the design decisions for the v2 manifest and workflow structure.
> It is the authoritative reference for why things are the way they are.

## Templates

| Template | File | Purpose |
|----------|------|---------|
| Product Brief | `product-brief-v2.template.md` | Persistent product anchor — required every kickoff |
| Architecture Brief | `architecture-brief-v2.template.md` | Persistent engineering anchor — PROC/IF/COMP registry |
| Planning Manifest | `planning-manifest-v2.template.json` | Session manifest with full traceability |
| Attestation | `attestation-v2.template.json` | Human operator GPG-signed test evidence |
| Review Packet | `review-packet-v2.template.json` | Implementation evidence with traceability + attestation |
| Linear Issue Body | `linear-issue-body-v2.template.md` | Ticket format for Linear |

## Taxonomy

### Identifier Prefixes

| Prefix | Scope | Example | Lives In |
|--------|-------|---------|----------|
| `PG-xxx` | Product goal (high-level metric) | `PG-001: Reduce churn by 15%` | Product Brief |
| `TV-xxx` | Thin vertical (user journey) | `TV-002: Payment retry flow` | Product Brief |
| `BIZ-xxx` | Session business criterion (optional) | `BIZ-001: Retry without re-entering card` | Planning Manifest |
| `ENG-xxx` | Engineering acceptance criterion | `ENG-001: Endpoint returns 200 on retry` | Planning Manifest |
| `C-xxx` | Constraint (product/eng/security) | `C-003: PII encrypted at rest` | Planning Manifest |
| `PROC-xxx` | Process/service in the system | `PROC-001: OrderService` | Architecture Brief |
| `IF-xxx` | Interface between processes | `IF-001: OrderService → PaymentGateway` | Architecture Brief |
| `COMP-xxx` | Component within a process | `COMP-002: OrderStateMachine` | Architecture Brief |
| `AR-xxx` | Architecture-level risk | `AR-001: Payment provider SPOF` | Architecture Brief |
| `SR-xxx` | Session-level risk | `SR-001: Double-charge on retry` | Planning Manifest |
| `R-xxx` | Product/business risk | `R-001: Market timing risk` | Product Brief |
| `TM-xxx-nn` | Test traceability matrix row | `TM-ENG-101-01` | Planning Manifest / Review Packet |
| `ATT-xxx` | Attestation record | `ATT-2026-0319-001` | Attestation JSON |

### Traceability Chain

```
PG-xxx (product goal)
  └── TV-xxx (thin vertical / user journey)
        └── BIZ-xxx (optional business criterion — HOW the PG should be met)
              └── ENG-xxx (engineering acceptance criterion)
                    └── TM-xxx-nn (test in traceability matrix)
                          └── ATT-xxx (attestation with GPG signature)
```

Every test traces back to at least a PG-xxx and an ENG-xxx.
BIZ-xxx is optional — used when there are specific business requirements
guiding HOW the product goal should be met for this session.

## Key Design Decisions

### 1. Product Brief as Required Input

**Decision:** Every `/kickoff` requires `{target-repo}/.claude/product-brief.md`.
If it doesn't exist, kickoff routes to `/create-product-brief` before proceeding.

**Rationale:** Prevents feature-level myopia. Each session is grounded in the full
product context (target users, strategy, competitive landscape), not just the
immediate user prompt.

### 2. Architecture Brief as Required Input

**Decision:** Every `/kickoff` requires `{target-repo}/.claude/architecture-brief.md`.
If it doesn't exist, kickoff routes to `/create-architecture-brief` before proceeding.

**Rationale:** Provides nuclear-reactor-grade interface traceability. Every process,
component, and interface has a registered ID. Changes declare exactly which IDs they
touch. Integration tests map to specific IF-xxx entries.

**Update cadence:** Updated during engineering review (new interfaces) and during
`/retro` (actual vs planned architecture drift).

### 3. Product Brief Updated via Dedicated Command

**Decision:** Product brief is updated only via `/update-product-brief`, not inline
during kickoff.

**Rationale:** The brief is a living document but changes should be deliberate, not
side effects of a planning session. Updating it is a first-class action.

### 4. Architecture Brief Updated During /retro

**Decision:** `/retro` includes a mandatory check: "Did implementation introduce any
new processes, components, or interfaces not in the architecture brief?" If yes,
update the brief.

**Rationale:** Keeps the architecture brief reflecting reality. Plans are aspirational;
retros capture what actually happened.

### 5. Product Goals (PG) Are Not 1:1 with Thin Verticals (TV)

**Decision:** PG-xxx are high-level metrics. TV-xxx are user journeys. Multiple TVs
can advance one PG. A single TV can advance multiple PGs.

**Example:**
- PG-001: Reduce churn by 15%
- TV-001: First-time deposit flow (advances PG-001)
- TV-002: Payment retry flow (advances PG-001)
- TV-003: Account recovery flow (advances PG-001, PG-002)

### 6. Merged Constraints (No Separate fixed_constraints / hard_restrictions)

**Decision:** Single `constraints` array with `type` (product/engineering/security)
and `source` (product_brief/eng_review/compliance).

**Rationale:** Both served the same function — immutable boundaries. The `type` field
provides the classification that was previously implicit in the section name.

### 7. Test Traceability Matrix Replaces All Test/QA Policy Fields

**Decision:** Eliminated `default_test_policy`, `default_qa_policy`,
`required_test_categories`, `conditional_test_categories`, `qa_requirements`.
The test traceability matrix is the single source of truth.

**Rationale:** QA is not a separate activity — it's the aggregate result of tests
passing at each stage. Each row in the matrix says what's tested, why, where (CI/CD),
and who verified it. No separate "QA" concept needed.

### 8. GPG Signing for Attestations

**Decision:** Attestations are GPG-signed. No HMAC fallback. If the operator doesn't
have GPG configured, `create-attestation.ts` errors with setup instructions.

**Rationale:** Non-repudiation. HMAC with a shared secret means anyone with `.env` access
can forge attestations. GPG provides cryptographic proof that a specific individual
signed off. Aligns with Linux kernel `Signed-off-by` conventions.

### 9. Human Operator Runs All Tests (CI and CD)

**Decision:** Human operator manually executes test commands and creates attestation.
No automated CI/CD pipeline runs tests on behalf of the operator.

**Flow:**
1. Agent implements via TDD (CI evidence generated during execution)
2. `/ship` performs structural code review + CI validation + creates PR
3. Human runs CI tests locally, creates CI attestation (`--stage CI`)
4. Human reviews, approves, and merges PR → tag
5. `/deploy` runs CD tests for all tickets in the tag
6. Human creates CD attestations (`--stage CD`) during `/deploy`
7. Human deploys tag to production

**Rationale:** The attestation model requires human accountability. The human must
observe test results in real-time and confirm they match expectations. This is the
aviation read-back principle — the receiver confirms what they observed.

### 10. Flat TV Tickets (No Sub-Tickets)

**Decision:** Each TV is a single flat ticket. No sub-tickets or parent-child
relationships. RED/GREEN/REFACTOR is execution detail within a single ticket,
not separate planning artifacts.

**Rationale:** Sub-tickets added complexity without value. The TV is the atomic
unit of planning — one behavior, one end-to-end path, one ticket. If a TV has
multiple behaviors, it's too thick and should be split into separate TVs.
The test traceability matrix = the list of TVs under a Feature.

### 11. Thin Verticals Are Numbered and Versioned

**Decision:** Thin verticals use `TV-xxx` IDs in the product brief. Tickets reference
which TV they advance. Version tracking via the product brief's version history.

**Rationale:** Provides stable references that survive across planning sessions. A ticket
can say "I advance TV-002" and anyone can look up what that means in the product brief.

### 12. Structured Product Synopsis Format

**Decision:** The `product_context.product_synopsis` field in the manifest follows:
"[Product Name] helps [target users] solve [problem] by [strategy]. Success is
measured by [PG-xxx metrics]. This session addresses [TV-xxx], which advances
[PG-xxx] by [mechanism]."

**Rationale:** Forces Claude to demonstrate comprehension rather than parrot text.
Gives the user a concrete statement to confirm or correct before proceeding.

### 13. Prerequisite Skills for Missing Briefs

**Decision:** When product brief or architecture brief is missing, kickoff routes to
`/create-product-brief` or `/create-architecture-brief` as prerequisite steps.

**Rationale:** Same pattern as existing routing to `/write-a-prd`. Keeps each skill
focused on one job. Avoids bloating kickoff.

### 14. Time Estimates on Tickets

**Decision:** Each ticket includes `time_estimate_hours` for a human coder.

**Rationale:** Sanity check on scope. If a TV estimates >8 hours, it should
be split. Also useful for project planning and tracking velocity.

### 15. Business Criterion Is Optional in Test Matrix

**Decision:** `business_criterion` (BIZ-xxx) is an optional column in the test
traceability matrix. `product_goal` (PG-xxx) is always required.

**Rationale:** Not every test maps to a specific business criterion. But every test
should trace to a product goal. BIZ-xxx is useful when there are specific business
requirements guiding HOW the product goal should be met (e.g., "retry must preserve
form state" is a business requirement on top of "reduce churn").

### 16. Component Unit Test Summary in Architecture Brief

**Decision:** The architecture brief includes a per-component summary of unit tests:
component name, test file, test count, coverage areas (happy/boundary/error).

**Rationale:** Gives planning sessions visibility into existing test coverage before
deciding what new tests are needed. Also serves as a living coverage map updated
during retro.

## Pipeline Summary (v2)

```
/kickoff
  ├── Check: product-brief.md exists? No → /create-product-brief
  ├── Check: architecture-brief.md exists? No → /create-architecture-brief
  ├── Ask: External drivers for this change?
  ├── Read product brief → generate product_synopsis → user confirms
  ├── Skill composition (PRD, triage, refactor, architecture)
  ├── /plan-ceo-review (with scope mode selection)
  ├── /plan-eng-review (with IF-xxx / COMP-xxx impact analysis)
  └── /plan-to-linear (manifest + Linear issues)

Symphony dispatches agents per ticket:
  Agent implements (TDD with CI evidence)

Per-ticket:
  ├── /ship (structural code review + CI validation + PR creation)
  ├── Human operator creates CI attestation (create-attestation.ts --stage CI)
  ├── Human reviews and approves PR
  └── Human merges PR → tag

Per-tag (after merge):
  ├── /deploy (CD tests for all tickets in tag)
  ├── Human operator creates CD attestations (create-attestation.ts --stage CD)
  └── Human deploys tag to production

/retro
  ├── What worked, what didn't
  ├── Architecture brief update check
  └── Product brief update recommendation (if applicable)
```
