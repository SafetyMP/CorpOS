# CorpOS

> An autonomous company operating system — a TypeScript multi-agent runtime with a policy, approval, and audit control plane.

Department "agents" (support, sales, ops, finance, engineering) reason via an LLM, call permissioned tools, and coordinate through a shared orchestrator. **Every consequential action is policy-gated**: spend, external comms, and mutations route through an approval engine and produce audit events. Nothing destructive runs autonomously.

The system is **simulation-first**: the full multi-agent loop, tool-calling, approval gates, spend tracking, and dashboard are demonstrable and tested end-to-end with **no LLM key and no network**. Plug in an OpenRouter key to switch the agents to live reasoning.

---

## Highlights

- **Reasoning loop** — agents reason → call tools → observe results → repeat, with a step cap and a conversation-preserving pause/resume across approval gates.
- **Policy engine** — allow / deny / approve decisions, glob-matched rules, per-task spend caps, and human approval gates. The single chokepoint for every consequential action.
- **Typed tool registry** — JSON-schema-validated tools with a permission model (`read` / `write` / `spend` / `communicate` / `system` / `delegate`).
- **Control plane** — Express REST + WebSocket API, and a real-time dashboard (live task board, agent statuses, pending approvals with one-click Approve/Reject, spend meter, color-coded event feed).
- **One-click demo** — a curated 5-agent scenario that auto-plays the full policy-gated loop.
- **Deterministic by default** — the `SimulationProvider` returns scripted, per-agent responses so the whole system is reproducible without a key.
- **Live when you want it** — OpenRouter (Owl Alpha) via its OpenAI-compatible endpoint; Z.AI / OpenAI also supported.

## Architecture

```
┌─────────────────────────── Control plane (src/api) ───────────────────────────┐
│  Express REST (tasks, agents, approvals, spend, events) · WebSocket · dashboard │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       │
┌─────────────────────────────── Orchestrator (src/core) ───────────────────────┐
│  lifecycle · dispatch · concurrency · retries · approval resume                │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       │
            ┌──────────────────────────┼───────────────────────────┐
            ▼                          ▼                           ▼
       Agent (loop)              Policy engine                Tool registry
   reason → tool → observe      allow / deny / approve       typed, JSON-schema,
   pause/resume on gates        spend caps, approvals         permission-gated
            │                          │                           │
            └────────────── LLM provider ──────────── Store (SQLite) ─┘
                  Simulation (default)         tasks · events · approvals
                  OpenRouter / Z.AI / OpenAI   spend · memory · audit
```

- **Runtime** (`src/core/`): `types`, `llm`, `logger`(+audit), `event-bus`, `store` (SQLite via better-sqlite3), `tool`, `tool-builder`, `policy`, `memory`, `agent`, `orchestrator`, `app` (composition root).
- **Agents** (`src/agents/`): one file per department; each declares a system prompt and a tool subset.
- **Tools** (`src/tools/`): CRM, comms, billing, knowledge, system packs over a shared seeded data layer, plus an agent-to-agent `delegate` tool.
- **Control plane** (`src/api/`, `src/dashboard/`): REST + WebSocket server and the static dashboard.

## Quick start

```bash
npm install
npm run dev        # boot the server + dashboard on $PORT or 3000
```

Open `http://localhost:3000/` (or your `$PORT`). With no key set, agents run in **simulation** — click **▶ Run demo** to watch a curated 5-agent scenario auto-play through real approval gates.

### Go live (OpenRouter / Owl Alpha)

```bash
cp .env.example .env
# edit .env:
#   OPENROUTER_API_KEY=sk-or-...
#   OPENROUTER_MODEL=<your Owl Alpha slug>
npm run dev
```

The header badge flips from `simulation` to `live · openrouter`, and agents reason against the real model. Demo mode drives genuine reasoning through all five agents.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Boot API + dashboard (tsx watch) |
| `npm run scenario` | Run a recorded deterministic multi-agent scenario |
| `npm test` | Run the vitest suite (deterministic, no network) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Compile to `dist/` |

## How an action gets approved

1. A task is enqueued; the orchestrator assigns it to an agent.
2. The agent reasons and emits tool calls. Each call is evaluated by the **policy engine**.
3. A `read` call runs; a `spend` / `communicate` / mutating call **pauses** and creates a pending approval.
4. A human approves via the dashboard or `POST /api/approvals/:id/decide`.
5. On approval the agent **resumes from where it paused** (conversation preserved), executes the action, records spend, and produces a final summary — all audited.

### REST API (selected)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness + provider mode |
| `GET` | `/api/agents` | Registered agents + tools |
| `GET` / `POST` | `/api/tasks` | List / submit tasks |
| `GET` | `/api/approvals` | Pending approvals |
| `POST` | `/api/approvals/:id/decide` | `{decision:"approved"\|"rejected", by}` |
| `GET` | `/api/spend` | Spend ledger totals |
| `GET` | `/api/events?limit=50` | Recent events |
| `WS` | `/ws` | Live snapshot + event stream |

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Refund for Ada","description":"ada@example.com wants a $49 refund on sub_ada_pro.","assignedTo":"agent_support","priority":2}'
```

## Configuration

Environment variables (load via a `.env` file — auto-loaded on boot, see `.env.example`):

| Var | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Live OpenRouter key. Unset → simulation mode. |
| `OPENROUTER_MODEL` | `openrouter/owl-alpha` | Model slug. |
| `OPENROUTER_REFERER` / `OPENROUTER_TITLE` | — | OpenRouter attribution headers. |
| `OPENAI_API_KEY` / `ZAI_API_KEY` | — | Alternative providers (auto-detected). |
| `PORT` | `3000` | HTTP port. |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error`. |

Never commit a real `.env` (it's gitignored).

## Project structure

```
src/
  core/         runtime: types, llm, store, tool, policy, memory, agent, orchestrator, app
  agents/       department agents (support, sales, finance, ops, engineer)
  tools/        tool packs (crm, comms, billing, knowledge, system, delegate) + seeded state
  api/          Express REST + WebSocket server
  dashboard/    static dashboard (single-file HTML/CSS/JS)
  index.ts      composition root — wires core + agents + tools + server, loads .env
  scenario.ts   deterministic multi-agent demo
test/           vitest unit + e2e (deterministic via SimulationProvider)
```

## Tech stack

TypeScript (ESM, strict) · Node ≥ 20 · better-sqlite3 · Express · ws · zod · nanoid · vitest · tsx. Dashboard is dependency-free vanilla HTML/CSS/JS.

## Development notes

- The reasoning loop is non-deterministic under a live LLM; deterministic tests rely on `SimulationProvider` scripts and run without network.
- SQLite (`data/company.db`) is created at runtime and gitignored.
- `AGENTS.md` and `CONTEXT.md` carry agent-assisted development guidance and project context; `.kilo/` holds the associated Kilo tooling (commands, skills, run-scripts). None of these affect runtime.

## Safety posture

This is a research/demo project, **not production-hardened**. Consequential actions are policy-gated by design, but there are no authn/authz, rate limits, or PII controls on the API. Do not expose the control plane to untrusted networks, and review every approval before going live against real systems.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). Copyright © 2026 SafetyMP.
