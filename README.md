# CorpOS: Company-Day Simulation with Agent Governance

A reference company-day simulation for agent handoffs, policy decision points (PDP), policy enforcement points (PEP) and human approval. Inspect a scripted support, finance and operations workflow; live language-model calls are optional and disabled by default.

One scripted company day. Support hands a $49 refund to Finance. Finance settles `billing.issue_refund` through the tool gateway and hands the work to Ops. Ops queues `ops.restart_service` for billing-api. The refund stays on the ledger. The restart stays queued until Approve, Reject, or Kill.

`POST /api/company-day` runs that day. It does not settle the restart, and it does not honor `autoApproveException` from the JSON body. An unauthenticated caller cannot auto-approve.

[![CI](https://github.com/SafetyMP/CorpOS/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SafetyMP/CorpOS/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SafetyMP/CorpOS/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/SafetyMP/CorpOS/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/SafetyMP/CorpOS/badge)](https://scorecard.dev/viewer/?uri=github.com/SafetyMP/CorpOS)
[![License: Apache-2.0](https://img.shields.io/github/license/SafetyMP/CorpOS)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](#quick-start)

**Jump to:** [Demo](#demo) · [Quick start](#quick-start) · [Architecture](#architecture) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [ADRs](docs/adr/README.md)

---

## Demo

**The billing handoff.** At the [billing on-call desk](http://localhost:3000), inspect Ada’s missing-credit report, a settled $49 refund and two service captures. Assign the investigation, then hold, reject or vote on the queued billing restart. As platform engineering lead, compare manual handoffs, a ticket checklist and a 30-day shadow pilot using the editable capacity worksheet.

[Trace the billing restart](http://localhost:3000/#guide) carries the selected evidence, owner and decision into a six-call actor trace. Inspect the ledger step and shared-service request, then compare a repeated voter, distinct voters and a gateway stop. The trace link can be bookmarked and reopened with the same inputs.

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
