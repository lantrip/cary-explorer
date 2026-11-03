#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/git-common.sh
require_clean_dev
require_remote upstream SAMEERSMR/cary-explorer
git fetch --no-tags origin dev
git fetch --no-tags upstream dev
git merge --ff-only origin/dev
if ! git merge --no-edit upstream/dev; then
    fail 'Upstream merge stopped. Resolve and commit conflicts, then run scripts/check.sh; or use git merge --abort. Nothing was pushed.'
fi
scripts/check.sh
printf '%s\n' 'Sync passed. Review the merge, then run: git push origin dev'
