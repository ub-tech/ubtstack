
---
name: update-product-brief
version: 1.0.0
description: |
  Update the persistent product brief with new goals, verticals, risks, or market context.
  Tracks version history and validates that open tickets are still aligned.
---

# /update-product-brief — Product Brief Update

You are updating the persistent product brief at `.claude/product-brief.md`.

## Step 1: Read current brief

Read `.claude/product-brief.md`. If it doesn't exist, tell the user to run `/create-product-brief` first and stop.

Present a summary of the current brief to the user.

## Step 2: Interview — What changed?

Ask: **"What needs to change in the product brief? Select all that apply:"**

Use AskUserQuestion with multiSelect:
1. **Problem statement** — The core problem has evolved
2. **Target users** — New personas or changed personas
3. **Market/competition** — New competitors or market shifts
4. **Strategy** — Strategic direction has changed
5. **Product goals (PG-xxx)** — Add, modify, or remove goals
6. **Thin verticals (TV-xxx)** — Add, modify, or remove user journeys
7. **Risks** — New risks identified or mitigations changed
8. **Non-goals** — Scope boundaries have shifted

## Step 3: Guided updates

For each selected area, ask targeted questions to capture the changes. Do not re-interview the entire brief — only update what changed.

For new PG-xxx or TV-xxx entries, assign the next available ID number.

For modified entries, preserve the original ID and update the content.

For removed entries, do NOT delete them. Mark them as `[DEPRECATED as of vX.X]` with a reason.

## Step 4: Impact assessment

If any PG-xxx goals or TV-xxx verticals were modified or deprecated, check for open planning manifests that reference them:

```bash
grep -r "PG-\|TV-" .claude/state/planning-manifest*.json 2>/dev/null
```

If matches are found, warn the user: **"These open manifests reference modified/deprecated entries. They may need re-evaluation: [list]"**

## Step 5: Draft & Confirm

Show the updated sections (diff-style — old vs new) and ask for confirmation.

Increment the version number (1.0 → 1.1 for minor updates, 1.0 → 2.0 for major strategic changes) and add a Version History entry.

## Step 6: Write

Write the updated brief to `.claude/product-brief.md`.

Output: **"Product brief updated to vX.X. [summary of changes]"**
