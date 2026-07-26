<!-- Thanks for contributing! Provide a short summary above. -->

## Summary

<!-- What does this change do, and why? Reference an issue if applicable. -->

## Change type

- [ ] feat — new capability
- [ ] fix — bug fix
- [ ] refactor — no behavior change
- [ ] docs — documentation only
- [ ] test — tests only
- [ ] chore — tooling, deps, CI

## Checklist

- [ ] `./scripts/harness/verify.sh` is green locally.
- [ ] `./scripts/harness/adversarial.sh` is green locally (or N/A for docs-only).
- [ ] New behavior is covered by a test where applicable.
- [ ] No Express or `better-sqlite3` introduced.
- [ ] No secrets, `*.db`, `.env`, or `dist/` staged.
- [ ] Reference-architecture posture preserved (README / SECURITY scope language not weakened).
- [ ] Company-day / demo paths keep `autoApproveException` default-off unless a test/CI opt-in is intentional.
- [ ] If this introduces or reverses a decision, an ADR is added/updated in `docs/adr/`.
- [ ] If the ops console UI changed materially, README screenshots were regenerated (`npm run screenshots`).

## Security

If this change fixes a security vulnerability, **stop** and follow
[SECURITY.md](../SECURITY.md) instead of opening a public PR.
