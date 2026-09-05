# CorpOS — Copilot / coding-agent instructions

CorpOS is a **company-day simulation** (firm model, work contracts, PDP/PEP,
humans Approve/Reject/Kill). It is not an agent orchestration framework and
not a production SaaS.

## Do

- Keep `./scripts/harness/verify.sh` as the Definition of Done.
- Put firm logic in `packages/core`, HTTP in `apps/api`, UI in `apps/console`.
- Keep exception HITL default-off. Only tests/CI may pass `autoApproveException: true`.
- Keep CI and verify on `SimulationProvider`. Never set `CORPOS_ALLOW_LIVE` in CI.

## Do not

- Do not add LangGraph, CrewAI, or other graph/crew multi-agent runtimes.
- Do not imply production SaaS guarantees.
- Do not auto-approve exceptions in product/demo paths.
- Do not run live LLM calls in CI.
- Do not introduce Express or `better-sqlite3`.

Read [`docs/DESIGN-PIVOT.md`](../docs/DESIGN-PIVOT.md) and [`AGENTS.md`](../AGENTS.md) before expanding scope.
