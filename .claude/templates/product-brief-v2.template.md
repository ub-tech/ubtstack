# [Product Name] — Product Brief

> This document is the persistent product anchor for all planning sessions.
> It lives at `{target-repo}/.claude/product-brief.md` and is a **required input** to every `/kickoff`.
> Updated only via `/update-product-brief`. Once referenced by a planning manifest, changes require re-evaluation of open tickets.

## Problem Statement

What pain exists, for whom, and why it matters now.
Written from the user's perspective in 2-3 sentences.

## Target Users

Specific personas who feel the pain. Not "developers" — rather "backend engineers integrating third-party payment processors who currently spend 2+ hours debugging failed transactions."

| Persona | Role | Pain Point | Current Workaround |
|---------|------|------------|--------------------|
| ... | ... | ... | ... |

## Magnitude of Problem

How much does this cost users in time, money, or risk? Quantify where possible.

- Time lost: ...
- Money lost: ...
- Risk exposure: ...
- Frequency: ...

## Addressable Market

TAM / SAM / SOM or qualitative sizing. Who could use this, and how many of them are there?

## Real Competition

| Competitor | How They Address the Problem | Gap / Weakness |
|------------|------------------------------|----------------|
| ... | ... | ... |

## Strength of Wedge

Why will users switch to this? What is the unfair advantage?
(Network effects, technical moat, distribution, cost, speed, trust, compliance, etc.)

## Strategy Summarized

2-3 sentence thesis. "We win by doing X for Y because Z."

## Product Goals (with metrics)

High-level measurable outcomes. These persist across sessions and are referenced by thin verticals.

| ID | Goal | Current Baseline | Target | Measurement Method |
|----|------|-----------------|--------|--------------------|
| PG-001 | ... | ... | ... | ... |
| PG-002 | ... | ... | ... | ... |

## Thin Verticals

Behaviors that define the product's scope. Each TV is one behavior — one end-to-end path through the product.
Multiple TVs may advance a single PG. A kickoff session identifies which TV(s) it addresses.

**Thickness check:** If a TV has multiple distinct behaviors, it's too thick — split it. The test matrix = the list of TVs under a Feature.

| ID | Behavior | Product Goals Advanced | Status |
|----|----------|----------------------|--------|
| TV-001 | First-time deposit flow | PG-001, PG-003 | Planned |
| TV-002 | Payment retry after failure | PG-001 | In Progress |

### TV-001: [Behavior]

**Narrative:** As a [persona], I want to [action] so that [outcome].

**Happy path:** Step 1 → Step 2 → Step 3 → Success state

**Key edge cases:**
- What happens if [failure condition]?
- What happens if [boundary condition]?

**Success metrics:** (subset of PG-xxx metrics that this behavior moves)

---

## Execution Risks

| ID | Risk | Type | Severity | Likelihood | Mitigation |
|----|------|------|----------|-----------|------------|
| R-001 | ... | technology | high | medium | ... |
| R-002 | ... | business | medium | high | ... |
| R-003 | ... | regulatory | ... | ... | ... |

Types: technology, business, regulatory, operational, talent, market, competitive

## Non-Goals

What this product deliberately does NOT do. Each must include rationale.

- NOT: [thing] — because [reason]
- NOT: [thing] — because [reason]

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | ... | Initial brief |
