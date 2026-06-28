---
description: Prune stale and abandoned Agent Manager worktrees to reclaim disk and reduce clutter.
agent: code
---

You are the **worktree lifecycle** step of the harness. Reclaim disk and
reduce clutter by retiring worktrees that are no longer needed.

## Process

1. List Agent Manager sessions/worktrees from `.kilo/agent-manager.json`
   (diagnostic state). For each, determine status: completed, abandoned,
   errored, or active.
2. Cross-check with `git worktree list` to find worktrees that exist on
   disk but are stale (merged already, or older than a threshold).
3. ⟏ **STOP** — present a table: worktree | branch | status | size on disk
   (via `du -sh`) | recommended action (keep / drop). Ask the user which
   to retire. Never delete without confirmation.
4. For each approved retirement:
   a. If the branch is merged, delete it with `git branch -d <branch>`
      (lowercase `-d` refuses unmerged branches). Only escalate to `-D`
      after showing the user the unmerged commits and getting explicit
      per-branch confirmation.
   b. Verify the Agent Manager session is **not active** (status is
      completed or abandoned) before removing. Remove the worktree with
      `git worktree remove <path>`. Use `--force` only on an explicit
      confirmation that the worktree contains no wanted uncommitted work.
   c. Prune metadata: `git worktree prune`.
5. Report reclaimed space and remaining worktrees.

## Hard rules

- Never delete an active session or a branch with unmerged, wanted changes.
- Never `rm -rf` a worktree by hand — always use `git worktree remove`.
- Never touch `.kilo/agent-manager.json` by hand to "fix" state; it is
  managed by Agent Manager. If it's stale, note it and let the user reset.

Argument: `$ARGUMENTS` — optional filter (branch prefix) or `--all-merged`
to pre-select all already-merged worktrees for confirmation.
