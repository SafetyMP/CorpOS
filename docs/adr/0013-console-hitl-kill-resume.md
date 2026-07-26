# ADR-13: Console HITL + TTL + elicitation (r3 amendment)

## Status
Accepted (corpos-autonomous-company-r3)

## Decision
Console sends `Authorization: Bearer` from `VITE_DASHBOARD_API_TOKEN` on decide/kill.
`expireTtl` runs on API boot, ~30s interval, and before company-day/decide.
MCP elicitation for privileged tools resolves via the durable exception queue.
