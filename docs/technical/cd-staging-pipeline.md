# CD Staging Pipeline Protocol

UBT-stack defines a generic CD staging protocol. Each target repo implements the protocol by providing its own staging environment, seed data, CD tests, and a GH Action that produces a standardized `cd-results.json` artifact.

## Protocol overview

```
/review passes → "Ready for CD/staging"
  → Trigger target repo's CD pipeline (label, workflow_dispatch, etc.)
  → Target repo spins up ephemeral staging (docker-compose, etc.)
  → Target repo seeds database and bootstraps state
  → Target repo runs CD tests against staging
  → Target repo produces cd-results.json artifact
  → Human syncs results to ubt-stack review packet
  → /ship checks cd.status == "pass"
```

## What the target repo provides

### 1. `staging/` directory

All CD staging infrastructure lives in a `staging/` directory at the repo root:

```
staging/
  docker-compose.yml   # Ephemeral staging environment
  seed.sql             # Database seed data
  seed.sh              # (optional) Multi-step seed script
  ...                  # Any other staging config, fixtures, etc.
```

#### `docker-compose.yml`

Ephemeral staging environment. Typical services:

| Service | Purpose | Example |
|---------|---------|---------|
| Database | Golden source of truth | Postgres, MySQL |
| Cache | Session/state cache | Redis, Memcached |
| Application services | The backend under test | API server, workers, queue consumers |
| External dependencies | Things the app talks to | Chain node (Anvil/Hardhat), message broker, mock APIs |

The compose file should be self-contained — `docker compose -f staging/docker-compose.yml up` starts everything needed for CD tests. Volume paths reference sibling directories (e.g., `../migrations/`) as needed.

#### `seed.sql`

SQL inserts to bootstrap the staging database with the minimum state for CD tests (users, products, markets, tokens, etc.). Mounted into Postgres via `docker-entrypoint-initdb.d`.

The database is the golden source of truth. Seed it first, then let services derive their state from it.

### 2. CD test suites

Tests that run against the live staging environment. These go in `test/cd/` (or wherever the target repo's test framework expects them).

Categories typically include:

| Category | What it tests |
|----------|--------------|
| `staging_smoke` | All services healthy, key endpoints callable |
| `system_e2e` | Full user workflows end-to-end |
| `regression` | Edge cases, boundary conditions, known past failures |
| `security` | Static analysis, dependency audit, auth bypass checks |
| `fuzz` | Extended fuzzing with higher iteration counts |
| `load` | Throughput and latency under load |
| `stress` | Behavior at resource limits |
| `functional_api` | API contract validation |

### 3. `.github/workflows/cd-staging.yml`

GH Action that:
1. Starts the staging environment (`docker compose -f staging/docker-compose.yml up`)
2. Waits for services to be healthy
3. Runs seed script
4. Runs each CD test category (each as a separate step with `continue-on-error: true`)
5. Generates `cd-results.json` with per-category pass/fail
6. Uploads artifact
7. Optionally posts results as PR comment
8. Tears down staging
9. Fails the workflow if any test failed

## cd-results.json contract

The CD pipeline must produce this artifact:

```json
{
  "status": "pass",
  "tests": [
    {"category": "staging_smoke", "status": "pass"},
    {"category": "system_e2e", "status": "pass"},
    {"category": "regression", "status": "fail", "details": "double-withdrawal test failed"},
    {"category": "security", "status": "pass"}
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"pass"` \| `"fail"` | Overall result. `"fail"` if any test failed |
| `tests` | array | Per-category results |
| `tests[].category` | string | Free-form category name (should match manifest CD categories) |
| `tests[].status` | `"pass"` \| `"fail"` | Individual test result |
| `tests[].details` | string (optional) | Failure description |

## Syncing results to ubt-stack

After the CD pipeline completes:

```bash
# Download artifact from target repo
gh run download <run-id> -n cd-results -D /tmp/cd-results

# Sync to review packet
npx tsx scripts/sync-cd-results.ts /tmp/cd-results/cd-results.json .claude/state/review-packet.json
```

This sets `cd.status` and populates `cd.tests` in the review packet.

## Handling failures

If `cd.status == "fail"`:

```bash
npx tsx scripts/create-qa-tickets.ts \
  .claude/state/review-packet.json \
  .claude/state/planning-manifest.json \
  --team ENG
```

This:
1. Creates `[QA] ENG-XXX: <category> — <details>` tickets in Linear for each failure
2. Sets up blocking relations (QA ticket blocks original)
3. Transitions the original ticket to Rework
4. QA tickets go through the normal pipeline (agent fix → CI → gate → /review → CD)

## Re-running

After QA fixes are merged:
1. Re-trigger the CD workflow
2. Re-download and sync results
3. If all pass, proceed with `/ship`

---

## Example: blockchain product repo (Foundry + Anvil)

For a Solidity/Rust monorepo with on-chain contracts and off-chain services:

### staging/docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: staging
      POSTGRES_USER: staging
      POSTGRES_PASSWORD: staging
    volumes:
      - ../migrations:/docker-entrypoint-initdb.d/migrations
      - ./seed.sql:/docker-entrypoint-initdb.d/99-seed.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U staging"]
      interval: 2s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      timeout: 5s
      retries: 10

  anvil:
    image: ghcr.io/foundry-rs/foundry:nightly
    entrypoint: ["anvil", "--fork-url", "${TENDERLY_FORK_URL}", "--host", "0.0.0.0", "--port", "8545"]
    ports:
      - "8545:8545"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:8545 -X POST -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_blockNumber\",\"params\":[],\"id\":1}'"]
      interval: 2s
      timeout: 5s
      retries: 15

  sequencer:
    build: { context: ., dockerfile: services/sequencer/Dockerfile }
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    environment:
      DATABASE_URL: postgres://staging:staging@postgres:5432/staging
      REDIS_URL: redis://redis:6379

  gateway:
    build: { context: ., dockerfile: services/gateway/Dockerfile }
    depends_on: [sequencer]
    ports:
      - "3000:3000"

  relayer:
    build: { context: ., dockerfile: services/relayer/Dockerfile }
    depends_on:
      postgres: { condition: service_healthy }
      anvil: { condition: service_healthy }
```

### staging/seed.sql

```sql
-- Tokens
INSERT INTO tokens (id, symbol, decimals, address) VALUES
  (0, 'USDC', 6, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
  (1, 'EURC', 6, '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c');

-- Markets
INSERT INTO markets (id, base_token_id, quote_token_id) VALUES (0, 1, 0);

-- Test accounts (Anvil default addresses)
INSERT INTO accounts (owner, account_type) VALUES
  ('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 'human'),
  ('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'solver');
```

### CD test categories

| Category | Implementation |
|----------|---------------|
| `staging_smoke` | `forge test --match-path "test/cd/StagingSmoke*"` — contracts deployed and callable |
| `system_e2e` | `cargo test --test cd_e2e` — deposit via API → order → trade → withdraw |
| `regression` | `forge test --match-path "test/cd/Regression*"` — double-withdrawal, re-init, etc. |
| `security` | `slither . --json slither-results.json` |
| `fuzz` | `FOUNDRY_FUZZ_RUNS=10000 forge test` |

---

## Example: SaaS API product repo

For a Node.js/Python API with Postgres:

### staging/docker-compose.yml

```yaml
services:
  postgres:
    image: postgres:16
    volumes:
      - ./seed.sql:/docker-entrypoint-initdb.d/seed.sql
  api:
    build: ..
    depends_on: [postgres]
    ports: ["3000:3000"]
```

### CD test categories

| Category | Implementation |
|----------|---------------|
| `staging_smoke` | `curl http://localhost:3000/health` |
| `system_e2e` | `pytest test/cd/test_e2e.py` |
| `regression` | `pytest test/cd/test_regression.py` |
| `security` | `npm audit --audit-level=high` |
| `load` | `k6 run test/cd/load.js` |
