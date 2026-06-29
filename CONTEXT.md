# Project context — loaded into every agent session via `instructions` in kilo.jsonc.

# Keep this short and factual. It orients agents to THIS project specifically

# (unlike AGENTS.md, which states universal rules).

## What this project is

`CorpOS` — an autonomous company operating system: a TypeScript multi-agent
runtime plus a control plane (policy engine, approval gates, spend caps, audit,
REST/WebSocket API, dashboard). Department "agents" (support, sales, ops,
finance, engineering) reason via an LLM, call permissioned tools, and coordinate
through a shared orchestrator. Every consequential action is policy-gated.

## Architecture (in brief)

- **Runtime layer** (`src/core/`): `types`, `llm`, `logger`, `event-bus`, `store`
  (SQLite via better-sqlite3), `tool` (typed registry + permissions), `policy`
  (allow/deny/approve decisions + spend tracking), `memory`, `agent` (reasoning
  loop), `orchestrator` (lifecycle, dispatch, concurrency, retries), `app`
  (composition root).
- **Agents** (`src/agents/`): one file per department; each declares a system
  prompt, a tool subset, and owns its domain tools.
- **Tools** (`src/tools/`): CRM, comms, billing, knowledge, system packs.
  Every tool declares a `ToolPermission` (category + optional cost cap +
  `requiresApproval`).
- **Control plane** (`src/api/`): Express REST + WebSocket; serves the dashboard.

## Key conventions

- TypeScript, ESM (`"type": "module"`), strict. Node >= 20.
- 2-space indent, LF, no trailing whitespace (see `.editorconfig`).
- IDs via `nanoid`. JSON-schema for tool parameter validation; `zod` only where
  ergonomic.
- No comments unless genuinely necessary.
- Consequential tools (spend, external comms, mutating) MUST route through the
  policy engine and produce audit events. Nothing destructive runs autonomously.
- Agent reasoning loop is LLM-driven but fully reproducible under the
  `SimulationProvider` (scripted responses) — all tests run without network.

## Commands

- Install: `npm install`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Run server (API + dashboard): `npm run dev` (boots on `$PORT` or 3000)
- Run a recorded multi-agent scenario: `npm run scenario`
- Tests: `npm test` (vitest)

## LLM provider

Agents call **OpenRouter** via its OpenAI-compatible endpoint
(`https://openrouter.ai/api/v1`), model **Owl Alpha**, key from
`OPENROUTER_API_KEY` and slug from `OPENROUTER_MODEL` (default
`openrouter/owl-alpha` — set the real OpenRouter slug for Owl Alpha there).
Optional `OPENROUTER_REFERER` / `OPENROUTER_TITLE` set the OpenRouter
`HTTP-Referer` / `X-Title` headers. Z.AI and OpenAI remain supported as
alternatives (`provider: "zai"|"openai"`); the factory auto-detects by key.

**Gotcha: no key is set in this environment.** The system runs
**simulation-first** — the `SimulationProvider` returns scripted/tool-driven
responses so the full system is demonstrable and tested without network. Provide
`OPENROUTER_API_KEY` to switch the default agent provider to live OpenRouter.
Never log keys.

## Gotchas

- Do NOT edit `package-lock.json` directly (permission-denied by design); run
  `npm install` to change the lockfile.
- Agent Manager run-script derives a per-worktree `$PORT` from the worktree path;
  parallel worktrees bind different ports — read `$PORT`, don't hardcode 3000.
- SQLite file (`data/company.db`) is created at runtime; do not commit it.
- The reasoning loop is non-deterministic under a live LLM; deterministic tests
  rely on `SimulationProvider` scripts.
