#!/usr/bin/env bash
# Definition of Done — mirrors CI lint + build matrix jobs (no Docker).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
  corepack prepare npm@10.9.2 --activate >/dev/null 2>&1 || true
fi

echo "==> npm ci (expect packageManager npm@10.9.2)"
npm ci

echo "==> typecheck + test + lint + format"
npm run typecheck
npm run test
npm run lint
npm run format:check

echo "verify: ok (ci/web parity)"
