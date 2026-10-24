#!/usr/bin/env bash
# Create demo + smoke users (idempotent) and seed demo data in a running stack.
# Passwords flow Keychain → stdin → create_user; they never touch argv, files or logs.
#
#   scripts/provision.sh                 # local stack (docker compose on this Mac)
#   scripts/provision.sh <ssh-host> <dir> # remote stack, e.g. elang.zidan.dev ~/workspace/...
set -euo pipefail
cd "$(dirname "$0")/.."

host="${1:-}"
dir="${2:-}"

api_exec() {
  if [[ -z "$host" ]]; then
    docker compose exec -T api python "$@"
  else
    ssh -o BatchMode=yes "$host" "cd $dir && docker compose -f docker-compose.yml exec -T api python $(printf '%q ' "$@")"
  fi
}

keychain() {
  security find-generic-password -a "$1" -s "spektroskin-$2" -w
}

create() {
  local username=$1 role=$2 display=$3 item=$4
  shift 4
  keychain "$username" "$item" | api_exec -m scripts.create_user \
    --username "$username" --role "$role" --display-name "$display" --password-stdin "$@"
}

create clinician clinician "dr. Demo Clinician" demo-clinician
create dermatologist dermatologist "dr. Demo Dermatologist, Sp.D.V.E." demo-dermatologist
create smoke-clinician clinician "Smoke Test Clinician" smoke-clinician --test-user
create smoke-dermatologist dermatologist "Smoke Test Dermatologist" smoke-dermatologist --test-user
api_exec -m scripts.seed
