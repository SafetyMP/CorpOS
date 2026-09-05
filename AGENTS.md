# CorpOS — agent notes

CorpOS is a **company-day simulation**: firm model, work contracts, PDP/PEP
policy gates, and humans who Approve / Reject / Kill. It is not an agent
orchestration framework (not LangGraph, not CrewAI). LLM calls are optional
actors inside the sim (`CORPOS_ALLOW_LIVE=1`) and must never run in CI.

Factory / corporate-site overlay: [`docs/factory-overlay.md`](docs/factory-overlay.md).
Positioning: [`docs/DESIGN-PIVOT.md`](docs/DESIGN-PIVOT.md).

## Commands

| Command                            | Purpose                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `./scripts/harness/verify.sh`      | Definition of Done — build, typecheck, test, lint, format, stack guards  |
| `./scripts/harness/adversarial.sh` | Authorized local adversarial probes                                      |
| `npm test`                         | Unit tests                                                               |
| `npm run scenario`                 | HITL default-off company day; non-zero unless the exception auto-settles |
| `npm run audit:verify`             | Hash-chained audit receipts                                              |

A change is not done until `./scripts/harness/verify.sh` is green.

## Layout

| Path                     | Responsibility                                               |
| ------------------------ | ------------------------------------------------------------ |
| `packages/core`          | Firm model, work contracts, gateway / PDP / PEP, company day |
| `packages/mcp-knowledge` | Local MCP knowledge server (stdio)                           |
| `apps/api`               | Hono REST + SSE                                              |
| `apps/console`           | Vite + Preact ops console                                    |

## Hard rules

- **Never auto-approve exceptions** unless a test/CI caller passes
  `autoApproveException: true` explicitly. Product demos and the ops console
  keep it `false`.
- **Never live LLM in CI.** Default provider is `SimulationProvider`.
  `CORPOS_ALLOW_LIVE` and `OPENROUTER_API_KEY` must stay unset in verify and CI.
- Do not add LangGraph, CrewAI, or other graph/crew runtimes to “keep up.”
  See [`docs/DESIGN-PIVOT.md`](docs/DESIGN-PIVOT.md).
- Do not introduce Express or `better-sqlite3`.
- Never commit secrets, `*.db`, `.env`, or `dist/`.
