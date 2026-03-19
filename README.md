# ubtstack

**ubtstack** is an open-source, AI-native SDLC pipeline by [Unbroken Technologies LLC](https://github.com/ub-tech). It plans, tickets, implements, reviews, and ships — orchestrated by Claude, Symphony, Linear, and Codex.

Repo-agnostic. ubtstack is the pipeline — your product repo is the target. To connect a target repo, copy `WORKFLOW.md` (agent execution contract), add a `staging/docker-compose.yml` (ephemeral CD environment), and wire up a `.github/workflows/cd-staging.yml` (CI that runs CD tests). ubtstack is never modified by agents.

## How it works

```
/kickoff → /plan-ceo-review → /plan-eng-review → /plan-to-linear
  → Symphony picks up Todo tickets from Linear
  → Each ticket gets an isolated branch in the target repo (symphony/ENG-xxx)
  → Codex agent implements via TDD, generates CI evidence
  → /ship (structural code review + CI validation + PR)
  → Human approves and merges → tag
  → /deploy (CD tests for all tickets in tag)
  → Deploy → /retro
```

One ticket = one branch = one PR. All code lives in the target repo. ubtstack is never modified by agents — it only provides the pipeline tooling.

### Two-stage testing

During `/plan-eng-review`, you choose which test categories run at each stage:

- **CI stage** (per-ticket, during `/ship`) — fast, deterministic tests that run on every commit (e.g., build, lint, unit, integration, smoke)
- **CD stage** (per-tag, during `/deploy`) — heavier tests that run against a staging environment (e.g., system/e2e, regression, security, fuzz, load)

These selections flow into the planning manifest and are enforced per-ticket. Different issues can have different test requirements — a pure logic change might only need CI unit tests, while a trust-boundary change requires CD security and fuzz tests.

CD testing is fully decoupled from per-ticket work. Tickets are merged into tags. Deployments are by tag. `/deploy` runs CD tests for all tickets in a tag at once.

Your target repo owns the staging environment (`staging/docker-compose.yml`) and the CD workflow (`.github/workflows/cd-staging.yml`), so you control what infrastructure is available and how tests execute.

## Setup

### 1. Clone all three repos as siblings

```bash
cd your-workspace
git clone https://github.com/ub-tech/ubtstack.git
git clone https://github.com/odysseus0/symphony.git
git clone https://github.com/your-org/your-target-repo.git   # your product repo
```

### 2. Install ubtstack dependencies (from ubtstack/)

```bash
cd ubtstack
npm install
cp .env.example .env   # Fill in LINEAR_API_KEY, APPROVAL_REQUIRED_FROM, UBTSTACK_PATH
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
cp ../ubtstack/WORKFLOW.md .                # Copy, then update with your project info
# Edit WORKFLOW.md frontmatter: set project_slug, repo URLs, repo directory names, etc.

# Symlink ubtstack skills into target repo
mkdir -p .claude/skills
for skill in ../ubtstack/.claude/skills/*/; do
  ln -sf "$(realpath "$skill")" .claude/skills/
done

# Symlink ubtstack commands into target repo
mkdir -p .claude/commands
for cmd in ../ubtstack/.claude/commands/*; do
  ln -sf "$(realpath "$cmd")" .claude/commands/
done

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
│   ├── .claude/commands/  # Slash command entry points
│   ├── .claude/templates/ # Manifest, review packet, attestation templates
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

## Running

The pipeline uses two terminals:

**Terminal 1 — Claude Code** (planning, review, ship):
```bash
cd your-target-repo
claude
```

**Terminal 2 — Symphony** (polls Linear, dispatches Codex agents):
```bash
cd ubtstack
./bin/start-symphony.sh ../your-target-repo/WORKFLOW.md --port 3003
```

Symphony reads `LINEAR_API_KEY` from `ubtstack/.env`. The `--port` flag enables the web dashboard at `http://localhost:3003`.

Set `SYMPHONY_PATH` if your symphony clone is not at `../symphony/elixir`.

**After Symphony starts — trigger work in Linear:**

1. Open your Linear workspace and find the issues created by `/plan-to-linear`
2. Move the issues into the project specified by `LINEAR_PROJECT_SLUG` in your `.env`
3. Move issues to **Todo** status to kick off development — Symphony will pick them up automatically and dispatch Codex agents

Symphony only claims issues that are in the **Todo** state within the configured project. Move them one at a time or in batches depending on how many concurrent agents you want running.

## Usage

Start your Claude instance from your target repo directory. ubtstack skills are invoked from there.

### Core pipeline

| Command                | What it does |
|------------------------|-------------|
| `/kickoff`             | Full sandwich workflow — brief enforcement, skill composition, CEO + eng review, ticketization |
| `/plan-ceo-review`     | Product review — scope, constraints, non-goals (delegates interrogation to `/grill-me`) |
| `/plan-eng-review`     | Architecture, test strategy, ticket breakdown (delegates interrogation to `/grill-me`) |
| `/plan-to-linear`      | Create Linear issues from the planning manifest |
| `/ship`                | Structural code review + CI validation + simplification pass + create PR |
| `/deploy`              | Tag-based CD testing across all tickets in a release |
| `/retro`               | Post-ship retrospective |

Agents handle implementation automatically via TDD. Move Linear issues from Backlog to Todo when ready.

### Optional commands

| Command                        | What it does |
|--------------------------------|-------------|
| `/create-product-brief`        | Create a product brief (required anchor document) |
| `/create-architecture-brief`   | Create an architecture brief (required anchor document) |
| `/update-product-brief`        | Update the product brief after a session |
| `/update-architecture-brief`   | Update the architecture brief after a session |
| `/write-a-prd`                 | Interactive PRD creation through interview and codebase exploration |
| `/grill-me`                    | Adversarial interview to stress-test a plan or design |
| `/triage`                      | Bug investigation → root cause analysis → Linear issue with TDD fix plan |
| `/discover-architecture`       | Codebase exploration for architectural improvement opportunities |
| `/plan-refactor`               | Detailed refactor plan with tiny commits → Linear issue |
| `/tdd`                         | Interactive TDD session with red-green-refactor loop |

### Vibe mode

Want to skip the guardrails and ship fast? Run `/ship` and select **vibe mode** when prompted. This skips structural review, CI validation, and the completion gate — going straight from merge to PR. You review the diff yourself.

The full pipeline (`/ship` → human approval → merge → tag → `/deploy`) exists to catch what you'd miss at speed. Use vibe mode for low-risk changes where you trust the agent output and CI coverage. Use the full pipeline for anything touching trust boundaries, funds, or production infrastructure.

## Key files

| File | Audience | Purpose |
|------|----------|---------|
| `CLAUDE.md` | Claude | Full production rules, testing policy, commit conventions |
| `WORKFLOW.md` | Symphony/Codex agents | 7-phase agent execution contract |
| `.claude/skills/` | Claude | Slash command implementations |
| `.claude/commands/` | Claude | Slash command entry points (kickoff, deploy, plan-to-linear) |
| `.claude/templates/` | Claude + scripts | Manifest, review packet, attestation, Linear issue body templates |
| `scripts/` | Agents + humans | Validation, sync, ticket creation, attestation |

## Configuration

See `.env.example`. The essentials:

| Variable | Required |
|----------|----------|
| `LINEAR_API_KEY` | Yes |
| `APPROVAL_REQUIRED_FROM` | Yes — GitHub handle for PR approval |
| `TARGET_REPO_URL` | Yes — repo clone URL for Symphony |
| `UBTSTACK_PATH` | Yes — local path to ubtstack tooling repo (default: `../ubtstack`) |
| `LINEAR_PROJECT_SLUG` | Yes — Symphony project targeting |

## Contributing

ubtstack is designed to be forked and customized for specific domains. The core pipeline is stack-agnostic — adapt the skills, test policies, and staging templates to fit your team's workflow.

Domain-specific forks in progress:
- **Blockchain / smart contract development** — custom CD staging with Anvil, Foundry test integration, trust-boundary review checks

To contribute back to the core: open a PR against `main`. For domain-specific extensions, fork and maintain your own variant.

Found a bug or have a feature request? [Open an issue](https://github.com/ub-tech/ubtstack/issues).

## Acknowledgments

The skill-based workflow pattern in ubtstack was inspired by and builds on work from these projects:

- [gstack](https://github.com/garrytan/gstack) by Garry Tan — the original skill-based workflow pattern for Claude Code
- [skills](https://github.com/mattpocock/skills) by Matt Pocock — skill packaging and distribution patterns
- [superpowers](https://github.com/obra/superpowers) by Jesse Vincent — plugin and skill system architecture
- [marketingskills](https://github.com/coreyhaines31/marketingskills) — marketing-focused agent skills

See also [claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) for community patterns around Claude Code workflows.

## License

MIT — see [LICENSE](LICENSE).
