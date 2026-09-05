# Security Policy

## Status: reference architecture

CorpOS is a **reference implementation of an autonomous company**, not a production SaaS.
Treat it as a design artifact you can run locally.

## Guarantees (within local trust boundary)

- ToolGateway is the sole chokepoint for consequential tools.
- Unknown tools fail closed.
- Exception HITL with scheduled TTL fail-closed; kill switch; department capital caps.
- Shared-mode console sends Bearer (`VITE_DASHBOARD_API_TOKEN` / `DASHBOARD_API_TOKEN`).
- Dashboard mutations require `DASHBOARD_API_TOKEN` by default; `CORPOS_MODE !== "shared"` does not ungated them.
- Approve/appeal bind `decidedBy` and tenant matching to `DASHBOARD_OPERATOR_ID` /
  `DASHBOARD_TENANT_ID` (defaults `operator@dashboard` / `default`). Client-supplied
  `by` / `tenantId` on those routes are ignored. This is still a shared static token,
  not per-user OIDC.
- G3 quorum, G6 appeal, and enforcement `strict`/`audit` modes.
- Hash-chained audit receipts (`npm run audit:verify`).
- Company-day demos do not auto-approve exceptions unless a caller passes
  `autoApproveException: true` (tests/CI only).

## Not provided

- Full multi-tenant isolation as a security boundary.
- Production OIDC / TLS by default.
- Real payment or messaging providers.
- Live LLM agent execution (health may report `mode: "live"`; company-day still
  uses `SimulationProvider`).

## Shared demo

When `CORPOS_ALLOW_UNAUTHENTICATED` is unset, `DASHBOARD_API_TOKEN` is required as a **Bearer**
token on API approve and kill mutations. `CORPOS_MODE=local` (or any value other than
an explicit opt-in) does not skip the gate. The ops console sends
`VITE_DASHBOARD_API_TOKEN` when configured. The server derives the decider and tenant
from `DASHBOARD_OPERATOR_ID` / `DASHBOARD_TENANT_ID`, not from the request body, and
rejects decide/appeal when the exception tenant does not match. This is a
static token compare for demos, not an OAuth flow.

## Dependency / supply-chain hygiene

- Install from the committed `package-lock.json` via `npm ci --include=dev`.
- `packageManager` is **npm@11.17.0** (Corepack). npm 10 cannot enforce `allowScripts`.
- Registry must remain `https://registry.npmjs.org/` — no project `.npmrc` registry override.
- Install scripts are **opt-in and enforced**: `package.json` `allowScripts` pins only
  `esbuild` / `fsevents` versions in the lockfile; `.npmrc` sets `strict-allow-scripts=true`.
  `./scripts/harness/verify.sh` fails if `npm approve-scripts --allow-scripts-pending` reports gaps.
- Verify does **not** wipe `node_modules` by default (avoids concurrent `ENOTEMPTY` races).
  CI sets `CORPOS_VERIFY_CLEAN=1` for a full reinstall. Never fetch npm via `npx` inside verify.
- `@hono/node-server` is pinned to `2.0.12` via root dependency + `overrides` (covers API
  `serveStatic` and `@modelcontextprotocol/sdk`).
- Review Dependabot PRs before merge; re-run `npm approve-scripts --allow-scripts-pending`
  after lockfile changes that introduce new install scripts.
- Do **not** set `dangerously-allow-all-scripts=true` in CI.

## Reporting

Use GitHub Security Advisories on the CorpOS repository for **vulnerabilities**.
Conduct issues are handled under [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), not
security advisories.
