#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
  corepack prepare npm@10.9.2 --activate >/dev/null 2>&1 || true
fi

echo "==> npm ci"
npm ci

echo "==> build"
npm run build

echo "==> typecheck + test + lint + format"
npm run typecheck
npm run test
npm run lint
npm run format:check

# Guardrails
if rg -n "from ['\"]express['\"]|require\\(['\"]express['\"]\\)" apps packages --glob '!**/node_modules/**' >/dev/null 2>&1; then
  echo "verify: Express import forbidden" >&2
  exit 1
fi
if rg -n "better-sqlite3" package.json packages/*/package.json apps/*/package.json >/dev/null 2>&1; then
  echo "verify: better-sqlite3 forbidden" >&2
  exit 1
fi

echo "verify: ok"
