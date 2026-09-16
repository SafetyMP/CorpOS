---
name: company-day-simulation
description: "Change CorpOS company-day simulation behavior (firm model, work contracts, PDP/PEP, Approve/Reject/Kill). Use when editing packages/core, exception HITL, or SimulationProvider. Do not add LangGraph/CrewAI or auto-approve exceptions in product paths."
---

# Company-day simulation

CorpOS simulates a company day: firm model, work contracts, PDP/PEP, humans Approve / Reject / Kill.

## Do

- Put firm logic in `packages/core`, HTTP in `apps/api`, UI in `apps/console`.
- Keep exception HITL default-off.
- Keep CI on `SimulationProvider`.

## Do not

- Auto-approve exceptions unless a test passes `autoApproveException: true`.
- Set `CORPOS_ALLOW_LIVE` in CI.
- Add LangGraph, CrewAI, Express, or `better-sqlite3`.

Verify: `./scripts/harness/verify.sh`.
