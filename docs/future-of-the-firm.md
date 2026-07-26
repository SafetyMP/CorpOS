# Future of the Firm

CorpOS is a **reference implementation of an autonomous company**. The thesis:

> Autonomy is an organizational design problem. Future companies are policy + authority + capital + trust + exception queues + **community governance** — not chatbots with tools.

## Four layers

1. **Firm model** — org graph, membership (G1), owners, department capital, SLAs, exception queues with dissent (G4) and quorum hooks (G3).
2. **Work model** — work contracts, handoffs with delegation envelopes, draft→settle, compensating actions, orchestrator pause/resume.
3. **Control plane** — MCP-gated tools, fail-closed risk ladder, durable HITL, kill/budgets, run traces.
4. **Governance plane** — PEP (ToolGateway) + Rego-shaped PDP, three-layer authz (agent→tool, agent→agent, originator→resource), OTel GenAI spans, AIBOM, OWASP ASI / NIST AI RMF crosswalk.

Interop protocols (MCP, optional A2A later) are **transport**. They do not encode community governance — CorpOS does.

Humans govern **by exception** in the ops console (Approve / Reject / Kill). Autonomy is **earned** from evidence (trust ledger), not granted in prompts.

## 20-minute path

1. `npm install && npm run build && npm run dev`
2. Open the ops console; click **Run company day** (mutates the same firm Capital/Trust/Contracts show)
3. Watch the activity timeline; use Exception queue Approve/Reject; toggle Kill if needed
4. Open Governor for ASI/NIST/AIBOM; run `npm run audit:verify`

## Providers

- **Simulation** (default): deterministic CI and demos
- **Live**: `CORPOS_ALLOW_LIVE=1` + `OPENROUTER_API_KEY` wires `HttpLLMProvider`; health `mode` is `live` only then

## Stack appendix

Node 22+ · TypeScript · npm workspaces · Hono · Drizzle + libsql · official MCP TypeScript SDK · Vite + Preact · custom agent loop · SimulationProvider CI · OTel GenAI attribute spans.

Rejected for this reference: Temporal, Next.js, agent frameworks as core, `better-sqlite3`, Python rewrite, Microsoft AGT as a hard dependency.
