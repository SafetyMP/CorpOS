# ADR-17: Governance PDP/PEP enforcement modes (r3 amendment)

## Status
Accepted (corpos-autonomous-company-r3)

## Decision
Runtime enforcement via `CORPOS_ENFORCEMENT` and `POST /api/governance/enforcement`
(`strict`|`audit`). Audit mode logs would-deny; never silent fail-open.
TypeScript three-layer checks in `packages/core/src/authz.ts`. No Cedar engine, no Rego runtime, and no OPA sidecar.
