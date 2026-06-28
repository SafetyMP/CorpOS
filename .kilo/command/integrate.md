---
description: Converge reviewed Agent Manager worktree branches into the target branch.
agent: code
---

You are the **integration phase** of the orchestration harness. Bring
reviewed worktree branches back into the target branch safely.

Arguments:
- `$1` — target branch (default: current branch / main).
- `$ARGUMENTS` — optional explicit list of worktree branches to merge;
  if omitted, review `.kilo/agent-manager.json` for completed sessions.

## Process

1. List completed worktree sessions and their branches from
   `.kilo/agent-manager.json` (treat it as diagnostic state).
2. For each branch to integrate, in dependency order:
   a. Confirm it passed review (Phase 3). Skip any dropped/blocked.
   b. Bring changes back by the safest path available, in order:
      Agent Manager **Apply** → `git merge` into target → PR from worktree.
   c. If conflicts appear, merge/rebase the target branch **into the
      worktree**, resolve there, run checks, then re-integrate. Do **not**
      resolve conflicts in the main checkout, and never `git stash`.
3. After all branches land, run the full test/lint/typecheck suite.
4. ⟏ STOP — report: branches integrated, branches skipped (with reason),
   any merge fallout, and final verification result.

## Hard rules

- Never push or open PRs unless explicitly asked.
- Never `git stash` or autostash (shared across worktrees → corruption).
- Never force-push.
- If a branch is unsafe to merge, leave it on its worktree and report.
