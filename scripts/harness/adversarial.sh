#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Probe logic lives in digest-bound scripts/harness/adversarial-run.mjs
PROBE="./scripts/harness/adversarial-run.mjs"
if [[ ! -f "${PROBE}" ]]; then
  echo "adversarial: missing ${PROBE}" >&2
  exit 1
fi
node "${PROBE}"
