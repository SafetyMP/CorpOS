# Project context

CorpOS is the open reference implementation of an autonomous company:
firm model + work contracts + control plane + governance plane (July 2026).

Workspaces: `packages/core`, `packages/mcp-knowledge`, `apps/api`, `apps/console`.

Commands: `npm run dev`, `npm test`, `npm run scenario`, `npm run audit:verify`,
`./scripts/harness/verify.sh`, `./scripts/harness/adversarial.sh`.

Site id: `corpos`. Program: `corpos-autonomous-company-r3`.
Live LLM requires `CORPOS_ALLOW_LIVE=1` and `OPENROUTER_API_KEY` (company-day uses HttpLLMProvider when live).
G1–G6 firm governance coded; TTL scheduler; console Bearer; orchestrator-driven day; live SSE.
