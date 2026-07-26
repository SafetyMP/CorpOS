# CorpOS

> Reference implementation of an **autonomous company** — firm model, work contracts, and a policy-gated control plane.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022-green.svg)](package.json)

CorpOS shows how a firm operates when department agents do most work and **humans govern by exception**. Autonomy is earned from evidence, not granted in prompts.

Read the thesis: [`docs/future-of-the-firm.md`](docs/future-of-the-firm.md).

## Quick start

```bash
npm install
npm run build
npm run dev        # ops console on $PORT or 3000
```

Click **Run company day** for the multi-handoff demo (support → finance → ops), including an autonomous settle, an exception approval path, compensation, and trust unlock.

```bash
npm test
npm run scenario
npm run audit:verify
```

## Architecture

| Layer                 | Package / app           | Responsibility                                        |
| --------------------- | ----------------------- | ----------------------------------------------------- |
| Firm / work / control | `@corpos/core`          | Contracts, gateway, policy, trust, audit, company day |
| MCP knowledge         | `@corpos/mcp-knowledge` | Real local MCP server (stdio)                         |
| API                   | `@corpos/api`           | Hono REST + SSE                                       |
| Ops console           | `@corpos/console`       | Vite + Preact                                         |

Stack: Node ≥22 · TypeScript · npm workspaces · Hono · Drizzle + libsql · official MCP SDK · Preact. No Express, no `better-sqlite3`, no agent-framework lock-in.

## Security

Reference architecture — not production-hardened. Set `CORPOS_MODE=shared` and `DASHBOARD_API_TOKEN` before exposing approvals. See [SECURITY.md](SECURITY.md).

## License

Apache-2.0 — Copyright © 2026 SafetyMP.
