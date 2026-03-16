
---
name: retro
version: 1.0.0
description: |
  Engineering retrospective. Analyzes commit history, work patterns,
  and code quality metrics with persistent history and trend tracking.
  Team-aware: breaks down per-person contributions with praise and growth areas.
---

# /retro — Engineering Retrospective

Generates a comprehensive engineering retrospective analyzing commit history, work patterns, and code quality metrics. Team-aware with per-person analysis.

## Arguments
- `/retro` — default: last 7 days
- `/retro 24h` — last 24 hours
- `/retro 14d` — last 14 days
- `/retro 30d` — last 30 days
- `/retro compare` — compare current window vs prior same-length window

## Instructions

Parse the argument to determine the time window. Default to 7 days.

### Step 1: Gather Raw Data

```bash
git fetch origin main --quiet
git config user.name
git config user.email

# All commits in window
git log origin/main --since="<window>" --format="%H|%aN|%ae|%ai|%s" --shortstat

# Per-commit test vs total LOC breakdown
git log origin/main --since="<window>" --format="COMMIT:%H|%aN" --numstat

# Commit timestamps for session detection
TZ=America/Los_Angeles git log origin/main --since="<window>" --format="%at|%aN|%ai|%s" | sort -n

# Files most frequently changed
git log origin/main --since="<window>" --format="" --name-only | grep -v '^$' | sort | uniq -c | sort -rn

# Per-author commit counts
git shortlog origin/main --since="<window>" -sn --no-merges
```

### Step 2: Compute Metrics

| Metric | Value |
|--------|-------|
| Commits to main | N |
| Contributors | N |
| PRs merged | N |
| Total insertions | N |
| Total deletions | N |
| Net LOC added | N |
| Test LOC (insertions) | N |
| Test LOC ratio | N% |
| Active days | N |
| Detected sessions | N |
| Avg LOC/session-hour | N |

Per-author leaderboard:
```
Contributor         Commits   +/-          Top area
You (name)               32   +2400/-300   src/core/
alice                    12   +800/-150    services/gateway/
```

### Step 3: Commit Time Distribution

Show hourly histogram in Pacific time. Identify peak hours, dead zones, late-night clusters.

### Step 4: Work Session Detection

Detect sessions using 45-minute gap threshold. Classify:
- **Deep sessions** (50+ min)
- **Medium sessions** (20-50 min)
- **Micro sessions** (<20 min)

### Step 5: Commit Type Breakdown

Categorize by conventional commit prefix (feat/fix/refactor/test/chore/docs).
Flag if fix ratio exceeds 50%.

### Step 6: Hotspot Analysis

Show top 10 most-changed files. Flag files changed 5+ times.

### Step 7: PR Size Distribution

Bucket PRs:
- **Small** (<100 LOC)
- **Medium** (100-500 LOC)
- **Large** (500-1500 LOC)
- **XL** (1500+ LOC) — flag these

### Step 8: Focus Score

Calculate percentage of commits touching the single most-changed top-level directory.

### Step 9: Team Member Analysis

For each contributor:
1. Commits and LOC
2. Areas of focus (top 3 directories)
3. Commit type mix
4. Session patterns
5. Test discipline (test LOC ratio)
6. Biggest ship

**Praise** (1-2 specific things anchored in actual commits)
**Growth opportunity** (1 specific, actionable suggestion)

### Step 10: Streak Tracking

Count consecutive days with at least 1 commit to origin/main.

### Step 11: Compare (if prior retros exist)

Load most recent `.context/retros/*.json` and show deltas.

### Step 12: Save Snapshot

```bash
mkdir -p .context/retros
```

Save JSON snapshot with all computed metrics.

## Narrative Structure

1. Tweetable summary (first line)
2. Summary table
3. Trends vs last retro (if available)
4. Time & session patterns
5. Shipping velocity
6. Code quality signals
7. Focus & highlights
8. Your week (personal deep-dive)
9. Team breakdown (if multi-contributor)
10. Top 3 team wins
11. 3 things to improve
12. 3 habits for next week

## Tone

- Encouraging but candid, no coddling
- Specific and concrete — always anchor in actual commits/code
- Skip generic praise — say exactly what was good and why
- Frame improvements as leveling up, not criticism
- Keep total output around 3000-4500 words

## Important Rules

- ALL narrative output goes directly to the user. The ONLY file written is the `.context/retros/` JSON snapshot.
- Use `origin/main` for all git queries
- Convert all timestamps to Pacific time
- If the window has zero commits, say so and suggest a different window
