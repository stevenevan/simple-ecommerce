---
name: plan-with-review
description: >
  Plan mode with structured agent review pipeline. Creates implementation plan then runs
  sequential review: metis-plan-consultant → optional middle reviewers (security-auditor,
  architect-reviewer, or both) → momus-high-accuracy-plan-reviewer. Updates plan after
  each review before passing to next reviewer. Use when user says /plan-with-review.
argument-hint: "<task description>"
---

# Plan With Review

Create an implementation plan, then run it through a structured review pipeline before execution.

## Review Pipeline (fixed sequence)

```
1. You create the plan
2. metis-plan-consultant    (REQUIRED — strategic analysis, hidden risks, scope)
3. [UPDATE plan with metis findings]
4. ASK user: "Which middle reviewers? (a) security-auditor (b) architect-reviewer (c) both (d) skip"
5. Run selected middle reviewers (parallel if both)
6. [UPDATE plan with middle reviewer findings]
7. momus-high-accuracy-plan-reviewer  (REQUIRED — final accuracy/executability check)
8. [UPDATE plan with momus findings]
9. Present final plan to user
```

## How It Works

### Step 1 — Create Plan
Build implementation plan for the user's task. Include:
- Context: why this change is needed
- Changes: what exactly to do, with file paths
- Implementation order
- Verification steps

### Step 2 — Metis Review (REQUIRED)
Launch `metis-plan-consultant` agent. Pass:
- Full plan file path
- Current state context
- Ask for: hidden intentions, ambiguities, over-engineering risks, scope creep, "just enough" audit

Update plan with findings before proceeding.

### Step 3 — Ask User for Middle Reviewers
Ask user which optional reviewers to include:

> **Which reviewers for this plan?**
> - **(a)** security-auditor — permission model, secrets, injection vectors, OWASP coverage
> - **(b)** architect-reviewer — system design, patterns, scalability, tech debt
> - **(c)** both (run in parallel)
> - **(d)** skip — go straight to momus

### Step 4 — Middle Reviewers (if selected)
Run selected reviewer(s). If both selected, launch in parallel.
Update plan with all findings before proceeding.

### Step 5 — Momus Review (REQUIRED)
Launch `momus-high-accuracy-plan-reviewer` agent. Pass:
- Updated plan file path
- Ask for: file existence verification, task executability, QA concreteness, contradiction check

Update plan with momus findings.

### Step 6 — Present Final Plan
Show user summary of all review findings and final plan. Then ExitPlanMode or proceed to implementation.

## Plan File Format

Add a **Review Trail** section at bottom of plan file tracking each reviewer:

```markdown
## Review Trail

### Metis Plan Consultant
- [x] Finding 1 applied
- [x] Finding 2 applied

### Security Auditor (if run)
- [x] Finding applied

### Architect Reviewer (if run)
- [x] Finding applied

### Momus Plan Reviewer
- [x] All files verified
- [x] Tasks executable
```

## Rules

- ALWAYS update plan file between each reviewer — next reviewer must see previous findings
- NEVER skip metis or momus — they are mandatory
- Middle reviewers are optional — always ask user
- If both middle reviewers selected, run them in parallel (single message, two Agent calls)
- Keep plan concise — reviewers add bloat, trim after each round
