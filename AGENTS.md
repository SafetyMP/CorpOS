# Site contract

## Gates

| Command                            | Purpose                             |
| ---------------------------------- | ----------------------------------- |
| `./scripts/harness/verify.sh`      | Functional and static acceptance    |
| `./scripts/harness/adversarial.sh` | Authorized local adversarial probes |

Record `verification_scripts` as the site directory `scripts/harness`. Required
entrypoints are `verify.sh` and `adversarial.sh`. Digest-bound companions under
the same directory (included in the harness digest) are:

- `check-stub-canary.sh` — mandatory non-trivial verify canary
- `adversarial-run.mjs` — adversarial probe implementation

Optional wrappers may remain at `scripts/verify.sh` / `scripts/adversarial.sh`
(and `scripts/check-stub-canary.sh`) for humans; they are outside the digest
boundary.

The corporate handoff fixes scope. The site manager assigns ADRs; site specialists write;
operations excellence reviews current evidence. Work in isolated roots, never edit
corporate approval state, and never self-approve.

Site id: `corpos`. Prior Cursor Harness v4 is under `_archives/harness-v4/`.
Product company-day demos must not auto-approve exceptions unless a test/CI
caller passes `autoApproveException: true` explicitly.
