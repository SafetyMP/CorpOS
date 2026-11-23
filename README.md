# CorpOS: Company-Day Simulation with Agent Governance

A reference company-day simulation for agent handoffs, policy decision points (PDP), policy enforcement points (PEP) and human approval. Inspect a scripted support, finance and operations workflow; live language-model calls are optional and disabled by default.

Ada calls Support because she can’t find a $49 credit. Finance can trace the money, while Operations can see whether the shared billing service is healthy. As the on-call lead, whose evidence would you ask for before doing anything that could affect other customers? [Open Ada’s case](https://safetymp.github.io/CorpOS/).

[![CI](https://github.com/SafetyMP/CorpOS/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SafetyMP/CorpOS/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SafetyMP/CorpOS/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/SafetyMP/CorpOS/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/SafetyMP/CorpOS/badge)](https://scorecard.dev/viewer/?uri=github.com/SafetyMP/CorpOS)
[![License: Apache-2.0](https://img.shields.io/github/license/SafetyMP/CorpOS)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](#quick-start)

**Jump to:** [Demo](#demo) · [Quick start](#quick-start) · [Architecture](#architecture) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [ADRs](docs/adr/README.md)

---

## Demo

[Open the CorpOS billing case](https://safetymp.github.io/CorpOS/). A customer calls about a missing credit. Follow the records across Support, Finance and Operations, decide who should act and see what happens to the refund and the shared billing service.

[Open the technical guide](https://safetymp.github.io/CorpOS/#guide) to trace the selected case through the tool gateway, approval rules and execution check. The public demo runs in your browser with simulated records. To run the API and operator console locally, follow the quick start below.

### Trace Ada’s handoff through the simulator

- **Who owes the next step?** The company-day script opens a work contract and passes tasks between Support, Finance and Operations. The case pairs those handoffs with the customer’s report, a ledger entry and service samples. A ledger entry alone cannot establish when the credit appears on Ada’s statement. [Company-day script](packages/core/src/company-day.ts) · [Case observations](apps/console/src/billing-observations.ts)
- **Who can authorize the restart?** The exception handler counts distinct eligible votes. Once enough people approve, the tool gateway checks current policy before allowing the adapter to run. An on-call engineer can follow those decisions separately from the refund. [Exception handler](packages/core/src/company.ts) · [Tool gateway](packages/core/src/gateway.ts)
- **What can the next shift verify?** The browser shows saved trials. After installing dependencies, run `npx vitest run test/billing-observations.test.ts` to reproduce them in fresh in-memory companies and check votes, execution events and the refund record. The audit verifier checks the sequence of recorded events. Operators still need fresh service observations to establish recovery. [Reproduction test](test/billing-observations.test.ts) · [Audit verifier](packages/core/src/audit.ts)

## Quick start

```bash
npm install
npm run build
npm run dev        # billing case on $PORT or 3000
```

Contributors and CI should use `npm ci --include=dev` (see [CONTRIBUTING.md](CONTRIBUTING.md)).

```bash
npm test
npm run scenario                 # default day exits 0: refund stays, restart stays queued
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

`POST /api/company-day` runs the scripted company day. It does not settle the restart, and it does not honor `autoApproveException` from the JSON body. An unauthenticated caller cannot auto-approve.

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

## Documentation map

[docs/README.md](docs/README.md) is the documentation index. Community policy files are the root `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`.
