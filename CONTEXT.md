# Project context

CorpOS is the open reference implementation of an autonomous company:
firm model + work contracts + control plane + governance plane (July 2026).

Workspaces: `packages/core`, `packages/mcp-knowledge`, `apps/api`, `apps/console`.

Commands: `npm run dev`, `npm test`, `npm run scenario`, `npm run audit:verify`,
`./scripts/harness/verify.sh`, `./scripts/harness/adversarial.sh`.

- `npm run scenario` uses HITL default-off (`autoApproveException` unset) and exits
  non-zero when the exception path is not auto-settled. Tests pass
  `autoApproveException: true` for a green headless settle.
- Live LLM requires `CORPOS_ALLOW_LIVE=1` and `OPENROUTER_API_KEY` (company-day uses
  `HttpLLMProvider` when live; `/api/health.mode` reports `live` only then).
- Shared mode (`CORPOS_MODE=shared` + `DASHBOARD_API_TOKEN`) gates approve/kill on
  the API via Bearer; console sends `VITE_DASHBOARD_API_TOKEN` when configured.
  Decide/appeal bind `decidedBy` and tenant to `DASHBOARD_OPERATOR_ID` /
  `DASHBOARD_TENANT_ID` (not the request body).

Site id: `corpos`. Program: `corpos-autonomous-company-r3`.
G1–G6 firm governance coded; TTL scheduler; console Bearer; orchestrator-driven day; live SSE.
