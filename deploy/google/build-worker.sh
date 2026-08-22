#!/usr/bin/env bash
set -euo pipefail

readonly APP_DIR="/opt/maat"
readonly WORKER_DIR="${APP_DIR}/worker"
readonly STATE_DIR="/var/lib/maat-worker"

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' "Run this script as root." >&2
  exit 1
fi

restore_root_ownership() {
  chown --recursive root:root "${WORKER_DIR}"
}

trap restore_root_ownership EXIT
chown --recursive maat:maat "${WORKER_DIR}"

runuser \
  --user maat \
  -- \
  env \
  HOME="${STATE_DIR}" \
  PATH="/usr/local/bin:/usr/bin:/bin" \
  npm \
  --prefix "${WORKER_DIR}" \
  ci \
  --no-audit \
  --no-fund

runuser --user maat -- env HOME="${STATE_DIR}" PATH="/usr/local/bin:/usr/bin:/bin" npm --prefix "${WORKER_DIR}" run check
runuser --user maat -- env HOME="${STATE_DIR}" PATH="/usr/local/bin:/usr/bin:/bin" npm --prefix "${WORKER_DIR}" test
runuser --user maat -- env HOME="${STATE_DIR}" PATH="/usr/local/bin:/usr/bin:/bin" npm --prefix "${WORKER_DIR}" run build

git -C "${APP_DIR}" diff --exit-code -- worker

printf '%s\n' "Worker dependencies, checks, tests, and build completed successfully."
