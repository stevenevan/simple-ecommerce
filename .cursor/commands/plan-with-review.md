Plan mode with structured Metis → optional middle reviewers → Momus pipeline. Updates plan between each pass.

Run the plan-with-review workflow defined in `.agents/skills/plan-with-review/SKILL.md`.

Cursor sub-agents (Subagents / Background Agents) may be used to fan out the reviewer passes. Otherwise play every reviewer role yourself, sequentially:

1. Author the plan — Context, Changes (with file paths), Implementation order, Verification steps.
2. Metis pass — adopt role in `.claude/agents/metis-plan-consultant.md`. Surface hidden intentions, ambiguities, scope creep, AI-slop. Update plan.
3. Ask user which middle reviewers to run: (a) security-auditor (b) architect-reviewer (c) both (d) skip. Use the matching role spec under `.claude/agents/`. Update plan.
4. Momus pass — adopt role in `.claude/agents/momus-high-accuracy-plan-reviewer.md`. Verify file existence, task executability, QA concreteness, contradictions. Update plan.
5. Present the final plan with a Review Trail section.

Rules: update plan between passes; never skip Metis or Momus; keep plan concise.

Task: $ARGUMENTS
