# Contributing to CorpOS

Thanks for your interest in improving CorpOS — a reference implementation of an
autonomous company (firm model, work contracts, and a policy-gated control
plane). This document explains how to set up the project and what is expected of
a contribution.

## Reference posture (read first)

CorpOS is a **reference / educational implementation**, **not** a
production-hardened multi-tenant SaaS. Contributions must not:

- Soften or remove the reference-architecture scope language in the README or
  [SECURITY.md](SECURITY.md).
- Imply production guarantees (multi-tenant isolation, production OIDC/TLS, real
  payment providers) that the codebase does not provide.
- Commit secrets, live credentials, or real customer data.

Please also follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

- **Node.js ≥ 22** (see [`.nvmrc`](.nvmrc); CI covers 22 and 24).
- npm **11.17.0** via Corepack (`packageManager` in [`package.json`](package.json)).
  Required for enforceable `allowScripts` / `strict-allow-scripts`.

## Setup

```bash
npm ci --include=dev
npm run build
./scripts/harness/verify.sh   # build · typecheck · test · lint · format · stack guards
# Force a clean reinstall (CI does this): CORPOS_VERIFY_CLEAN=1 ./scripts/harness/verify.sh
```

A contribution is not finished until `./scripts/harness/verify.sh` is green
locally. CI runs the same gate on every pull request.

Useful commands:

```bash
npm run dev            # ops console on $PORT or 3000
npm test
npm run scenario
npm run audit:verify
```

## Architecture rules (must respect)

- Workspaces: firm logic in [`packages/core`](packages/core), MCP knowledge in
  [`packages/mcp-knowledge`](packages/mcp-knowledge), HTTP in
  [`apps/api`](apps/api), ops UI in [`apps/console`](apps/console).
- **ToolGateway** is the sole chokepoint for consequential tools; unknown tools
  fail closed.
- Do **not** introduce Express or `better-sqlite3` (enforced by the harness).
- Prefer Drizzle + libsql, Hono, and the official MCP SDK for new integration
  surfaces.

## Decisions

Non-trivial architectural decisions are recorded as ADRs in
[`docs/adr/`](docs/adr/). If your change introduces or reverses a decision, add
or update an ADR.

## Screenshots

If you change the ops console layout materially, regenerate README assets:

```bash
npm run build && npm run start   # or PORT=3100 npm run start
npm run screenshots              # see docs/assets/README.md
```

## Commits & pull requests

- Conventional-commit-ish titles: `feat(core): trust unlock after company day`.
- Small, reviewable diffs — one logical change per PR.
- Never commit secrets, `*.db` files, `.env`, or `dist/`.
- Open a pull request against `main`; fill in the PR template; CI must pass
  before merge.

## OSS supply-chain health

| Check                 | Where                                                                |
| --------------------- | -------------------------------------------------------------------- |
| **OpenSSF Scorecard** | [`.github/workflows/scorecard.yml`](.github/workflows/scorecard.yml) |
| **CodeQL**            | [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml)       |
| **Dependabot**        | [`.github/dependabot.yml`](.github/dependabot.yml)                   |
| **Local verify**      | `./scripts/harness/verify.sh`                                        |

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
