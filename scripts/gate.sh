#!/usr/bin/env bash
# Full quality gate (CLAUDE.md §12). Exits non-zero on the first failure.
# Usage: scripts/gate.sh [--no-e2e]
set -euo pipefail

cd "$(dirname "$0")/.."
run_e2e=1
[[ "${1:-}" == "--no-e2e" ]] && run_e2e=0

set -a
# shellcheck disable=SC1091
. ./.env
set +a
export TEST_DATABASE_URL="postgresql+psycopg://spektroskin:${POSTGRES_PASSWORD}@localhost:5432/spektroskin_test"

echo "== stack"
docker compose up -d --build --wait db api >/dev/null

echo "== backend: ruff, pytest"
(cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest -q)

echo "== mobile: tsc, web export"
(cd mobile && npx tsc --noEmit && npx expo export -p web >/dev/null)
rm -rf web-dist && cp -R mobile/dist web-dist
docker compose up -d --wait caddy >/dev/null

if (( run_e2e )); then
  echo "== e2e: playwright against http://localhost:8480"
  (cd mobile && npx playwright test)
fi

echo "== gate green"
