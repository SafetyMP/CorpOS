# ADR-20: G1–G6 firm governance (r3 amendment)

## Status
Accepted (corpos-autonomous-company-r3)

## Decision
- **G1** membership / `active`
- **G2** append-only deliberation trail
- **G3** configurable N-of-M quorum for L4+ (vitest required)
- **G4** dissent on reject
- **G5** transparency records (`decision_id` + `trace_id`) on Governor
- **G6** one-shot appeal for rejected/TTL-expired exceptions

Agents expose `approverRoles` for quorum membership.
