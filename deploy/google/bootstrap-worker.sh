#!/usr/bin/env bash
set -euo pipefail

readonly NODE_VERSION="v24.19.0"
readonly NODE_SHA256="14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647"
readonly NODE_ARCHIVE="node-${NODE_VERSION}-linux-x64.tar.xz"
readonly NODE_DIR="/opt/node-${NODE_VERSION}-linux-x64"
readonly REPOSITORY="https://github.com/Dozie2001/MA-AT.git"
readonly REPOSITORY_COMMIT="6971b02b5a3c65621523dedd1bb92b7c17074406"
readonly APP_DIR="/opt/maat"
readonly STATE_DIR="/var/lib/maat-worker"

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' "Run this script as root." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

curl \
  --proto '=https' \
  --tlsv1.2 \
  --fail \
  --location \
  --silent \
  --show-error \
  "https://nodejs.org/dist/${NODE_VERSION}/${NODE_ARCHIVE}" \
  --output "${tmp_dir}/${NODE_ARCHIVE}"

printf '%s  %s\n' "${NODE_SHA256}" "${tmp_dir}/${NODE_ARCHIVE}" | sha256sum --check --status

if [[ ! -d "${NODE_DIR}" ]]; then
  tar --extract --xz --file "${tmp_dir}/${NODE_ARCHIVE}" --directory /opt
fi

ln --symbolic --force "${NODE_DIR}/bin/node" /usr/local/bin/node
ln --symbolic --force "${NODE_DIR}/bin/npm" /usr/local/bin/npm
ln --symbolic --force "${NODE_DIR}/bin/npx" /usr/local/bin/npx
ln --symbolic --force "${NODE_DIR}/bin/corepack" /usr/local/bin/corepack

if ! id maat >/dev/null 2>&1; then
  useradd \
    --system \
    --create-home \
    --home-dir "${STATE_DIR}" \
    --shell /usr/sbin/nologin \
    maat
fi

install --directory --owner maat --group maat --mode 0750 "${STATE_DIR}"

if [[ ! -e "${APP_DIR}" ]]; then
  git clone --branch main --single-branch --no-tags "${REPOSITORY}" "${APP_DIR}"
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  printf '%s\n' "${APP_DIR} exists but is not the expected Git repository." >&2
  exit 1
fi

actual_commit="$(git -C "${APP_DIR}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${REPOSITORY_COMMIT}" ]]; then
  printf 'Expected commit %s but found %s.\n' "${REPOSITORY_COMMIT}" "${actual_commit}" >&2
  exit 1
fi

printf 'Node: %s\n' "$(node --version)"
printf 'npm: %s\n' "$(npm --version)"
printf 'Repository: %s\n' "${actual_commit}"
printf 'Service user: %s\n' "$(id maat)"
