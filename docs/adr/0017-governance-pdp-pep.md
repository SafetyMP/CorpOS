# ADR-17: Governance PDP/PEP enforcement modes (r3 amendment)

## Status
Accepted (corpos-autonomous-company-r3)

## Decision
Runtime enforcement via `CORPOS_ENFORCEMENT` and `POST /api/governance/enforcement`
(`strict`|`audit`). Audit mode logs would-deny; never silent fail-open.
Rego-shaped isomorphic TS PDP — no OPA sidecar required.
