# ADR-11: Provider strategy (r3 amendment)

## Status
Accepted (corpos-autonomous-company-r3)

## Decision
SimulationProvider remains the CI/default scripted company-day provider.
When `CORPOS_ALLOW_LIVE=1` and `OPENROUTER_API_KEY` are set, `resolveProvider()`
returns HttpLLMProvider and company-day/orchestrator use that live provider.
`/api/health.mode` is `live` only when HttpLLMProvider is active.
