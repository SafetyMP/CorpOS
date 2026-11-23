# CorpOS: Company-Day Simulation with Agent Governance

Ada’s statement still shows a $49 charge she expected her subscription provider to credit. Support needs an answer, Finance can see the refund ledger, and Operations runs one billing service for every customer. As platform lead, would you send the case for a payment trace or ask Operations to investigate the shared service? A duplicate refund costs money. A poorly justified restart can interrupt other accounts.

CorpOS models the teams’ handoffs as work contracts. Each names who owes the next step. Tool requests carry that authority into a gateway, which routes exceptions to human reviewers and records what ran. The next shift can see which action is still open before asking a customer or another team to repeat work. [Open Ada’s case file](https://safetymp.github.io/CorpOS/) · [Trace the handoff into the gateway](https://safetymp.github.io/CorpOS/#guide)

[![CI](https://github.com/SafetyMP/CorpOS/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SafetyMP/CorpOS/actions/workflows/ci.yml)
[![CodeQL](https://github.com/SafetyMP/CorpOS/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/SafetyMP/CorpOS/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/SafetyMP/CorpOS/badge)](https://scorecard.dev/viewer/?uri=github.com/SafetyMP/CorpOS)
[![License: Apache-2.0](https://img.shields.io/github/license/SafetyMP/CorpOS)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](#quick-start)

**Jump to:** [Demo](#demo) · [Quick start](#quick-start) · [Architecture](#architecture) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [ADRs](docs/adr/README.md)

---

## Demo

Inspect Ada’s report, the ledger and the service observations. Choose a handoff, then follow a proposed restart through the vote and the execution check. The browser uses saved simulation records. The local API and operator console run the scripted company day. Live language-model calls are optional and disabled by default. [Try the case](https://safetymp.github.io/CorpOS/) · [Open the technical guide](https://safetymp.github.io/CorpOS/#guide) · [Run the simulator](#quick-start)

**Would the handoff pay for a pilot?** The platform engineering lead can compare the ticket queue, a payment-and-health checklist and a 30-day shadow pilot. Time comparable cases and have the receiving shift identify the owner and disposition of each proposed restart. Keep execution with the existing team during the pilot. [Pilot worksheet](apps/console/src/BillingCase.tsx)

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
