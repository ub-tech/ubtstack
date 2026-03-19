# deploy

Tag-based CD testing across all tickets in a release. Runs after tickets are merged and tagged.

This command is decoupled from per-ticket `/ship`. It validates CD-stage tests for every ticket included in a release tag.

---

## Step 1: Identify tag

Ask the user which tag to deploy, or discover the latest:

```bash
git tag --sort=-v:refname | head -5
```

If the user provides a tag, use it. Otherwise, use the most recent tag.

Confirm: **"Deploying tag `<tag>`. Is this correct?"**

---

## Step 2: Collect tickets in this tag

Find all tickets included between the previous tag and this tag:

```bash
# Get previous tag
PREV_TAG=$(git tag --sort=-v:refname | sed -n '2p')
CURRENT_TAG=<selected tag>

# List commits between tags
git log ${PREV_TAG}..${CURRENT_TAG} --oneline
```

Extract ticket IDs from commit messages and branch names (pattern: `ENG-xxx`, `BIZ-xxx`):

```bash
git log ${PREV_TAG}..${CURRENT_TAG} --format="%s %D" | grep -oE '[A-Z]+-[0-9]+' | sort -u
```

Present the ticket list to the user for confirmation:
**"Found N tickets in tag `<tag>`: <list>. Proceed with CD testing for all?"**

---

## Step 3: Gather CD test rows

For each ticket, read its review packet:

```bash
for TICKET_ID in <ticket_list>; do
  REVIEW_PACKET=".claude/state/review-packet-${TICKET_ID}.json"
  [ -f "$REVIEW_PACKET" ] && echo "Found: $REVIEW_PACKET"
done
```

From each review packet's `test_traceability_matrix`, collect all rows where `stage == "CD"`:
- system/e2e tests
- regression tests
- security tests
- fuzz tests
- load tests
- stress tests
- functional API tests
- staging smoke tests

If a ticket has no CD-stage test rows, note it as **"No CD tests required"** for that ticket.

---

## Step 4: Run CD tests

Check that `STAGING_URL` is configured:

```bash
echo $STAGING_URL
```

If not set, **STOP**: "No STAGING_URL configured. Set up staging environment first (see `/staging-setup`)."

Run all collected CD tests. For each test row:
1. Execute the test command from the traceability matrix
2. Capture output as evidence
3. Record pass/fail status

Group results by ticket for clear reporting.

---

## Step 5: Record results

Update each ticket's review packet with CD results:

For each ticket's review packet:
- Set `cd.status` to `"pass"` or `"fail"`
- Set `cd.version_tag` to the current tag
- Set `cd.timestamp` to current time
- Set `cd.operator` to the current user
- Update each CD-stage TM-xxx row with:
  - `status`: `"PASS"` or `"FAIL"`
  - `evidence`: path to log file
  - `version_tag`: current tag
  - `timestamp`: current time
  - `operator`: current user

Sync results if `sync-cd-results.ts` is available:

```bash
for TICKET_ID in <ticket_list>; do
  REVIEW_PACKET=".claude/state/review-packet-${TICKET_ID}.json"
  npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/sync-cd-results.ts "$REVIEW_PACKET"
done
```

---

## Step 6: CD attestation

For each ticket that passed CD tests, create a CD attestation:

```bash
for TICKET_ID in <passed_tickets>; do
  npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/create-attestation.ts \
    --stage CD \
    --ticket "$TICKET_ID" \
    --tag "$CURRENT_TAG"
done
```

The human operator must sign each attestation. This is the CD equivalent of the CI attestation created during `/ship`.

---

## Step 7: Report

Present a summary table:

```
## CD Test Results for tag <tag>

| Ticket | CD Tests | Status | Attestation |
|--------|----------|--------|-------------|
| ENG-101 | 3 tests | PASS | ATT-xxx |
| ENG-102 | 2 tests | PASS | ATT-xxx |
| ENG-103 | 0 tests | N/A (no CD tests required) | — |
| ENG-104 | 1 test  | FAIL | — |

Overall: X/Y tickets passed CD testing
```

---

## Step 8: Handle failures

If any tickets failed CD tests:

1. List the specific failures with evidence
2. Create QA tickets for each failure (if `create-qa-tickets.ts` is available):

```bash
npx tsx ${UBTSTACK_PATH:-../ubtstack}/scripts/create-qa-tickets.ts \
  --tag "$CURRENT_TAG" \
  --failures "<failure_json>"
```

3. Recommend: **"N tickets failed CD testing. Fix failures and re-run `/deploy` before deploying."**
4. Do NOT proceed with deployment

---

## Step 9: Deployment ready

If all tickets passed:

```
## Deployment Ready

Tag: <tag>
Tickets: <count> tickets, all CD tests passed
CD Attestations: <count> signed

Deployment instructions:
1. Deploy tag <tag> to production
2. Monitor dashboards for <rollback_window> minutes
3. Run /retro after deployment stabilizes
```

---

## Important Rules

- **CD tests only.** This command does not re-run CI tests. CI was validated during `/ship`.
- **Tag-based, not branch-based.** All tickets in the tag are tested together.
- **Human operator signs attestations.** No automated attestation creation.
- **Failures block deployment.** All tickets must pass before deploying.
- **No direct deployment.** This command validates readiness — actual deployment is a human action.
