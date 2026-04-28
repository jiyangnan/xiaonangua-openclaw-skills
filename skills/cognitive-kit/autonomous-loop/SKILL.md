---
name: autonomous-loop
version: 1.0
description: |
  Autonomous iterative loop for complex multi-step tasks. Ensures each iteration
  produces information gain, detects stuck states, and enforces budget/safety
  constraints. Use when a task requires repeated act-observe-evaluate cycles
  without per-step user approval.
trigger: |
  Use when executing a multi-step task that requires iterative refinement,
  debugging, or autonomous problem-solving without per-step user approval.
  NOT for simple linear tasks or single tool calls.
---

# Autonomous Loop

## Core Principle

Every loop iteration must produce **new information** or **state change**.
If neither happens, the loop is stuck — exit and report.

## Loop Structure

```
GOAL → [ACT → OBSERVE → EVALUATE] → DONE | STUCK | CONTINUE
```

### 1. GOAL — Define before looping

Before entering the loop, explicitly state:
- **Target**: What does "done" look like? (verifiable condition)
- **Constraints**: What must never happen? (safety boundary)
- **Budget**: Max iterations / max time / max tokens

If you cannot state these, do NOT enter autonomous mode — ask the user.

### 2. ACT — One discrete action per iteration

- Each iteration performs exactly ONE meaningful action (tool call, code edit, test run)
- State the hypothesis: "I expect this action to produce X because Y"
- If the action is exploratory (reading, searching), it still must have a stated purpose

### 3. OBSERVE — Capture the outcome

- Record what actually happened vs. expected
- Note any surprises or new information
- Update your mental model of the problem

### 4. EVALUATE — Decide next state

| Condition | Action |
|-----------|--------|
| Target condition met | **DONE** — report result |
| Progress toward target detected | **CONTINUE** — next iteration |
| Same state as previous iteration | **PIVOT** — change approach |
| Same state after 2 pivots | **STUCK** — exit and report |
| Constraint violated | **ABORT** — exit immediately |
| Budget exhausted | **STOP** — report progress so far |

## Anti-Patterns (MUST avoid)

1. **Blind retry** — Running the same command twice without changing anything
2. **Scope creep** — Adding new goals mid-loop without user consent
3. **Sunk cost** — Continuing a failing approach because you've invested iterations
4. **Phantom progress** — "Almost there" for 3+ iterations without measurable change
5. **Hidden dependency** — Assuming a tool/API works without verifying first

## Progress Detection

Progress is one of:
- **Quantitative**: Test passes increase, error count decreases, file size changes
- **Qualitative**: New error message (means you hit a different layer), understanding deepened
- **Structural**: File created/deleted, dependency resolved, state transitioned

If NONE of these apply, you are NOT making progress.

## Safety Guardrails

- **Destructive actions** (delete, overwrite, deploy) require explicit user confirmation even in autonomous mode
- **External side effects** (API calls, messages sent, deployments) — verify idempotency first
- **Budget alarm** — at 75% of iteration budget, pause and report status; ask user whether to continue

## Output Format

When reporting loop results:

```
## Autonomous Loop Report
- **Goal**: [original target]
- **Iterations used**: N / budget
- **Status**: DONE | STUCK | STOPPED | ABORTED
- **Key finding**: [the most important thing learned]
- **Result**: [what was accomplished]
- **If not done**: [what's blocking + recommended next step]
```
