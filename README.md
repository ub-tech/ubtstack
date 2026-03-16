# ubtstack

**ubtstack** is an open-source, AI-native SDLC pipeline by [Unbroken Technologies LLC](https://github.com/ub-tech). It plans, tickets, implements, reviews, stages, and ships — orchestrated by Claude, Symphony, Linear, and Codex.

Repo-agnostic. ubtstack is the pipeline — your product repo is the target. To connect a target repo, copy `WORKFLOW.md` (agent execution contract), add a `staging/docker-compose.yml` (ephemeral CD environment), and wire up a `.github/workflows/cd-staging.yml` (CI that runs CD tests). ubtstack is never modified by agents.

## How it works

```
/kickoff → /plan-ceo-review → /plan-eng-review → /plan-to-linear
  → Symphony picks up Todo tickets from Linear
  → Each ticket gets an isolated branch in the target repo (symphony/ENG-xxx)
  → Codex agent implements, runs CI tests, writes a review packet
  → /review (code review + QA gate)
  → CD staging (ephemeral environment, target repo owns)
  → /ship (verify CD results, open PR)
  → Human approves and merges
```

One ticket = one branch = one PR. All code lives in the target repo. ubtstack is never modified by agents — it only provides the pipeline tooling.

### Customizable test stages

During `/plan-eng-review`, you choose which test categories run at each stage:

- **CI stage** — fast, deterministic tests that run on every commit (e.g., build, lint, unit, integration, smoke)
- **CD stage** — heavier tests that run against a staging environment (e.g., system/e2e, regression, security, fuzz, load)

These selections flow into the planning manifest and are enforced per-ticket. Different issues can have different test requirements — a pure logic change might only need CI unit tests, while a trust-boundary change requires CD security and fuzz tests.

Your target repo owns the staging environment (`staging/docker-compose.yml`) and the CD workflow (`.github/workflows/cd-staging.yml`), so you control what infrastructure is available and how tests execute.

## Setup

### 1. Clone all three repos as siblings

```bash
cd your-workspace
git clone https://github.com/your-org/ubtstack.git
git clone https://github.com/odysseus0/symphony.git
git clone https://github.com/your-org/your-target-repo.git
```

### 2. Install ubtstack dependencies (from ubtstack/)

```bash
cd ubtstack
npm install
cp .env.example .env   # Fill in LINEAR_API_KEY, APPROVAL_REQUIRED_FROM, TARGET_REPO_PATH
```

### 3. Configure Linear (from ubtstack/)

```bash
npx tsx scripts/linear-discover-team.ts
# Add custom workflow states: Rework, Human Review, Merging
# Add Linear MCP:
claude mcp add --transport http linear https://mcp.linear.app/mcp
```

### 4. Build Symphony (from symphony/)

```bash
cd ../symphony/elixir
mise trust && mise install && mise exec -- mix setup && mise exec -- mix build
```

### 5. Connect target repo (from your-target-repo/)

```bash
cd ../your-target-repo
cp ../ubtstack/WORKFLOW.md .                # Copy and patch frontmatter
npx skills add odysseus0/symphony -a codex -s linear land commit push pull debug --copy -y
/staging-setup                               # Generate staging environment
```

### Directory structure

ubtstack, Symphony, and your target repo are **siblings** — not nested inside each other. Symphony's `after_create` hook automatically clones the target repo and ubtstack side-by-side into each agent workspace.

```
your-root/
├── symphony/              # Symphony orchestrator (Elixir)
│   └── elixir/
├── ubtstack/             # SDLC pipeline tooling (this repo)
│   ├── .claude/skills/    # Slash command implementations
│   ├── scripts/           # Validation, sync, ticket creation
│   └── WORKFLOW.md        # Agent execution contract (copy to target repo)
└── your-target-repo/      # Your product code (the only repo agents modify)
    ├── .claude/state/      # Planning manifests, review packets (project state)
    ├── WORKFLOW.md         # Copied from ubtstack, frontmatter customized
    ├── staging/            # CD environment (docker-compose, seed data)
    └── .github/workflows/  # CI + CD workflows
```

Agent workspaces (created by Symphony at runtime) follow the same layout:

```
~/code/workspaces/<ticket-id>/
├── ubtstack/             # Cloned automatically by after_create hook
└── your-target-repo/      # Cloned automatically, checked out to symphony/<ticket-id>
```

Agents only modify the target repo. ubtstack is read-only tooling.

## Usage

| Command | What it does |
|---------|-------------|
| `/kickoff` | Ingest PRD, spec, or brief |
| `/plan-ceo-review` | Product review — scope, constraints, non-goals |
| `/plan-eng-review` | Architecture, test strategy, ticket breakdown |
| `/plan-to-linear` | Create Linear issues from the planning manifest |
| `/review` | Two-pass code review + CI/QA gate validation |
| `/ship` | Verify CD results, simplification pass, create PR |
| `/retro` | Post-ship retrospective |

Agents handle implementation automatically. Move Linear issues from Backlog to Todo when ready.

### Vibe mode

Want to skip the guardrails and ship fast? After agents implement and CI passes:

1. Skip `/review` and `/ship`
2. Review the PR diff yourself
3. Merge directly

The full pipeline (`/review` → CD staging → `/ship` → human approval) exists to catch what you'd miss at speed. Use vibe mode for low-risk changes where you trust the agent output and CI coverage. Use the full pipeline for anything touching trust boundaries, funds, or production infrastructure.

## Key files

| File | Audience | Purpose |
|------|----------|---------|
| `CLAUDE.md` | Claude | Full production rules, testing policy, commit conventions |
| `WORKFLOW.md` | Symphony/Codex agents | 7-phase agent execution contract |
| `.claude/skills/` | Claude | Slash command implementations |
| `scripts/` | Agents + humans | Validation, sync, ticket creation |
| `docs/technical/` | Humans | Protocol specs (CD staging, etc.) |

## Configuration

See `.env.example`. The essentials:

| Variable | Required |
|----------|----------|
| `LINEAR_API_KEY` | Yes |
| `APPROVAL_REQUIRED_FROM` | Yes — GitHub handle for PR approval |
| `TARGET_REPO_URL` | Yes — repo clone URL for Symphony |
| `TARGET_REPO_PATH` | Yes — local path to target repo (default: `../your-target-repo`) |
| `LINEAR_PROJECT_SLUG` | Yes — Symphony project targeting |

## Contributing

ubtstack is designed to be forked and customized for specific domains. The core pipeline is stack-agnostic — adapt the skills, test policies, and staging templates to fit your team's workflow.

Domain-specific forks in progress:
- **Blockchain / smart contract development** — custom CD staging with Anvil, Foundry test integration, trust-boundary review checks

To contribute back to the core: open a PR against `main`. For domain-specific extensions, fork and maintain your own variant.

## Acknowledgments

The skill-based workflow pattern in ubtstack was inspired by [gstack](https://github.com/garrytan/gstack) by Garry Tan. The core planning, review, QA, ship, and retro skills were derived from gstack's approach and extended with Linear integration, Symphony orchestration, review-packet validation, and completion gates.

See also [claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) for community patterns around Claude Code workflows.

## License

MIT — see [LICENSE](LICENSE).
