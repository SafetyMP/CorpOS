# Security Policy

## Status: reference architecture / research demo

CorpOS is a **greenfield reference architecture** for policy-gated autonomous
agent systems. It is **not production-hardened** and must not be operated as
if it were. Treat it as a design artifact you can read, run locally, and learn
from — not as software safe to expose to untrusted users or to let act on real
money, real customers, or real infrastructure.

## What the design does guarantee

CorpOS is deliberately **policy-first**:

- **Single authorization chokepoint.** Every tool call flows through the
  policy engine (`src/core/policy.ts`). Tools cannot execute consequential
  actions by any path that bypasses it.
- **Consequential actions require approval by default.** Spend, external
  communications, and mutating/system tools are gated behind human approval
  (`requiresApproval`). Nothing destructive runs autonomously.
- **Spend caps.** Spend-category tools are bounded by configurable caps
  checked against the spend ledger before execution.
- **Audit trail.** Policy decisions, approvals, spend, and the full event
  stream are persisted to SQLite and emitted to the dashboard.

These properties hold **within the trust boundary** of a single operator
running the control plane locally.

## What it does NOT have (the trust boundary)

Do **not** deploy this control plane where it is reachable by anyone you do
not fully trust. The current design has:

- **No authentication or authorization** on the REST/WebSocket API. Anyone
  who can reach the port can list/submit tasks, read events, and — critically
  — **approve any pending gate**, including spend and external-comms actions.
- **No rate limiting** on task submission or tool execution.
- **No transport security** (plain HTTP/WS, no TLS).
- **No PII handling, retention, or redaction controls.** Agent memory and
  the event store persist whatever is passed into tasks.
- **No isolation between tenants** beyond the `tenantId` field, which is not
  enforced as a security boundary.
- **Live LLM calls are non-deterministic.** Agents reason via a third-party
  model; outputs are not constrained beyond the tool/permission surface.

The **simulation-first** default (no API key set) keeps all behavior local and
offline, which is the safe mode for exploration.

## Recommended hardening before any shared deployment

If you ever intend to run this beyond a single trusted machine, at minimum:

1. Put the control plane behind **authenticated TLS** (reverse proxy + identity).
2. Bind the server to **localhost** or a private network only.
3. Add **authorization** so only designated operators can reach
   `POST /api/approvals/:id/decide` and `POST /api/tasks`.
4. Add **rate limits** and per-tenant **spend ceilings** enforced server-side.
5. Run spend/comms tools against **sandboxed** providers, never real billing
   or messaging systems, until the flow is fully reviewed.
6. Treat agent memory and the event store as **sensitive** (PII-class).

## Reporting a vulnerability

Found a security issue in the policy engine, tool registry, approval flow, or
any boundary that lets a gated action execute without authorization?

- **Do not** open a public GitHub issue.
- Email the maintainer via the email listed on the
  [SafetyMP GitHub profile](https://github.com/SafetyMP), or open a
  [GitHub Security Advisory](https://github.com/SafetyMP/CorpOS/security/advisories/new)
  using **"Report a vulnerability"**.
- Please include: the affected file/path, a minimal reproduction, and the
  impact (e.g. "approval gate bypassed for `billing.issue_refund`").

Reports are appreciated and will be acknowledged. This is a reference
architecture, so fixes are best-effort and advisory rather than SLA-bound.

## Scope

In scope: the authorization chokepoint, the approval workflow, the tool
permission model, the spend ledger, and anything that lets a gated action run
without the intended human sign-off.

Out of scope: general hardening already documented above as missing
(auth/rate-limiting/TLS) — these are known limitations of the reference
design, not undisclosed vulnerabilities.
