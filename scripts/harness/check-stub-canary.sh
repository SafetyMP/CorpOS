#!/usr/bin/env bash
# DO_NOT_DELETE_STUB_CANARY — fail closed if harness verify is missing or trivial.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

VERIFY_HARNESS="scripts/harness/verify.sh"
VERIFY_WRAPPER="scripts/verify.sh"

fail() {
  echo "STUB_CANARY: $*" >&2
  exit 1
}

[[ -f "${VERIFY_HARNESS}" ]] || fail "missing ${VERIFY_HARNESS}"
[[ -x "${VERIFY_HARNESS}" ]] || fail "${VERIFY_HARNESS} is not executable"

for candidate in "${VERIFY_HARNESS}" "${VERIFY_WRAPPER}"; do
  if [[ -f "${candidate}" ]] && grep -Fq 'TODO: add real test' "${candidate}"; then
    fail "placeholder verify in ${candidate}"
  fi
done

bytes="$(wc -c < "${VERIFY_HARNESS}" | tr -d ' ')"
if (( bytes < 1500 )); then
  fail "${VERIFY_HARNESS} too small (${bytes} bytes); expected real DoD script"
fi

# Reject a near-empty "exit 0" verify (no DoD stages).
line_count="$(grep -Ev '^[[:space:]]*(#|$)' "${VERIFY_HARNESS}" | wc -l | tr -d ' ')"
if (( line_count < 20 )); then
  fail "${VERIFY_HARNESS} has too few non-comment lines (${line_count})"
fi

for stage in 'run build' 'typecheck' 'run test' 'run lint' 'format:check'; do
  if ! grep -Fq "${stage}" "${VERIFY_HARNESS}"; then
    fail "${VERIFY_HARNESS} missing required stage: ${stage}"
  fi
done

echo "check-stub-canary: ok"
