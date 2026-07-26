# Governance crosswalk (July 2026)

Pedagogical mapping only — **not** a certification claim.

## NIST AI RMF

| Function | CorpOS control |
| --- | --- |
| GOVERN | ToolGateway PEP + Rego-shaped three-layer PDP (`strict` default; `audit` via env/API) |
| MAP | `docs/aibom.json` inventory of agents, models, tools, MCP servers |
| MEASURE | OTel GenAI spans (`invoke_agent`, `execute_tool`, `chat`) + trust ledger |
| MANAGE | Exception HITL, kill switch, compensators, capital caps, appeal (G6) |

## Firm governance labels (G1–G6)

| Label | Status in this reference |
| --- | --- |
| **G1** membership / agent `active` | Implemented |
| **G2** deliberation trail | Implemented |
| **G3** quorum N-of-M for L4+ | Implemented |
| **G4** dissent on reject | Implemented |
| **G5** decision transparency | Implemented |
| **G6** appeal / escalation | Implemented |

## OWASP Top 10 for Agentic Applications 2026

See Governor `/api/governance` and `scripts/harness/adversarial-run.mjs` ASI cells.

## Related standards

- ISO/IEC 42001 / EU AI Act Art. 50: transparency records via Governor + audit chain
- MCP 2025-11-25: elicitation-aligned privileged flows via exception queue; shared demo uses Bearer token
- OTel GenAI semantic conventions (Development): span attributes `gen_ai.*`; optional OTLP export
