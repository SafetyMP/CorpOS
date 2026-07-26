# Security Policy

## Status: reference architecture

CorpOS is a **reference implementation of an autonomous company**, not a production SaaS.
Treat it as a design artifact you can run locally.

## Guarantees (within local trust boundary)

- ToolGateway is the sole chokepoint for consequential tools.
- Unknown tools fail closed.
- Exception HITL with TTL; kill switch; department capital caps.
- Hash-chained audit receipts (`npm run audit:verify`).

## Not provided

- Full multi-tenant isolation as a security boundary.
- Production OIDC / TLS by default.
- Real payment or messaging providers.

## Shared demo

When `CORPOS_MODE=shared`, `DASHBOARD_API_TOKEN` is required for approval and kill mutations.

## Dependency / supply-chain hygiene

- Install from the committed `package-lock.json` via `npm ci --include=dev`.
- `packageManager` is **npm@11.17.0** (Corepack). npm 10 cannot enforce `allowScripts`.
- Registry must remain `https://registry.npmjs.org/` — no project `.npmrc` registry override.
- Install scripts are **opt-in and enforced**: `package.json` `allowScripts` pins only
  `esbuild` / `fsevents` versions in the lockfile; `.npmrc` sets `strict-allow-scripts=true`.
  `./scripts/harness/verify.sh` fails if `npm approve-scripts --allow-scripts-pending` reports gaps.
- Verify does **not** wipe `node_modules` by default (avoids concurrent `ENOTEMPTY` races).
  CI sets `CORPOS_VERIFY_CLEAN=1` for a full reinstall. Never fetch npm via `npx` inside verify.
- `@hono/node-server` is pinned to `2.0.11` via root dependency + `overrides` (covers API
  `serveStatic` and `@modelcontextprotocol/sdk`).
- Review Dependabot PRs before merge; re-run `npm approve-scripts --allow-scripts-pending`
  after lockfile changes that introduce new install scripts.
- Do **not** set `dangerously-allow-all-scripts=true` in CI.

## Reporting

Use GitHub Security Advisories on the CorpOS repository.
