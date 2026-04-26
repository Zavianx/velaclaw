#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

log_step() {
  printf '\n==> %s\n' "$*"
}

run_step() {
  log_step "$*"
  "$@"
}

run_protocol_ci_mirror() {
  local targets=(
    "dist/protocol.schema.json"
  )
  local before after
  before="$(git diff --no-ext-diff -- "${targets[@]}" || true)"

  run_step pnpm protocol:gen

  after="$(git diff --no-ext-diff -- "${targets[@]}" || true)"
  if [[ "$before" != "$after" ]]; then
    echo "Protocol generation changed tracked outputs beyond the pre-run worktree." >&2
    echo "Refresh generated protocol files and include the updated outputs before pushing." >&2
    git --no-pager diff -- "${targets[@]}"
    return 1
  fi
}

run_linux_ci_mirror() {
  run_step pnpm check
  run_step pnpm build:strict-smoke
  run_step pnpm lint:ui:no-raw-window-open
  run_protocol_ci_mirror
  run_step pnpm canvas:a2ui:bundle
  run_step node scripts/run-vitest.mjs run --config test/vitest/vitest.extensions.config.ts --maxWorkers=1
  run_step env CI=true node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts --maxWorkers=1

  log_step "VELACLAW_VITEST_MAX_WORKERS=${VELACLAW_VITEST_MAX_WORKERS:-1} NODE_OPTIONS=${NODE_OPTIONS:---max-old-space-size=6144} pnpm test"
  VELACLAW_VITEST_MAX_WORKERS="${VELACLAW_VITEST_MAX_WORKERS:-1}" \
  NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}" \
    pnpm test
}

main() {
  run_linux_ci_mirror
}

main "$@"
