#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -x ./scripts/check-stub-canary.sh ]]; then
  ./scripts/check-stub-canary.sh
fi

if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
  corepack prepare npm@10.9.2 --activate >/dev/null 2>&1 || true
fi

echo "==> npm ci"
env -u NODE_ENV npm ci --include=dev
export PATH="${ROOT}/node_modules/.bin:${PATH}"

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

echo "==> pedagogy (slate console, timeline, demo.gif)"
if ! rg -q -- '--accent: #2f8f9a' apps/console/src/styles.css; then
  echo "verify: expected restrained teal accent in console styles" >&2
  exit 1
fi
if rg -q -- '--accent: #c4f542' apps/console/src/styles.css; then
  echo "verify: neon lime accent forbidden" >&2
  exit 1
fi
if ! rg -q 'data-company-day|class="timeline"|data-timeline-kind' apps/console/src/main.tsx; then
  echo "verify: company-day activity timeline missing from console" >&2
  exit 1
fi
if rg -q 'JSON\.stringify\(day' apps/console/src/main.tsx; then
  echo "verify: raw JSON dump must not be primary company-day surface" >&2
  exit 1
fi
if [[ ! -f docs/assets/demo.gif ]]; then
  echo "verify: docs/assets/demo.gif missing" >&2
  exit 1
fi
if ! rg -q '"screenshots"' package.json; then
  echo "verify: npm run screenshots script missing" >&2
  exit 1
fi
if [[ ! -f docs/future-of-the-firm.md ]] || ! rg -qi 'timeline|Run company day' docs/future-of-the-firm.md README.md; then
  echo "verify: pedagogy docs must mention company day / timeline" >&2
  exit 1
fi

echo "verify: ok"
