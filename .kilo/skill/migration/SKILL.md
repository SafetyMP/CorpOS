---
name: migration
description: Guide schema or data migrations — write up/down steps, guards, backfill, and rollback plan.
---

# Skill: migration

Use this skill when asked to add or change a database schema, migrate data
between formats, or alter a persistent data shape. Migrations are
high-risk: prioritize reversibility and zero-downtime over cleverness.

## Workflow

1. **Characterize the change.** Schema add/remove/rename/retyping, or a
   data transform. Identify the store (SQL, NoSQL, config files,
   serialized formats).
2. **Choose the expansion/contract strategy** (expand → migrate →
   contract) so old and new code can coexist:
   - Expand: add the new shape alongside the old; both work.
   - Migrate: backfill/transform existing data with idempotent writes.
   - Contract: remove the old shape only after all readers are updated.
3. **Write up + down.** Every migration needs a forward step and a tested
   rollback. A down-step that "won't work" means the migration is unsafe —
   redesign.
4. **Guards.** Make migrations idempotent and re-runnable. Guard against
   partial failure (wrap multi-statement migrations in a transaction
   where supported).
5. **Scale.** For large tables, batch the backfill; avoid long table
   locks; consider online schema change tools for hot datasets.

## Output

- **Summary** — what changes, why, risk level.
- **Steps** — ordered, each reversible, with the exact SQL/commands.
- **Backfill** — how existing rows/records are transformed (batched if
  large), idempotent.
- **Rollback** — the down path and how to verify it.
- **Verification** — how to confirm success (row counts, sample checks,
  invariant assertions).

Never run destructive migrations without confirmation. Read the target
store's docs; prefer its native migration framework (Alembic, Knex,
Prisma migrate, golang-migrate, Flyway, etc.).
