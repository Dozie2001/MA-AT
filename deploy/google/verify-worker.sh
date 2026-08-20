#!/usr/bin/env bash
set -euo pipefail

readonly APP_DIR="/opt/maat"
readonly WORKER_DIR="${APP_DIR}/worker"
readonly STATE_DIR="/var/lib/maat-worker"
readonly SAFE_PATH="/usr/local/bin:/usr/bin:/bin"

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' "Run this script as root." >&2
  exit 1
fi

runuser --user maat -- env HOME="${STATE_DIR}" PATH="${SAFE_PATH}" npm --prefix "${WORKER_DIR}" run check
runuser --user maat -- env HOME="${STATE_DIR}" PATH="${SAFE_PATH}" npm --prefix "${WORKER_DIR}" test
runuser --user maat -- env HOME="${STATE_DIR}" PATH="${SAFE_PATH}" node --check "${WORKER_DIR}/dist/watchSettlements.js"

git -C "${APP_DIR}" diff --exit-code -- worker

unsafe_path="$(find "${WORKER_DIR}" -xdev -perm /022 -print -quit)"
if [[ -n "${unsafe_path}" ]]; then
  printf 'Deployed worker path is group- or world-writable: %s\n' "${unsafe_path}" >&2
  exit 1
fi

printf '%s\n' "Worker verification completed successfully."
