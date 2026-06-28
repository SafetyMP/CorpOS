---
description: Stage and commit changes using Conventional Commits.
agent: code
---

Create a clean, well-scoped commit from the current changes.

Rules:

1. Inspect `git status`, `git diff`, and `git log --oneline -10` to match
   the repo's commit style.
2. Stage only the files relevant to the change. Never stage secrets,
   `.env*`, or generated artifacts.
3. Write a Conventional Commit subject (imperative, <= ~72 chars):
   `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `perf:`,
   `style:`, `ci:`, `build:`.
4. Add a body only when context is needed; wrap at ~72 chars.
5. Do not push, do not amend prior commits, do not use `-i`.

If $ARGUMENTS is given, use it as the subject line.
