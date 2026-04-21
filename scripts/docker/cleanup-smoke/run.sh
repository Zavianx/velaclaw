#!/usr/bin/env bash
set -euo pipefail

cd /repo

export VELACLAW_STATE_DIR="/tmp/velaclaw-test"
export VELACLAW_CONFIG_PATH="${VELACLAW_STATE_DIR}/velaclaw.json"

echo "==> Build"
if ! pnpm build >/tmp/velaclaw-cleanup-build.log 2>&1; then
  cat /tmp/velaclaw-cleanup-build.log
  exit 1
fi

echo "==> Seed state"
mkdir -p "${VELACLAW_STATE_DIR}/credentials"
mkdir -p "${VELACLAW_STATE_DIR}/agents/main/sessions"
echo '{}' >"${VELACLAW_CONFIG_PATH}"
echo 'creds' >"${VELACLAW_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${VELACLAW_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
if ! pnpm velaclaw reset --scope config+creds+sessions --yes --non-interactive >/tmp/velaclaw-cleanup-reset.log 2>&1; then
  cat /tmp/velaclaw-cleanup-reset.log
  exit 1
fi

test ! -f "${VELACLAW_CONFIG_PATH}"
test ! -d "${VELACLAW_STATE_DIR}/credentials"
test ! -d "${VELACLAW_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${VELACLAW_STATE_DIR}/credentials"
echo '{}' >"${VELACLAW_CONFIG_PATH}"

echo "==> Uninstall (state only)"
if ! pnpm velaclaw uninstall --state --yes --non-interactive >/tmp/velaclaw-cleanup-uninstall.log 2>&1; then
  cat /tmp/velaclaw-cleanup-uninstall.log
  exit 1
fi

test ! -d "${VELACLAW_STATE_DIR}"

echo "OK"
