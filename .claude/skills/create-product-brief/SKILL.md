
---
name: create-product-brief
version: 1.0.0
description: |
  Interactive interview to create the persistent product brief for a target repo.
  Required prerequisite for /kickoff when no product brief exists.
---

# /create-product-brief — Product Brief Creation

You are creating the persistent product brief that anchors all future planning sessions. This document lives at `{target-repo}/.claude/product-brief.md` and is a required input to every `/kickoff`.

## Step 1: Check if brief already exists

```bash
cat .claude/product-brief.md 2>/dev/null
```

If it exists and has content, ask: **"A product brief already exists. Do you want to replace it entirely, or should you use /update-product-brief instead?"**

If the user wants to replace it, continue. Otherwise, stop.

## Step 2: Interview — Problem & Users

Ask these questions one at a time using AskUserQuestion. Wait for each answer before proceeding.

1. **"What problem does this product solve? Who feels the pain, and why does it matter now?"**
   - Push for specificity. "Developers" is not specific enough. "Backend engineers spending 2+ hours debugging failed payment transactions" is.

2. **"Who are the target users? Describe 1-3 specific personas."**
   - For each persona, capture: Role, Pain Point, Current Workaround

3. **"How big is this problem? What does it cost users in time, money, or risk?"**
   - Quantify where possible. Frequency, dollar amounts, hours lost.

## Step 3: Interview — Market & Competition

4. **"What is the addressable market? Who could use this, and roughly how many?"**
   - TAM/SAM/SOM or qualitative sizing is fine.

5. **"Who else solves this problem today? What are the top 2-3 competitors and their weaknesses?"**
   - Capture: Competitor name, how they address it, gap/weakness.

6. **"What is your unfair advantage — why will users switch to this?"**
   - Network effects, technical moat, distribution, cost, speed, trust, compliance, etc.

## Step 4: Interview — Strategy & Goals

7. **"Summarize the strategy in 2-3 sentences. 'We win by doing X for Y because Z.'"**

8. **"What are the top 3-5 product goals with measurable metrics?"**
   - For each: Goal description, current baseline (if known), target metric, measurement method.
   - These become `PG-xxx` entries.

9. **"What are the key user journeys (thin verticals) that define the product's scope?"**
   - For each journey: narrative (As a [persona], I want to [action] so that [outcome]), which PG-xxx goals it advances.
   - These become `TV-xxx` entries.

10. **"What does this product deliberately NOT do? What's out of scope?"**
    - Each non-goal must include a rationale.

## Step 5: Interview — Risks

11. **"What are the top risks? Consider: technology, business, regulatory, operational, talent, market, competitive."**
    - For each: description, type, severity, likelihood, mitigation.

## Step 6: Draft & Confirm

Read the template at `${UBTSTACK_PATH:-../ubtstack}/.claude/templates/product-brief-v2.template.md`.

Draft the complete product brief using the interview answers. Fill in every section. Use the exact taxonomy:
- Product goals: `PG-001`, `PG-002`, etc.
- Thin verticals: `TV-001`, `TV-002`, etc.
- Risks: `R-001`, `R-002`, etc.

Present the draft to the user. Ask:
**"Does this accurately capture your product? Any corrections or additions?"**

Iterate until approved.

## Step 7: Write

```bash
mkdir -p .claude
```

Write the approved brief to `.claude/product-brief.md`.

Output: **"Product brief created at .claude/product-brief.md. This will be used as context for all future /kickoff sessions."**

## Important Rules

- Do NOT skip any section. Every section in the template must be filled.
- Do NOT invent answers. If the user doesn't know something, mark it as "TBD — needs research" rather than guessing.
- Do NOT proceed to Phase 1 of kickoff. This skill ends after writing the file. The user returns to `/kickoff` which will now find the brief and continue.
- Set version to 1.0 with today's date in the Version History table.
