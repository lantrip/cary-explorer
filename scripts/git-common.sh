#!/usr/bin/env bash
# Shared by sync-upstream.sh and release.sh; do not execute directly.
fail() { printf '%s\n' "$*" >&2; exit 1; }

require_remote() {
    local remote=$1 repo=$2 url
    url=$(git remote get-url "$remote") || fail "Missing remote: $remote"
    case "$url" in
        "https://github.com/$repo"|"https://github.com/$repo.git"|"git@github.com:$repo.git"|"ssh://git@github.com/$repo.git") ;;
        *) fail "$remote must point to $repo (found $url)" ;;
    esac
    url=$(git remote get-url --push "$remote")
    case "$url" in
        "https://github.com/$repo"|"https://github.com/$repo.git"|"git@github.com:$repo.git"|"ssh://git@github.com/$repo.git") ;;
        *) fail "$remote push URL must point to $repo" ;;
    esac
}

require_clean_dev() {
    [ "$(git branch --show-current)" = dev ] || fail 'Switch to dev first.'
    [ -z "$(git status --porcelain)" ] || fail 'Commit or stash all changes first.'
    if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
        fail 'Finish or abort the current merge first.'
    fi
    require_remote origin lantrip/cary-explorer
}
