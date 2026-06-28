---
description: Review uncommitted working-tree changes for bugs and regressions.
agent: review
subtask: true
---

Review the current uncommitted changes in the working tree.

Steps:

1. Run `git status` and `git diff` to see all staged, unstaged, and
   untracked changes.
2. Read the changed files in full context where needed to understand
   surrounding code and callers.
3. Produce a review grouped by severity (Blocker / Should fix / Nit),
   citing each issue with `file:line` and a concrete suggested fix.
4. If the changes are sound, say what you verified.

Argument: $ARGUMENTS — optional path filter or focus area.
