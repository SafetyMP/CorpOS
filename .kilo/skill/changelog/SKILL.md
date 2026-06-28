---
name: changelog
description: Generate or update a CHANGELOG.md from git history following Keep a Changelog conventions.
---

# Skill: changelog

Use this skill when asked to generate, update, or audit a `CHANGELOG.md`.

## Workflow

1. Determine the range of commits to summarize. Default: since the last
   annotated tag, or `git log` since the last changelog section's date.
   Use `git log --oneline <range>` and read significant commits.
2. Classify each change into Keep a Changelog categories:
   - **Added** — new features
   - **Changed** — changes to existing functionality
   - **Deprecated** — soon-to-be removed features
   - **Removed** — now removed features
   - **Fixed** — bug fixes
   - **Security** — vulnerability fixes
3. Determine the version bump using SemVer:
   - Major: breaking / removed
   - Minor: added (backwards-compatible)
   - Patch: fixed / changed (backwards-compatible)
4. Update `CHANGELOG.md` under a new `## [x.y.z] - YYYY-MM-DD` heading,
   keeping an `## [Unreleased]` section at the top. Group entries by
   category; one bullet per user-facing change.
5. Prefer user-facing language. Omit pure refactors, lint, and CI noise
   unless they affect behavior.

## Conventions

- Link versions to their compare URLs when a remote exists.
- Keep entries terse; start bullets with a verb or noun, not "Added a".
- Never invent commits — only summarize what `git log` shows.
