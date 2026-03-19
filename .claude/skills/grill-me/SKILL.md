---
name: grill-me
version: 3.0.0
description: |
  Interrogation methodology for pressure-testing plans and designs. Derived from
  gstack office-hours protocol. Can be invoked standalone or embedded within
  CEO/Eng review Phase 1 interrogation. This is the canonical source for all
  interrogation mechanics — push-back rules, ledger format, exit criteria, and
  codebase-answerable overrides.
---

# Grill-Me Protocol

## Core Principles

1. **Specificity is the only currency.** Vague answers ("we'll handle that", "users want this") are not answers. Push until the response contains a name, a number, a date, or a concrete scenario.
2. **The polished first answer is the surface.** The real insight is two follow-ups deeper. Never accept the rehearsed pitch — dig underneath it.
3. **Interest is not evidence.** "People have asked for this" is not the same as "Person X did Y on date Z." Distinguish aspiration from observed behavior.
4. **Comfort means you're not deep enough.** If the person being grilled is comfortable, you haven't found the hard part yet. Push until they say "I don't know" or "that's the part I'm worried about."
5. **Praise specificity when it appears.** When someone gives a concrete, falsifiable answer, acknowledge it. Reinforce the behavior you want.

## Protocol

- Ask **one question at a time** using AskUserQuestion. Never batch multiple questions.
- **STOP after each question.** Wait for the user's response before proceeding.
- Each question should build on the previous answer — follow the thread, don't jump topics.
- Present 2-3 concrete options when possible. Lead with your read of the situation.

## Push-Back Rules

- **If vague** → push for specificity. "Can you give me a concrete example?" / "Name one specific user."
- **If aspirational** → push for observed behavior. "Has anyone actually done this?" / "When did you last see this happen?"
- **If comfortable** → assume you're at the surface layer. Go deeper. "What's the part of this that keeps you up at night?"
- **Max 2 push-backs per question** before accepting with noted risk. Don't interrogate indefinitely — mark it and move on.
- **Push-back counter resets per question.** Each new question gets a fresh 2-pushback budget.

## Codebase-Answerable Rule

If a question can be answered by exploring the codebase, **explore instead of asking.** State your findings and ask the user to confirm or correct. This respects the user's time and produces higher-quality answers.

Example: Instead of "What's the current error handling pattern?", run `grep` / `glob`, describe what you found, and ask "Is this the pattern you want to preserve or change?"

Questions answered this way are marked `SKIPPED` in the ledger with the source noted.

## Tracking Ledger (canonical format)

All callers — standalone or embedded — use this exact format:

```
# Interrogation Ledger

RESOLVED:
  Q1  — [one-line summary of specific, falsifiable answer]
  Q3  — [summary]

PENDING (accepted with risk):
  Q10 — [what was accepted] | RISK: [specific risk noted]

SKIPPED (answered by brief/codebase/inputs):
  Q11 — [source: codebase exploration] [findings summary]
```

The ledger is the primary handoff artifact. In embedded mode, it is returned to the calling skill for use in subsequent phases.

---

## Standalone Mode

When invoked directly (`/grill-me`), interview the user about whatever plan, design, or idea they present:

1. Read any provided context (PRD, plan, design doc, user prompt).
2. Identify the 3-5 most critical assumptions or weakest points.
3. Formulate 8-12 questions targeting those assumptions.
4. Interrogate each one following the protocol above.
5. Produce the ledger summary.
6. Offer: "Want me to dig deeper on any PENDING items, or are we done?"

---

## Embedded Mode

When called from another skill (e.g., `/plan-ceo-review` or `/plan-eng-review` Phase 1):

The calling skill provides a question pool, tells you which questions are mandatory, sets a minimum count, identifies which questions are codebase-answerable, and gives you context (audit findings, brief gaps) for selecting the optional questions. It may also provide pre-interrogation findings (system audit, taste calibration) to present before the first question.

Grill-me owns the asking cadence, push-back decisions, ledger tracking, and exit criteria. The calling skill owns the question content, the pre-interrogation audit, and what happens with the ledger after interrogation completes.

### Execution flow

1. Present pre-interrogation findings if provided.
2. For codebase-answerable questions: explore first, present findings, ask user to confirm. Mark as SKIPPED if confirmed.
3. Ask remaining questions one at a time following the protocol. All mandatory questions first, then selected optional questions to meet the minimum count.
4. Produce the ledger in canonical format.
5. Present the ledger: "Any corrections to the ledger before we move on?"
6. **STOP.** Wait for user confirmation.
7. Return the ledger to the calling skill.

---

## Exit Criteria

The interrogation is complete when:
- All mandatory questions have been asked
- Minimum question count has been met (standalone: 8; embedded: per caller's minimum)
- Each question is either RESOLVED or PENDING with noted risk
- The user has not raised new concerns that need follow-up
- OR the user explicitly says they want to move on

Never end the interrogation early because it feels "long enough." End it when the ledger is complete.

## Abort Protocol

If the user says "skip", "move on", or "enough" before exit criteria are met:
1. Note which mandatory questions remain unasked.
2. Mark them as `PENDING` with risk: "Not asked — user elected to skip."
3. Present the partial ledger.
4. Warn: "These unasked mandatory questions represent unvalidated assumptions. Proceeding carries risk in [specific areas]."
5. Proceed if the user confirms.
