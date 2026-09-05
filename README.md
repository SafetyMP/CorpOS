# CorpOS

> **Company-day simulation** of a firm — work contracts, PDP/PEP policy gates, and humans who Approve / Reject / Kill. Not an autonomous-company SaaS, and not LangGraph, CrewAI, or any multi-agent orchestration framework.

> **In the SafetyMP thesis:** Agent path inside a **simulated firm**. Default actors are scripted (`SimulationProvider`). This is not a live EHS, health, or finance workforce. See the [portfolio README](https://github.com/SafetyMP/SafetyMP).

[![CI](https://github.com/SafetyMP/CorpOS/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SafetyMP/CorpOS/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SafetyMP/CorpOS/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/SafetyMP/CorpOS/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/SafetyMP/CorpOS/badge)](https://scorecard.dev/viewer/?uri=github.com/SafetyMP/CorpOS)
[![License: Apache-2.0](https://img.shields.io/github/license/SafetyMP/CorpOS)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](#quick-start)

CorpOS simulates a company day: department actors settle work contracts under a policy gate, and **humans govern by exception** (Approve / Reject / Kill in the ops console). Autonomy is earned from evidence, not granted in prompts. Interop protocols (MCP) are transport; firm-side governance includes **G1 membership** and **G4 dissent** today, with a broader G1–G6 crosswalk in the docs. Positioning: [`docs/DESIGN-PIVOT.md`](docs/DESIGN-PIVOT.md).

> **Scope:** Reference architecture and runnable demo — **not** a production-hardened SaaS. See [SECURITY.md](SECURITY.md).

Default mode is **simulation** (`SimulationProvider`) for deterministic CI. Live LLM (`HttpLLMProvider`) is an optional actor inside the sim only when `CORPOS_ALLOW_LIVE=1` and `OPENROUTER_API_KEY` are set — `/api/health.mode` never lies. G1–G6 firm governance, orchestrator-driven day, TTL scheduler, console Bearer (shared mode), and live `/api/events` SSE are implemented.

Read the thesis: [`docs/future-of-the-firm.md`](docs/future-of-the-firm.md). Governance crosswalk: [`docs/governance-crosswalk.md`](docs/governance-crosswalk.md). AIBOM: [`docs/aibom.json`](docs/aibom.json). Docs index: [`docs/README.md`](docs/README.md).

**Jump to:** [Demo](#demo) · [Quick start](#quick-start) · [Architecture](#architecture) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [ADRs](docs/adr/README.md)

---

## Demo

<p align="center">
  <img src="docs/assets/demo.gif" alt="CorpOS ops console — agents hand off a company day (support → finance → ops), trust unlock, and Governor (synthetic demo data)" width="900" />
</p>

### Screenshots

|             Ops             |               Company day               |               Governor                |
| :-------------------------: | :-------------------------------------: | :-----------------------------------: |
| ![Ops](docs/assets/ops.png) | ![Company day](docs/assets/ops-day.png) | ![Governor](docs/assets/governor.png) |

- **Local demo:** `npm install && npm run build && npm run dev` → [http://localhost:3000](http://localhost:3000)
- **Regenerate GIF/PNGs:** start the console, then `npm run screenshots` — see [`docs/assets/README.md`](docs/assets/README.md)

Click **Run company day** to watch the agent activity timeline: support → finance → ops handoffs, an autonomous settle, an exception approval path, compensation, and trust unlock. The console sends `autoApproveException: false` so the exception stays in the HITL queue for Approve/Reject.

---

## Quick start

```bash
npm install
npm run build
npm run dev        # ops console on $PORT or 3000
```

Contributors and CI should use `npm ci --include=dev` (see [CONTRIBUTING.md](CONTRIBUTING.md)).

```bash
npm test
npm run scenario                 # HITL default-off; exits non-zero when exception is not auto-settled
npm run audit:verify
./scripts/harness/verify.sh      # functional / static acceptance
./scripts/harness/adversarial.sh # authorized local adversarial probes (CI also runs this)
```

### Container

```bash
docker build -t corpos .
docker run --rm -p 3000:3000 corpos
```

CI may publish images to `ghcr.io/safetymp/corpos` (tags: branch, sha, semver, `latest`). Optional Fly.io deploy runs from [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on GitHub release when `FLY_API_TOKEN` is set — see [`fly.toml`](fly.toml).

## Architecture

| Layer                 | Package / app           | Responsibility                                        |
| --------------------- | ----------------------- | ----------------------------------------------------- |
| Firm / work / control | `@corpos/core`          | Contracts, gateway, policy, trust, audit, company day |
| MCP knowledge         | `@corpos/mcp-knowledge` | Real local MCP server (stdio)                         |
| API                   | `@corpos/api`           | Hono REST + SSE                                       |
| Ops console           | `@corpos/console`       | Vite + Preact                                         |

Stack: Node ≥22 · TypeScript · npm workspaces · Hono · Drizzle + libsql · official MCP SDK · Preact. No Express, no `better-sqlite3`, no agent-framework lock-in.

Architecture decisions live in [`docs/adr/README.md`](docs/adr/README.md).

## Security

Reference architecture — not production-hardened. `DASHBOARD_API_TOKEN` is required for approve/kill mutations by default; `CORPOS_MODE=local` does not skip the bearer gate. Decide/appeal bind the decider and tenant to `DASHBOARD_OPERATOR_ID` / `DASHBOARD_TENANT_ID`, not the request body. Set `CORPOS_ALLOW_UNAUTHENTICATED=true` only for local simulation. See [SECURITY.md](SECURITY.md).

## Community

[Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security](SECURITY.md) · [ADRs](docs/adr/README.md)

## License

Apache-2.0 — Copyright © 2026 SafetyMP.
