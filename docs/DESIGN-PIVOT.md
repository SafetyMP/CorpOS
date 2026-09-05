# Design pivot — company-day simulation (September 2026)

CorpOS is a **company-day simulation**. The product is a firm model, work
contracts, PDP/PEP policy enforcement, and humans who **Approve / Reject / Kill**.
It is **not** an agent orchestration framework.

## What this is

- A deterministic (by default) simulation of a company day.
- Work contracts that draft, hand off, settle, and compensate.
- A policy decision point / policy enforcement point (PDP/PEP) on consequential tools.
- Human governors in the ops console: Approve, Reject, Kill.

## What this is not

- Not an autonomous-company SaaS.
- Not LangGraph, CrewAI, AutoGen, or any multi-agent graph/crew runtime.
- Not a place to add graph/crew features to “keep up” with orchestration frameworks.

LLM calls are **optional actors inside the sim**. They turn on only when
`CORPOS_ALLOW_LIVE=1` (plus a provider key). CI and `./scripts/harness/verify.sh`
stay on `SimulationProvider`. Health `mode` must never claim live when it is not.

## Contested: CrewAI / LangGraph / multi-agent runtimes

Do not add those runtimes. CorpOS already has a small in-process orchestrator
that drives a scripted company day (`enqueueAndRun` / `waitForResume`). That
surface exists to persist and resume work contracts under policy — not to
compete as a general agent graph.

## Next slice

1. **Shrink** the orchestrator surface (fewer general-purpose graph APIs).
2. **Deepen** work-contract semantics and PDP/PEP evidence (receipts, deny
   paths, HITL default-off, audit chain).

See also [ADR-11](adr/0011-provider-strategy.md), [ADR-15](adr/0015-company-day-orchestrator-workload.md),
[ADR-17](adr/0017-governance-pdp-pep.md).
