#!/usr/bin/env bash
# Real temporary Git repositories; npm is stubbed to exercise release failures
# without reinstalling the application for every guard test.
set -euo pipefail
source_root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL="$work/gitconfig"
git config --global user.name 'Release script test'
git config --global user.email test@example.invalid
git config --global protocol.file.allow always
git config --global commit.gpgsign false
git config --global tag.gpgsign false
mkdir "$work/bin"
cat > "$work/bin/npm" <<'EOF'
#!/usr/bin/env bash
[ ! -f .fail-check ]
EOF
chmod +x "$work/bin/npm"
export PATH="$work/bin:$PATH"

setup() {
    case_root="$work/$1"
    mkdir "$case_root"
    git init -q --bare "$case_root/origin.git"
    git init -q --bare "$case_root/upstream.git"
    git init -q -b dev "$case_root/repo"
    cd "$case_root/repo"
    cp -R "$source_root/scripts" scripts
    printf 'base\n' > shared.txt
    printf '.fail-check\n' > .gitignore
    git add .
    git commit -qm base
    git remote add origin https://github.com/lantrip/cary-explorer.git
    git remote add upstream https://github.com/SAMEERSMR/cary-explorer.git
    git config url."$case_root/origin.git".insteadOf https://github.com/lantrip/cary-explorer.git
    git config url."$case_root/upstream.git".insteadOf https://github.com/SAMEERSMR/cary-explorer.git
    # remote get-url expands insteadOf. Wrap only that read; transport remains
    # real Git, redirected to isolated repositories and never to GitHub.
    real_git=$(command -v git)
    export REAL_GIT="$real_git"
    git push -q origin dev
    git push -q upstream dev
}

run_script() (
    # Bash function exported only to the child script, preserving production
    # remote validation while Git uses local transports for every other call.
    function git() {
        if [ "${1:-}" = remote ] && [ "${2:-}" = get-url ]; then
            local remote=${@: -1}
            "$REAL_GIT" config "remote.$remote.url"
        else
            "$REAL_GIT" "$@"
        fi
    }
    export -f git
    bash "$@" > "$case_root/output" 2>&1
)

reject() {
    local expected=$1
    shift
    if run_script "$@"; then echo "Unexpected success: $*" >&2; exit 1; fi
    grep -Fq "$expected" "$case_root/output" || { cat "$case_root/output"; exit 1; }
}

setup guards
reject 'Use a stable version' scripts/release.sh v01.0.0
printf dirty > untracked
reject 'Commit or stash' scripts/release.sh v0.1.0
reject 'Commit or stash' scripts/sync-upstream.sh
rm untracked
git switch -qc feature
reject 'Switch to dev' scripts/release.sh v0.1.0
git switch -q dev
printf change >> shared.txt
git commit -qam change
reject 'Push dev to origin first' scripts/release.sh v0.1.0
git push -q origin dev
touch .fail-check
reject '' scripts/release.sh v0.1.0
! git show-ref --verify --quiet refs/tags/v0.1.0
[ -z "$(git ls-remote --tags origin)" ]
rm .fail-check
run_script scripts/release.sh v0.1.0
git ls-remote --exit-code --tags origin refs/tags/v0.1.0 >/dev/null
reject 'Local tag v0.1.0 already exists' scripts/release.sh v0.1.0
git tag -d v0.1.0 >/dev/null
reject 'Remote tag v0.1.0 already exists' scripts/release.sh v0.1.0
reject 'Version must be newer' scripts/release.sh v0.0.9

setup sync
git clone -q -b dev "$case_root/upstream.git" "$case_root/author"
printf upstream > "$case_root/author/new.txt"
git -C "$case_root/author" add .
git -C "$case_root/author" commit -qm upstream
git -C "$case_root/author" tag v99.0.0
git -C "$case_root/author" push -q origin dev --tags
before=$(git ls-remote origin refs/heads/dev)
run_script scripts/sync-upstream.sh
[ -f new.txt ]
[ "$before" = "$(git ls-remote origin refs/heads/dev)" ]
! git show-ref --verify --quiet refs/tags/v99.0.0

setup conflict
git clone -q -b dev "$case_root/upstream.git" "$case_root/author"
printf upstream > "$case_root/author/shared.txt"
git -C "$case_root/author" commit -qam upstream
git -C "$case_root/author" push -q origin dev
printf fork > shared.txt
git commit -qam fork
git push -q origin dev
before=$(git ls-remote origin refs/heads/dev)
reject 'Upstream merge stopped' scripts/sync-upstream.sh
git rev-parse --verify MERGE_HEAD >/dev/null
[ "$before" = "$(git ls-remote origin refs/heads/dev)" ]
git merge --abort
printf '%s\n' 'Release and sync guard checks passed.'
