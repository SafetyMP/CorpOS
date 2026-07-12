#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "Run npm install first" >&2
  exit 1
fi

echo "== verify: typecheck + test + lint =="
npm run typecheck
npm run test
npm run lint

echo "verify: ok"
