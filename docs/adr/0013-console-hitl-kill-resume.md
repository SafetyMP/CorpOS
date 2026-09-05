# ADR-13: Console HITL + TTL + elicitation (r3 amendment)

## Status
Accepted (corpos-autonomous-company-r3)

## Decision
Console sends `Authorization: Bearer` from `VITE_DASHBOARD_API_TOKEN` on decide/kill.
The API ignores client-supplied `by` / `tenantId` on decide/appeal and binds
`decidedBy` plus tenant matching to `DASHBOARD_OPERATOR_ID` / `DASHBOARD_TENANT_ID`
(defaults `operator@dashboard` / `default`). Cross-tenant attempts return 403.
This remains a shared static token, not per-user OIDC.
`expireTtl` runs on API boot, ~30s interval, and before company-day/decide.
MCP elicitation for privileged tools resolves via the durable exception queue.
