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

## Reporting

Use GitHub Security Advisories on the CorpOS repository.
