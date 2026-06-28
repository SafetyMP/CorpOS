#!/usr/bin/env sh
# Shared ecosystem detection for setup-script and run-script so the
# install path and run path can't drift. Source this file, then call
# `detect_stack` which echoes a single token to stdout.
detect_stack() {
  if [ -f pnpm-lock.yaml ]; then echo pnpm
  elif [ -f yarn.lock ]; then echo yarn
  elif [ -f bun.lockb ] || [ -f bun.lock ]; then echo bun
  elif [ -f package.json ]; then echo npm
  elif [ -f uv.lock ]; then echo uv
  elif [ -f poetry.lock ]; then echo poetry
  elif [ -f requirements.txt ]; then echo pip
  elif [ -f go.mod ]; then echo go
  elif [ -f Cargo.toml ]; then echo cargo
  else echo none
  fi
}
