#!/usr/bin/env bash
# Deploy main to the VPS (CLAUDE.md §4, PLAN.md D18/M6). Refuses unless on a clean main with a green
# gate. The web export that the gate tested is shipped as-is; the API image builds on the VPS from
# the same pushed commit.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DEPLOY_HOST:-elang.zidan.dev}"
FALLBACK_HOST="elang-direct"
REMOTE_DIR='~/workspace/personal/spektroskin-proto'
PUBLIC_URL="https://spektroskin.zidan.dev"

die() { echo "deploy: $*" >&2; exit 1; }

[[ "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || die "not on main"
[[ -z "$(git status --porcelain)" ]] || die "working tree not clean"

echo "== gate"
scripts/gate.sh
[[ -z "$(git status --porcelain)" ]] || die "gate left the working tree dirty"
[[ -f mobile/dist/index.html ]] || die "no tested web export in mobile/dist"

echo "== push"
git push origin main
commit="$(git rev-parse HEAD)"

remote() { ssh -o BatchMode=yes -o ConnectTimeout=20 "$HOST" "$@"; }
if ! remote true 2>/dev/null; then
  echo "deploy: $HOST unreachable, retrying via $FALLBACK_HOST"
  HOST="$FALLBACK_HOST"
  remote true || die "VPS unreachable via both routes"
fi

echo "== pull $commit on $HOST"
remote "cd $REMOTE_DIR && git fetch --quiet origin && git checkout --quiet main && git pull --ff-only --quiet"
remote_commit="$(remote "cd $REMOTE_DIR && git rev-parse HEAD")"
[[ "$remote_commit" == "$commit" ]] || die "VPS is at $remote_commit, expected $commit"

echo "== ship tested web export"
# Copy into the existing directory: Caddy's bind mount follows the directory inode, so a rename
# would leave it serving the old files.
tar -C mobile/dist -czf - . | remote "cd $REMOTE_DIR && rm -rf web-dist.new && mkdir -p web-dist web-dist.new \
  && tar -xzf - -C web-dist.new && find web-dist -mindepth 1 -delete && cp -a web-dist.new/. web-dist/ \
  && rm -rf web-dist.new"

echo "== build and start stack"
remote "cd $REMOTE_DIR && docker compose -f docker-compose.yml up -d --build --wait"

echo "== users and seed"
scripts/provision.sh "$HOST" "$REMOTE_DIR"

echo "== verify $PUBLIC_URL"
for _ in $(seq 1 20); do
  [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC_URL/api/health")" == "200" ]] && break
  sleep 3
done
curl -sf --max-time 10 "$PUBLIC_URL/api/health" >/dev/null || die "public health check failed"
(cd backend && uv run python -m scripts.smoke --base "$PUBLIC_URL")
(cd mobile && E2E_BASE_URL="$PUBLIC_URL" npx playwright test)

echo "== deployed $commit to $PUBLIC_URL"
