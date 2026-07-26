# Future of the Firm

CorpOS is a **reference implementation of an autonomous company**. The thesis:

> Autonomy is an organizational design problem. Future companies are policy + authority + capital + trust + exception queues — not chatbots with tools.

## Three layers

1. **Firm model** — org graph, owners, department capital, SLAs, exception queues.
2. **Work model** — work contracts, handoffs with obligations, draft→settle, compensating actions.
3. **Control plane** — MCP-gated tools, fail-closed risk ladder, durable HITL, kill/budgets, run traces.

Humans govern **by exception**. Autonomy is **earned** from evidence (trust ledger), not granted in prompts.

## 20-minute path

1. `npm install && npm run build && npm run dev`
2. Open the ops console; click **Run company day**
3. Watch handoffs, one autonomous settle, one exception, trust unlock
4. Optionally open Governor view / run `npm run audit:verify`

## Stack appendix

Node 22+ · TypeScript · npm workspaces · Hono · Drizzle + libsql · official MCP TypeScript SDK · Vite + Preact · custom agent loop · SimulationProvider CI.

Rejected for this reference: Temporal, Next.js, agent frameworks as core, `better-sqlite3`, Python rewrite.
