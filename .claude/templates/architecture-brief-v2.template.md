# [Product Name] — Engineering Architecture Brief

> This document is the persistent engineering architecture anchor for all planning sessions.
> It lives at `{target-repo}/.claude/architecture-brief.md` and is a **required input** to every `/kickoff`.
> Updated via `/update-architecture-brief` or during engineering review when new processes/interfaces are introduced.

## System Diagram

```
┌─────────────┐    IF-001     ┌─────────────┐    IF-002     ┌─────────────┐
│  PROC-001   │──────────────▶│  PROC-002   │──────────────▶│  PROC-003   │
│ OrderService│               │PaymentGateway│              │  Ledger     │
└──────┬──────┘               └─────────────┘               └─────────────┘
       │
       │ IF-003
       ▼
┌─────────────┐
│  PROC-004   │
│  Inventory  │
└─────────────┘
```

Replace with Mermaid or ASCII diagram showing all PROC-xxx connected by IF-xxx arrows.

---

## Process Registry

Each internal process/service/module gets a registered entry.

### PROC-001: [Process Name]

| Field | Value |
|-------|-------|
| **Owner** | [team or individual] |
| **Responsibility** | [single sentence: what this process does] |
| **Criticality** | LOW / MEDIUM / HIGH / SECURITY-CRITICAL |
| **Repo** | [repo-name] |
| **Entry Points** | [how external requests reach this process] |

**Components:**

| ID | Component | Path | Responsibility | Unit Test Coverage |
|----|-----------|------|----------------|--------------------|
| COMP-001 | OrderValidator | `src/orders/validator.rs` | Validates order inputs | `tests/orders/validator_test.rs` — 12 tests (happy path, boundary, error) |
| COMP-002 | OrderStateMachine | `src/orders/state.rs` | Manages order lifecycle transitions | `tests/orders/state_test.rs` — 8 tests (all transitions, invalid transitions) |
| COMP-003 | OrderRepository | `src/orders/repo.rs` | Persistence layer for orders | `tests/orders/repo_test.rs` — 6 tests (CRUD, concurrent writes) |

**Interfaces Provided:** IF-001, IF-003
**Interfaces Consumed:** IF-005

---

### PROC-002: [Process Name]

(Same structure as above)

---

## Interface Registry

Every connection between processes gets a taxonomized entry with full ICD-style detail.

### IF-001: [Provider] → [Consumer]

| Field | Value |
|-------|-------|
| **ID** | IF-001 |
| **Provider** | PROC-001 (OrderService) |
| **Consumer(s)** | PROC-002 (PaymentGateway) |
| **Direction** | PROC-001 calls PROC-002 |
| **Protocol** | REST (POST /v1/payments) |
| **Criticality** | SECURITY-CRITICAL (fund handling) |
| **Version** | 1.0.0 |
| **Specification** | `docs/api/payment-gateway.openapi.yaml` |

**Inputs:**

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| order_id | UUID | yes | valid UUIDv4 | Order being paid |
| amount_cents | i64 | yes | > 0, <= 100_000_000 | Amount in cents |
| currency | string | yes | ISO 4217 (3 chars) | Currency code |
| idempotency_key | UUID | yes | unique per order | Prevents duplicate charges |

**Outputs:**

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| payment_id | UUID | no | Unique payment identifier |
| status | enum | no | `pending` / `completed` / `failed` |
| failure_reason | string | yes | Present only when status=failed |
| processed_at | ISO-8601 | no | Timestamp of processing |

**Error Conditions:**

| Error | Code | Recovery Behavior | User Impact |
|-------|------|-------------------|-------------|
| InvalidAmount | 400 | Reject, return validation error | User sees "Invalid amount" |
| DuplicateIdempotencyKey | 409 | Return original result | None (idempotent) |
| PaymentProviderTimeout | 504 | Retry 3x with exponential backoff | User sees "Processing..." |
| PaymentProviderDown | 503 | Fail open → manual queue, fire alert | Order enters pending_manual state |
| InsufficientFunds | 402 | Reject, no retry | User sees "Payment declined" |

**Degraded Mode Behavior:**

When PaymentGateway is unavailable:
- Orders enter `pending_payment` state
- Alert `payment-gateway-down` fires (PagerDuty P1)
- Orders are queued for retry when service recovers
- No funds are charged during degraded mode

**Breaking Change Policy:**
- Removing or renaming fields = MAJOR version bump
- Adding optional fields = MINOR version bump
- Bug fixes = PATCH version bump
- Consumers must be notified 2 sprints before MAJOR changes
- Old version supported for 1 sprint after new version ships

**Integration Tests:**

| Test File | What It Validates |
|-----------|-------------------|
| `tests/integration/payment_flow_test.rs` | Happy path: order → payment → confirmation |
| `tests/integration/payment_retry_test.rs` | Retry behavior on provider timeout |
| `tests/integration/payment_idempotency_test.rs` | Duplicate idempotency key returns original result |

---

### IF-002: [Provider] → [Consumer]

(Same structure as above)

---

## Component Unit Test Summary

Aggregated view of all component-level unit test coverage across the system.

| Process | Component | Test File | Test Count | Coverage Areas |
|---------|-----------|-----------|------------|----------------|
| PROC-001 | COMP-001 OrderValidator | `tests/orders/validator_test.rs` | 12 | happy, boundary, error |
| PROC-001 | COMP-002 OrderStateMachine | `tests/orders/state_test.rs` | 8 | all transitions, invalid |
| PROC-001 | COMP-003 OrderRepository | `tests/orders/repo_test.rs` | 6 | CRUD, concurrent |
| PROC-002 | COMP-004 PaymentProcessor | `tests/payments/processor_test.rs` | 10 | happy, retry, timeout |

---

## Risk Registry

Architecture-level risks with severity, likelihood, and mitigation.

| ID | Risk | Severity | Likelihood | Affected Processes | Affected Interfaces | Mitigation |
|----|------|----------|-----------|-------------------|---------------------|------------|
| AR-001 | Payment provider single point of failure | HIGH | MEDIUM | PROC-002 | IF-001 | Failover to secondary provider |
| AR-002 | State machine allows invalid transitions under race | MEDIUM | LOW | PROC-001 | IF-003 | Optimistic locking + transition validation |

---

## Security Surfaces

Processes and interfaces that touch trust boundaries, crypto, auth, or fund handling.
Any ticket modifying these requires human security review per the security escalation policy.

| Process / Interface | Security Surface | Review Required |
|---------------------|-----------------|-----------------|
| PROC-002 / IF-001 | Fund handling, payment processing | Always |
| PROC-001 / COMP-001 | Input validation (external user input) | When validation logic changes |
| IF-005 | Authentication token exchange | Always |

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | ... | Initial architecture brief |
