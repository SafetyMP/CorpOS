# Governance crosswalk (July 2026)

Pedagogical mapping only — **not** a certification claim.

## NIST AI RMF

| Function | CorpOS control |
| --- | --- |
| GOVERN | ToolGateway PEP + Rego-shaped three-layer PDP; enforcement modes strict/audit |
| MAP | `docs/aibom.json` inventory of agents, models, tools, MCP servers |
| MEASURE | OTel GenAI spans (`invoke_agent`, `execute_tool`, `chat`) + trust ledger |
| MANAGE | Exception HITL, kill switch, compensators, capital caps |

## OWASP Top 10 for Agentic Applications 2026

See Governor `/api/governance` and `scripts/harness/adversarial-run.mjs` ASI cells.

## Related standards

- ISO/IEC 42001 / EU AI Act Art. 50: transparency records via Governor + audit chain
- MCP 2025-11-25: tool HITL UX, OAuth-ready shared mode token
- OTel GenAI semantic conventions (Development): span attributes `gen_ai.*`
