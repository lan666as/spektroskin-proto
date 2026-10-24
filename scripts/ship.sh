#!/usr/bin/env bash
# Deploy (scripts/deploy.sh: gate, deploy, live smoke + full e2e incl. the PLAN §6 demo script)
# and, only if all of that passed, tag the deployed commit live-N and push the tag.
set -euo pipefail
cd "$(dirname "$0")/.."

scripts/deploy.sh
commit="$(git rev-parse HEAD)"
last="$(git tag -l 'live-*' | sed 's/live-//' | sort -n | tail -1)"
tag="live-$(( ${last:-0} + 1 ))"
git tag -a "$tag" "$commit" -m "Deployed and verified live at https://spektroskin.zidan.dev"
git push -q origin "$tag"
echo "== tagged $tag at $commit"
