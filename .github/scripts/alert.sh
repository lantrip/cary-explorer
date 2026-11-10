#!/usr/bin/env bash
# Opens a GitHub issue, or comments on the existing open one with the same title and the `data-refresh` label.
# Needs: GH_TOKEN (GITHUB_TOKEN with issues: write), GH_REPO, ALERT_TITLE, ALERT_BODY_FILE.
set -euo pipefail
LABEL="data-refresh"
gh label create "$LABEL" --description "Data refresh and source freshness alerts" --color B60205 2>/dev/null || true
EXISTING="$(gh issue list --state open --label "$LABEL" --search "\"$ALERT_TITLE\" in:title" --json number,title \
  --jq "[.[] | select(.title == \"$ALERT_TITLE\")][0].number // empty")"
if [ -n "$EXISTING" ]; then
  gh issue comment "$EXISTING" --body-file "$ALERT_BODY_FILE"
  echo "Commented on issue #$EXISTING"
else
  gh issue create --title "$ALERT_TITLE" --label "$LABEL" --body-file "$ALERT_BODY_FILE"
fi
