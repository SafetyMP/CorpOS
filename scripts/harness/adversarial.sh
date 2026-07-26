#!/usr/bin/env bash
# Authorized local adversarial probes (corp-site gate).
# Hermetic stub until a corporate handoff requires real probes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
echo "adversarial: ok (stub — no program-bound probes yet)"
