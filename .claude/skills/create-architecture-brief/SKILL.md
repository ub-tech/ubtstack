
---
name: create-architecture-brief
version: 1.0.0
description: |
  Interactive codebase exploration + interview to create the persistent engineering
  architecture brief for a target repo. Required prerequisite for /kickoff when
  no architecture brief exists.
---

# /create-architecture-brief — Architecture Brief Creation

You are creating the persistent engineering architecture brief that anchors all future planning sessions. This document lives at `{target-repo}/.claude/architecture-brief.md` and is a required input to every `/kickoff`.

## Step 1: Check if brief already exists

```bash
cat .claude/architecture-brief.md 2>/dev/null
```

If it exists and has content, ask: **"An architecture brief already exists. Do you want to replace it entirely, or should you use /update-architecture-brief instead?"**

## Step 2: Explore the codebase

Before interviewing the user, explore the codebase to build your own understanding:

1. Read the project structure (top-level directories, key config files, README)
2. Identify entry points (main files, server startup, CLI entry)
3. Identify distinct services/processes (separate binaries, microservices, packages)
4. Map imports and dependencies between modules
5. Find existing test files and their coverage areas
6. Identify external integrations (databases, APIs, message queues)

Present your findings to the user as a proposed process map:

**"Based on my exploration, here's what I see as the internal processes and their responsibilities. Correct me where I'm wrong:"**

List each proposed process with: name, responsibility, entry point, key modules.

## Step 3: Interview — Process Registry

For each confirmed process, ask:

1. **"Who owns [process name]? What team or individual?"**
2. **"What is its criticality level? LOW / MEDIUM / HIGH / SECURITY-CRITICAL?"**
3. **"Are there any processes I missed?"**

Assign `PROC-xxx` IDs to each confirmed process.

## Step 4: Map Components

For each process, list the key components you found during exploration:

**"Here are the components I found in [PROC-xxx]. Each one gets a COMP-xxx ID:"**

For each component, show:
- Component name and path
- What it does (single sentence)
- Existing test file (if found)
- Test count and coverage areas (happy/boundary/error) — read the test files to count

Ask: **"Any components I missed or mislabeled?"**

Assign `COMP-xxx` IDs.

## Step 5: Map Interfaces

Identify every connection between processes:

**"Here are the interfaces I found between processes:"**

For each interface:
- Provider process → Consumer process
- Protocol (REST, gRPC, function call, message queue, shared database)
- Direction

Ask: **"Any interfaces I missed? Any that should be classified as SECURITY-CRITICAL?"**

Assign `IF-xxx` IDs.

## Step 6: Deep Interface Documentation

For each interface, document the full ICD-style detail:

Read the template at `${UBTSTACK_PATH:-../ubtstack}/.claude/templates/architecture-brief-v2.template.md` for the exact format.

For each `IF-xxx`:
- Read the actual code to determine inputs, outputs, error conditions
- Document degraded mode behavior (ask the user if not obvious from code)
- Document breaking change policy
- List existing integration tests

Present the interface documentation to the user for each interface. Ask:
**"Is this accurate? Any error conditions or degraded modes I missed?"**

## Step 7: Risks & Security Surfaces

Ask:
1. **"What are the architecture-level risks? (single points of failure, race conditions, scaling limits)"**
2. **"Which processes and interfaces touch trust boundaries, crypto, auth, or fund handling?"**

Assign `AR-xxx` IDs to risks.

## Step 8: System Diagram

Generate an ASCII or Mermaid diagram showing all PROC-xxx connected by IF-xxx arrows. Mark SECURITY-CRITICAL interfaces distinctly.

Present to the user for confirmation.

## Step 9: Draft & Confirm

Assemble the complete architecture brief using all gathered information. Every section from the template must be filled:
- System Diagram
- Process Registry (with component tables including unit test summaries)
- Interface Registry (full ICD-style for each)
- Component Unit Test Summary (aggregated table)
- Risk Registry
- Security Surfaces

Present the full draft. Ask: **"Does this accurately represent your architecture?"**

Iterate until approved.

## Step 10: Write

```bash
mkdir -p .claude
```

Write the approved brief to `.claude/architecture-brief.md`.

Output: **"Architecture brief created at .claude/architecture-brief.md. This will be used as context for all future /kickoff sessions."**

## Important Rules

- ALWAYS explore the codebase first. Do not rely solely on the user's description.
- Read actual test files to count tests and categorize coverage (happy/boundary/error).
- Read actual interface code to document inputs/outputs/errors — do not guess.
- If the codebase is greenfield with no code yet, document the planned architecture and mark all component/test entries as "planned — not yet implemented."
- Set version to 1.0 with today's date.
