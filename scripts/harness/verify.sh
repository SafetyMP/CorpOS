#!/usr/bin/env bash
# Definition of Done — mirrors CI (build, typecheck, test, lint, format, stack guards).
# Supply-chain: lockfile install, enforceable allowScripts (npm >= 11.16), no verify-time
# package-manager download via npx, no unconditional node_modules wipe.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

LOCK_DIR="${ROOT}/.corp-harness/verify.lock"
LOCK_WAIT_SECONDS="${CORPOS_VERIFY_LOCK_WAIT_SECONDS:-600}"
VERIFY_LOCK_HELD=""
# Populated by resolve_npm — prefer `corepack npm` so setup-node's npm 10 is not used.
NPM=(npm)

cleanup_lock() {
  if [[ -n "${VERIFY_LOCK_HELD}" ]]; then
    rmdir "${LOCK_DIR}" 2>/dev/null || true
  fi
}
trap cleanup_lock EXIT INT TERM

acquire_lock() {
  mkdir -p "${ROOT}/.corp-harness"
  local waited=0
  while ! mkdir "${LOCK_DIR}" 2>/dev/null; do
    if (( waited >= LOCK_WAIT_SECONDS )); then
      echo "verify: timed out waiting for ${LOCK_DIR} (another verify is running)" >&2
      exit 1
    fi
    echo "verify: waiting for lock (${waited}s)..."
    sleep 2
    waited=$((waited + 2))
  done
  VERIFY_LOCK_HELD=1
}

resolve_npm() {
  # GitHub setup-node ships npm 10 as a real binary; corepack prepare does not
  # replace it on PATH. Always invoke the pin through `corepack npm` when present.
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare npm@11.17.0 --activate
    NPM=(corepack npm)
  elif command -v npm >/dev/null 2>&1; then
    NPM=(npm)
  else
    echo "verify: npm/corepack not on PATH" >&2
    exit 1
  fi
  local ver major
  ver="$("${NPM[@]}" -v)"
  major="$(printf '%s' "${ver}" | cut -d. -f1)"
  if (( major < 11 )); then
    echo "verify: npm ${ver} is too old; need >= 11.16 for allowScripts / strict-allow-scripts" >&2
    echo "verify: enable Corepack (packageManager npm@11.17.0) and retry" >&2
    exit 1
  fi
  echo "verify: using npm ${ver} via ${NPM[*]}"
}

clean_install_tree() {
  echo "==> clean node_modules"
  rm -rf "${ROOT}/node_modules"
  shopt -s nullglob
  local d
  for d in "${ROOT}/apps"/*/node_modules "${ROOT}/packages"/*/node_modules; do
    rm -rf "${d}"
  done
  shopt -u nullglob
}

install_deps() {
  echo "==> npm ci (lockfile + devDependencies)"
  # Host NODE_ENV=production would omit typescript/vitest/eslint.
  if ! env -u NODE_ENV "${NPM[@]}" ci --include=dev; then
    echo "verify: npm ci failed; cleaning tree and retrying once" >&2
    clean_install_tree
    env -u NODE_ENV "${NPM[@]}" ci --include=dev
  fi
}

ensure_tsc_bin() {
  local ts_bin="${ROOT}/node_modules/typescript/bin/tsc"
  if [[ ! -f "${ts_bin}" ]]; then
    echo "verify: typescript missing after install (devDependency failed)" >&2
    exit 1
  fi
  mkdir -p "${ROOT}/node_modules/.bin"
  if [[ ! -e "${ROOT}/node_modules/.bin/tsc" ]]; then
    ln -sfn "../typescript/bin/tsc" "${ROOT}/node_modules/.bin/tsc"
  fi
  if [[ ! -e "${ROOT}/node_modules/.bin/tsserver" ]]; then
    ln -sfn "../typescript/bin/tsserver" "${ROOT}/node_modules/.bin/tsserver"
  fi
  export PATH="${ROOT}/node_modules/.bin:${PATH}"
  if ! command -v tsc >/dev/null 2>&1; then
    echo "verify: tsc not on PATH after install" >&2
    exit 1
  fi
}

check_typescript_lock_bind() {
  python3 - <<'PY'
import json, re, sys
from pathlib import Path

lock = json.loads(Path("package-lock.json").read_text())
entry = lock.get("packages", {}).get("node_modules/typescript")
if not entry:
    print("verify: typescript missing from package-lock.json", file=sys.stderr)
    sys.exit(1)
expected = entry["integrity"]
version = entry["version"]
installed = json.loads(Path("node_modules/typescript/package.json").read_text()).get("version")
if installed != version:
    print(f"verify: typescript version mismatch installed={installed} lock={version}", file=sys.stderr)
    sys.exit(1)
if not re.fullmatch(r"sha512-[A-Za-z0-9+/=]+", expected):
    print(f"verify: unexpected typescript integrity field: {expected}", file=sys.stderr)
    sys.exit(1)
print(f"verify: typescript@{version} lock bind ok")
PY
}

check_allow_scripts() {
  # Fail if any install-script package is outside package.json allowScripts.
  if ! "${NPM[@]}" approve-scripts --allow-scripts-pending --json >/tmp/corpos-allow-scripts.json 2>/tmp/corpos-allow-scripts.err; then
    if ! "${NPM[@]}" approve-scripts --allow-scripts-pending >/tmp/corpos-allow-scripts.txt 2>/tmp/corpos-allow-scripts.err; then
      cat /tmp/corpos-allow-scripts.err >&2 || true
      echo "verify: npm approve-scripts failed (is npm >= 11.16?)" >&2
      exit 1
    fi
    if grep -Eiq 'No packages with unreviewed' /tmp/corpos-allow-scripts.txt; then
      return 0
    fi
    if grep -Eq '[[:alnum:]]' /tmp/corpos-allow-scripts.txt; then
      echo "verify: pending install scripts not covered by allowScripts:" >&2
      cat /tmp/corpos-allow-scripts.txt >&2
      exit 1
    fi
    return 0
  fi
  python3 - <<'PY'
import json, sys
from pathlib import Path
raw = Path("/tmp/corpos-allow-scripts.json").read_text().strip()
if not raw:
    sys.exit(0)
data = json.loads(raw)
pending = data
if isinstance(data, dict):
    # npm 11.17: --allow-scripts-pending --json -> {"allowScripts": [...pending]}
    pending = (
        data.get("pending")
        or data.get("packages")
        or data.get("allowScriptsPending")
        or data.get("allowScripts")
        or []
    )
if pending:
    print("verify: pending install scripts not covered by allowScripts:", file=sys.stderr)
    print(json.dumps(pending, indent=2), file=sys.stderr)
    sys.exit(1)
PY
}

# Mandatory stub canary (digest-bound companion under scripts/harness).
CANARY="./scripts/harness/check-stub-canary.sh"
if [[ ! -x "${CANARY}" ]]; then
  echo "verify: missing executable ${CANARY}" >&2
  exit 1
fi
"${CANARY}"

acquire_lock
resolve_npm

if [[ "${CORPOS_VERIFY_CLEAN:-}" == "1" ]]; then
  clean_install_tree
  install_deps
elif [[ ! -f "${ROOT}/node_modules/typescript/bin/tsc" ]]; then
  install_deps
elif [[ ! -e "${ROOT}/node_modules/.bin/tsc" ]]; then
  install_deps
else
  echo "==> reuse node_modules (set CORPOS_VERIFY_CLEAN=1 to force npm ci)"
fi

ensure_tsc_bin
check_typescript_lock_bind
check_allow_scripts

echo "==> build"
"${NPM[@]}" run build

echo "==> typecheck + test + lint + format"
"${NPM[@]}" run typecheck
"${NPM[@]}" run test
"${NPM[@]}" run lint
"${NPM[@]}" run format:check

# Stack guardrails (grep — rg is not on GitHub-hosted runners by default)
if grep -REn "from ['\"]express['\"]|require\\(['\"]express['\"]\\)" apps packages \
  --exclude-dir=node_modules --exclude-dir=dist >/dev/null 2>&1; then
  echo "verify: Express import forbidden" >&2
  exit 1
fi
if grep -En "better-sqlite3" package.json packages/*/package.json apps/*/package.json >/dev/null 2>&1; then
  echo "verify: better-sqlite3 forbidden" >&2
  exit 1
fi

echo "==> pedagogy (slate console, timeline, demo.gif)"
if ! grep -Fq -- '--accent: #2f8f9a' apps/console/src/styles.css; then
  echo "verify: expected restrained teal accent in console styles" >&2
  exit 1
fi
if grep -Fq -- '--accent: #c4f542' apps/console/src/styles.css; then
  echo "verify: neon lime accent forbidden" >&2
  exit 1
fi
if ! grep -Eq 'data-company-day|class="timeline"|data-timeline-kind' apps/console/src/main.tsx; then
  echo "verify: company-day activity timeline missing from console" >&2
  exit 1
fi
if grep -Eq 'JSON\.stringify\(day' apps/console/src/main.tsx; then
  echo "verify: raw JSON dump must not be primary company-day surface" >&2
  exit 1
fi
if [[ ! -f docs/assets/demo.gif ]]; then
  echo "verify: docs/assets/demo.gif missing" >&2
  exit 1
fi
if ! grep -Fq '"screenshots"' package.json; then
  echo "verify: npm run screenshots script missing" >&2
  exit 1
fi
if [[ ! -f docs/future-of-the-firm.md ]] \
  || ! grep -Eiq 'timeline|Run company day' docs/future-of-the-firm.md README.md; then
  echo "verify: pedagogy docs must mention company day / timeline" >&2
  exit 1
fi

echo "verify: ok"
