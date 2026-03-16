
---
name: staging-setup
version: 1.0.0
description: |
  Bootstrap a CD staging environment in the target repo. Inspects the project
  structure to generate a docker-compose, seed data, CD test scaffolds, and a
  CI workflow — all placed where the project's tooling expects them.
---

# Staging Setup: Bootstrap CD Staging Environment

You are running the `/staging-setup` workflow. This inspects the target repo and generates the files needed for an ephemeral CD staging environment.

**Only stop for:**
- Cannot determine the project's tech stack (ask the user)
- Ambiguous database schema or migration structure (ask the user)
- Missing prerequisites (no Dockerfile, no migrations, no test framework)

**Never stop for:**
- Files already exist (show diff, ask to overwrite or skip)

---

## Step 1: Discover Project Structure

Inspect the target repo to determine:

1. **Language / framework** — Rust (Cargo), Solidity (Foundry/Hardhat), Node (package.json), etc.
2. **Database** — Look for migrations directories, schema files, or ORM config
3. **Chain tooling** — Foundry (foundry.toml), Hardhat (hardhat.config), Anvil references
4. **Existing test structure** — Where tests live, what framework (forge test, cargo test, jest, etc.)
5. **Config files** — Application config (e.g., .toml, .env.example) that reference DB, Redis, RPC URLs
6. **Existing staging assets** — Check if `staging/`, `docker-compose*.yml`, or seed files already exist

Report findings to the user before proceeding.

---

## Step 2: Generate `staging/docker-compose.yml`

Create an ephemeral Docker Compose file at `staging/docker-compose.yml` that spins up the infrastructure the project needs. Common services:

- **Postgres** (if SQL migrations found) — mount migration directories into `docker-entrypoint-initdb.d/` in alphabetical order, mount seed.sql last
- **Redis** (if Redis references found in config)
- **Anvil** (if Foundry/Solidity project) — fork from `${TENDERLY_FORK_URL}` or run standalone
- **Any other infrastructure** the project config references

Requirements:
- All services must have healthchecks
- Use Alpine images where available
- Document required env vars in comments at the top
- Add TODO comments for application services (sequencer, gateway, relayer, etc.) that will be added as Dockerfiles are created

---

## Step 3: Generate `staging/seed.sql`

Create seed data at `staging/seed.sql` that provides the minimum state for CD tests to run. Derive this from:

1. The database schema (migrations)
2. Application config (token addresses, chain IDs, etc.)
3. Test fixtures or existing seed files

The seed file must:
- Use `ON CONFLICT ... DO NOTHING` for idempotency
- Include comments mapping values to their source (e.g., "must match chain.token_mappings in config")
- Use well-known test addresses (e.g., Anvil default accounts) where applicable
- Cover: reference data (tokens, markets), test accounts, and any watcher/checkpoint initialization

---

## Step 4: Generate CD Test Scaffolds

Create test files in the location appropriate for the project's test framework.

### For Foundry/Solidity projects → `<contracts-dir>/test/cd/`

Generate these test contracts:

| File | Purpose |
|------|---------|
| `CdTestBase.t.sol` | Shared base contract — fork URL, deployer keys, helper utilities |
| `StagingSmoke.t.sol` | Smoke tests — contracts deployed, tokens seeded, accounts exist |
| `SystemE2E.t.sol` | End-to-end flow tests — full lifecycle (deposit → intent → fill → withdraw) |
| `Regression.t.sol` | Regression tests — placeholder for previously-fixed bugs |

All test contracts:
- Import `forge-std/Test.sol`
- Fork against `http://localhost:8545` (Anvil from docker-compose)
- Use addresses and values from `staging/seed.sql`

### For Rust/Cargo projects → `<crate>/tests/cd/`

Generate integration test files following the same categories (smoke, e2e, regression).

### For Node/TypeScript projects → `<project>/test/cd/`

Generate test files using the project's existing test framework (jest, vitest, mocha).

---

## Step 5: Generate CI Workflow

Create `.github/workflows/cd-staging.yml` that:

1. **Triggers on:**
   - `pull_request` with label `cd:staging`
   - `workflow_dispatch` with PR number input

2. **Steps:**
   - Checkout with submodules
   - Install build tools (Foundry, Rust, Node — whatever the project needs)
   - Start staging environment via `docker compose -f staging/docker-compose.yml up -d --wait`
   - Deploy contracts (if applicable)
   - Run each CD test category as a separate step with `continue-on-error: true`
   - Generate `cd-results.json` summarizing pass/fail per category
   - Upload results as artifact
   - Post results as PR comment (if PR context)
   - Tear down staging environment
   - Fail the job if any CD test failed

---

## Step 6: Summary

Output a table of all generated files:

```
| Asset              | Path                                  | Purpose                          |
|--------------------|---------------------------------------|----------------------------------|
| Docker Compose     | staging/docker-compose.yml            | Ephemeral infra                  |
| Seed SQL           | staging/seed.sql                      | Database seed data               |
| CI Workflow        | .github/workflows/cd-staging.yml      | CD test orchestration            |
| Test Base          | <test-dir>/cd/TestBase.*              | Shared test utilities            |
| Smoke Tests        | <test-dir>/cd/StagingSmoke.*          | Deployment/seed verification     |
| E2E Tests          | <test-dir>/cd/SystemE2E.*             | Full lifecycle tests             |
| Regression Tests   | <test-dir>/cd/Regression.*            | Previously-fixed bug coverage    |
```

---

## Important Rules

- **Inspect before generating.** Always read the project structure first. Do not assume Foundry, Postgres, or any specific stack.
- **Idempotent seeds.** All seed SQL must use conflict-safe inserts.
- **No secrets in files.** Use environment variable references (`${VAR}`) for secrets, fork URLs, API keys.
- **Match existing patterns.** If the project already has tests, follow the same style, imports, and conventions.
- **Healthchecks are mandatory.** Every Docker service must have a healthcheck.
- **One staging/ directory.** All staging infrastructure lives in `staging/` at the repo root. Test files live where the project's test framework expects them.
