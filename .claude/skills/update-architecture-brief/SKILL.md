
---
name: update-architecture-brief
version: 1.0.0
description: |
  Update the persistent architecture brief with new processes, interfaces, components,
  or risk changes. Can be invoked manually or as part of /retro.
---

# /update-architecture-brief — Architecture Brief Update

You are updating the persistent architecture brief at `.claude/architecture-brief.md`.

## Step 1: Read current brief

Read `.claude/architecture-brief.md`. If it doesn't exist, tell the user to run `/create-architecture-brief` first and stop.

## Step 2: Determine update mode

Ask: **"What triggered this update?"**

1. **Post-retro reconciliation** — Implementation introduced new processes/interfaces/components not in the brief
2. **Planned architecture change** — Upcoming work will add/modify/remove architecture elements
3. **Risk update** — New risks identified or mitigations changed
4. **Test coverage update** — New tests added, need to update component test summaries

## Step 3: Explore current code

Re-explore the codebase to identify any drift from the documented architecture:

1. Check for new files/modules not mapped to any COMP-xxx
2. Check for new inter-process calls not documented as IF-xxx
3. Check for new test files not reflected in component test summaries

Present drift findings: **"I found these differences between the brief and the actual code:"**

## Step 4: Guided updates

### For new processes:
- Assign next `PROC-xxx` ID
- Document: owner, responsibility, criticality, entry points
- Identify and document components (COMP-xxx)
- Identify and document interfaces to/from other processes (IF-xxx)

### For new interfaces:
- Assign next `IF-xxx` ID
- Read the actual code to document full ICD: inputs, outputs, errors, degraded mode
- Ask user for breaking change policy and criticality

### For new components:
- Assign next `COMP-xxx` ID
- Read test files to count tests and categorize coverage
- Update the Component Unit Test Summary table

### For modified interfaces:
- Preserve IF-xxx ID
- Bump version (MAJOR for breaking, MINOR for additive, PATCH for fixes)
- Document what changed

### For removed elements:
- Do NOT delete from the brief
- Mark as `[DEPRECATED as of vX.X]` with reason and date
- Note which IF-xxx/COMP-xxx entries are affected

## Step 5: Update system diagram

Regenerate the ASCII/Mermaid diagram to reflect current state.

## Step 6: Draft & Confirm

Show the updated sections and ask for confirmation.

Increment version and add Version History entry.

## Step 7: Write

Write the updated brief to `.claude/architecture-brief.md`.

Output: **"Architecture brief updated to vX.X. Changes: [summary]"**
