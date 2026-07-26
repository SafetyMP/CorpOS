# ADR-15: Company-day orchestrator + SSE (r3 amendment)

## Status
Accepted (corpos-autonomous-company-r3)

## Decision
Company day drives agents via `Orchestrator.enqueueAndRun`. Handoffs create successor
tasks. HITL can `waitForResume` when awaitHitl is enabled. `/api/events` streams live
firm/timeline events over SSE.
