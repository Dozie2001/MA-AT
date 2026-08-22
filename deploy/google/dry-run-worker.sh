#!/usr/bin/env bash
set -euo pipefail

readonly SERVICE_NAME="maat-worker.service"
readonly ENV_FILE="/etc/maat-worker.env"

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' "Run this script as root." >&2
  exit 1
fi

systemd-analyze verify "/etc/systemd/system/${SERVICE_NAME}"
systemctl daemon-reload

active_state="$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || true)"
enabled_state="$(systemctl is-enabled "${SERVICE_NAME}" 2>/dev/null || true)"

if [[ "${active_state}" != "inactive" ]]; then
  printf 'Expected %s to be inactive, found %s.\n' "${SERVICE_NAME}" "${active_state}" >&2
  exit 1
fi

if [[ "${enabled_state}" != "disabled" ]]; then
  printf 'Expected %s to be disabled, found %s.\n' "${SERVICE_NAME}" "${enabled_state}" >&2
  exit 1
fi

env_count="$(grep --count '^[A-Z][A-Z0-9_]*=' "${ENV_FILE}")"
if [[ "${env_count}" != "18" ]]; then
  printf 'Expected 18 environment entries, found %s.\n' "${env_count}" >&2
  exit 1
fi

printf 'Permanent service: active=%s enabled=%s env_entries=%s\n' \
  "${active_state}" \
  "${enabled_state}" \
  "${env_count}"

systemd-run \
  --unit=maat-worker-dry-run \
  --wait \
  --pipe \
  --collect \
  --service-type=exec \
  --property=User=maat \
  --property=Group=maat \
  --property=WorkingDirectory=/opt/maat/worker \
  --property=EnvironmentFile="${ENV_FILE}" \
  --property=UMask=0077 \
  --property=NoNewPrivileges=true \
  --property=PrivateDevices=true \
  --property=PrivateTmp=true \
  --property=ProtectHome=true \
  --property=ProtectSystem=strict \
  --property=ReadWritePaths=/var/lib/maat-worker \
  /usr/local/bin/node \
  /opt/maat/worker/dist/watchSettlements.js \
  --once \
  --dry-run \
  --from-block \
  11508787 \
  --to-block \
  11508787
