# AGENTS.md

CorpOS harness. Profile: **solo**.

## Purpose

TypeScript multi-agent runtime with policy, approval, and audit control plane. Simulation-first demo; optional live LLM via OpenRouter.

## Prerequisites

- Node.js ≥20 (`package.json` engines)
- `npm install` (builds `better-sqlite3` native module)

## Commands

| Command               | Purpose                         |
| --------------------- | ------------------------------- |
| `./scripts/verify.sh` | Definition of Done              |
| `npm install`         | Install dependencies            |
| `npm run dev`         | API + dashboard with hot reload |
| `npm run start`       | Run without watch               |
| `npm run test`        | Vitest suite                    |
| `npm run typecheck`   | `tsc --noEmit`                  |
| `npm run lint`        | ESLint                          |
| `npm run build`       | Compile to `dist/`              |

## Layout

| Path             | Role                                                      |
| ---------------- | --------------------------------------------------------- |
| `src/core/`      | Orchestrator, policy, store (SQLite at `data/company.db`) |
| `src/agents/`    | Department agents                                         |
| `src/tools/`     | Permissioned tool registry                                |
| `src/api/`       | Express REST + WebSocket                                  |
| `src/dashboard/` | Control-plane UI                                          |

## Definition of Done

```bash
./scripts/verify.sh
```

## Review focus

Block on P0/P1: policy chokepoint bypass, approval gate skips, secret exposure, broken simulation determinism.
