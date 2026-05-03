Review a task branch against base using 1–3 reviewer roles scaled to risk. Outputs must-fix / should-fix buckets.

Run the review-complex-task workflow defined in `.agents/skills/review-complex-task/SKILL.md`.

Cursor sub-agents may fan out 1–3 reviewers in parallel per the SKILL. Otherwise play each reviewer role sequentially. Role specs live in `.claude/agents/`:
- `code-reviewer.md`
- `security-auditor.md`
- `architect-reviewer.md`

Phases:
- 0 — Clarify inputs (target/base branch, acceptance criteria, scope bounds). One consolidated question.
- 1 — Diff via git: `merge-base`, `log --oneline base..target`, `diff --stat base...target`, `diff base...target` (three dots).
- 1.5 — Pick 1–3 reviewer roles via SKILL's signal scan + matrix. Always include `code-reviewer`. Announce set + rationale.
- 2 — Execute reviewers with shared context block + per-role focus prompt. Findings: severity, location, problem, fix.
- 3 — Consolidate must-fix / should-fix (max 8 each). Drop nitpicks. Apply `[dissent]` rules.
- 4 — Anti-hallucination pass: verify file exists, lines in diff, quoted code verbatim, symbols exist, severity justified, citations check out.

Output: exact format from SKILL. English-only.

Args (target/base/criteria optional): $ARGUMENTS
