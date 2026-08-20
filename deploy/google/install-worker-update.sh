#!/usr/bin/env bash
set -euo pipefail

readonly APP_DIR="/opt/maat"
readonly WORKER_DIR="${APP_DIR}/worker"
readonly STATE_DIR="/var/lib/maat-worker"
readonly SERVICE_NAME="maat-worker.service"
readonly SAFE_PATH="/usr/local/bin:/usr/bin:/bin"

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' "Run this script as root." >&2
  exit 1
fi

if [[ "$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || true)" != "inactive" ]]; then
  printf '%s must be inactive before an update.\n' "${SERVICE_NAME}" >&2
  exit 1
fi

restore_root_ownership() {
  chown --recursive root:root "${WORKER_DIR}"
}

trap restore_root_ownership EXIT
chown --recursive maat:maat "${WORKER_DIR}"

runuser --user maat -- env HOME="${STATE_DIR}" PATH="${SAFE_PATH}" \
  npm --prefix "${WORKER_DIR}" ci --no-audit --no-fund
runuser --user maat -- env HOME="${STATE_DIR}" PATH="${SAFE_PATH}" \
  npm --prefix "${WORKER_DIR}" run check
runuser --user maat -- env HOME="${STATE_DIR}" PATH="${SAFE_PATH}" \
  npm --prefix "${WORKER_DIR}" test
runuser --user maat -- env HOME="${STATE_DIR}" PATH="${SAFE_PATH}" \
  npm --prefix "${WORKER_DIR}" run build

restore_root_ownership
trap - EXIT

node --check "${WORKER_DIR}/dist/watchSettlements.js"
systemd-analyze verify "/etc/systemd/system/${SERVICE_NAME}"

unsafe_path="$(
  find "${WORKER_DIR}" -xdev \
    \( -type f -o -type d \) \
    -perm /022 \
    -print \
    -quit
)"
if [[ -n "${unsafe_path}" ]]; then
  printf 'Deployed worker path is group- or world-writable: %s\n' "${unsafe_path}" >&2
  exit 1
fi

printf '%s\n' "Worker update installed and verified while service remains stopped."
