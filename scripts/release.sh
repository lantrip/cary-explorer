#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/git-common.sh
[ "$#" -eq 1 ] || fail 'Usage: scripts/release.sh vMAJOR.MINOR.PATCH'
version=$1
[[ "$version" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail 'Use a stable version such as v0.1.0 (no leading zeros).'
require_clean_dev
git fetch --no-tags origin dev
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/dev)" ] || fail 'Push dev to origin first; HEAD must exactly match origin/dev.'
if git show-ref --verify --quiet "refs/tags/$version"; then
    fail "Local tag $version already exists. Do not overwrite release tags."
fi
remote_tags=$(git ls-remote --tags --refs origin)
if printf '%s\n' "$remote_tags" | awk '{print $2}' | grep -Fxq "refs/tags/$version"; then
    fail "Remote tag $version already exists. Do not overwrite release tags."
fi
# Compare numerically without sort -V (unavailable in the default macOS tools).
printf '%s\n' "$remote_tags" | node --input-type=module -e '
import fs from "node:fs";
const parse = s => s.slice(1).split(".").map(BigInt);
const candidate = parse(process.argv[1]);
for (const line of fs.readFileSync(0, "utf8").split("\n")) {
  const tag = line.split("refs/tags/")[1];
  if (!tag || !/^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(tag)) continue;
  const previous = parse(tag);
  const i = candidate.findIndex((n, i) => n !== previous[i]);
  if (i < 0 || candidate[i] < previous[i]) {
    console.error(`Version must be newer than ${tag}.`); process.exit(1);
  }
}' "$version"
scripts/check.sh
require_clean_dev
git tag -a "$version" -m "Release $version"
if ! git push origin "refs/tags/$version"; then
    fail "Tag push failed; local $version remains. Inspect origin, then retry: git push origin refs/tags/$version"
fi
printf '%s\n' "Released $version. Monitor: https://github.com/lantrip/cary-explorer/actions"
