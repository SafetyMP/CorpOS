# ADR-19: OTel GenAI + OTLP (r3 amendment)

## Status
Accepted (corpos-autonomous-company-r3)

## Decision
In-memory GenAI spans remain CI default. Optional OTLP/HTTP export when
`CORPOS_OTLP_ENDPOINT` is set. Spans and audit rows carry `trace_id` / `decision_id`.
